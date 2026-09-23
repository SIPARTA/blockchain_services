"""Background blockchain submission worker.

The GUI thread never performs network I/O — detections are pushed onto
a queue consumed by a daemon thread, so a slow or dead Polygon RPC can
never freeze the dashboard.  Every failure degrades to a log entry and
an ``on_result`` callback; monitoring continues regardless.
"""

from __future__ import annotations

import logging
import queue
import threading
from typing import Any, Callable, Dict, Optional

from blockchain_services.config import BlockchainConfig
from blockchain_services.polygon_client import (
    BlockchainError,
    PolygonAmoyClient,
)

logger = logging.getLogger(__name__)

TAG = "[BLOCKCHAIN]"

# on_result(record_copy, result_dict) — invoked from the worker thread.
ResultCallback = Callable[[Dict[str, Any], Dict[str, Any]], None]


class BlockchainService:
    """Singleton queue consumer owning the only :class:`PolygonAmoyClient`."""

    _instance: Optional["BlockchainService"] = None
    _instance_lock = threading.Lock()

    @classmethod
    def instance(cls) -> "BlockchainService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def __init__(self) -> None:
        self._cfg = BlockchainConfig.load()
        self._client: Optional[PolygonAmoyClient] = None
        self._queue: "queue.Queue[tuple[dict, Optional[ResultCallback]]]" = (
            queue.Queue()
        )
        self._thread: Optional[threading.Thread] = None
        self._start_lock = threading.Lock()

    # -- public api ------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return self._cfg.enabled

    @property
    def config(self) -> BlockchainConfig:
        return self._cfg

    def start(self) -> None:
        """Spawn the daemon worker (no-op when disabled / already running)."""
        if not self._cfg.enabled:
            logger.info(
                "%s Disabled via BLOCKCHAIN_ENABLED — no transactions will "
                "be sent", TAG,
            )
            return
        with self._start_lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._thread = threading.Thread(
                target=self._worker_loop,
                name="blockchain-worker",
                daemon=True,
            )
            self._thread.start()
            logger.info("%s Background worker started", TAG)

    def submit(
        self, record: dict[str, Any], on_result: Optional[ResultCallback] = None,
    ) -> bool:
        """Enqueue one detection for asynchronous submission.

        Returns False (and never raises) when the service is disabled.
        """
        if not self._cfg.enabled:
            return False
        snapshot = dict(record)  # caller may mutate its copy afterwards
        self._queue.put((snapshot, on_result))
        return True

    # -- internals -------------------------------------------------------

    def _worker_loop(self) -> None:
        while True:
            record, callback = self._queue.get()
            result = self._process(record)
            if callback is not None:
                try:
                    callback(record, result)
                except Exception:  # noqa: BLE001 - callbacks must not kill us
                    logger.exception("%s Result callback crashed", TAG)
            self._queue.task_done()

    def _process(self, record: dict[str, Any]) -> Dict[str, Any]:
        failure = self._attempt_send(record)
        if failure is None:
            return {"status": "success"}
        # force a fresh connection attempt on the next submission so a
        # recovered RPC / new nonce state is picked up automatically
        self._client = None
        return {
            "status": "failed",
            "error": failure,
            "transaction_hash": None,
            "block_number": None,
            "record_id": None,
        }

    def _attempt_send(self, record: dict[str, Any]) -> Optional[str]:
        """Return None on success or a human-readable failure reason."""
        try:
            if self._client is None:
                self._client = PolygonAmoyClient(self._cfg)
            self._client.send_sensor_data(record)
            return None
        except BlockchainError as exc:
            # expected failure categories — concise log, no traceback spam
            logger.error("%s Submission failed: %s", TAG, exc)
            return str(exc)
        except Exception:  # noqa: BLE001 - unexpected → full traceback
            logger.exception("%s Unexpected submission error", TAG)
            return "unexpected error (see app log)"
