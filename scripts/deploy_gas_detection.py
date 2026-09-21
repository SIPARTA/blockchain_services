"""Compile and deploy GasDetectionStorage to Polygon Amoy.

Usage::

    python scripts/deploy_contract.py

Requires ``POLYGON_AMOY_RPC_URL`` and ``POLYGON_AMOY_PRIVATE_KEY`` in
the environment or in a ``.env`` file at the project root.  On success
the contract address, transaction hash and ABI are written to
``blockchain/deployed.json`` (safe to commit — no secrets).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from blockchain.config import BlockchainConfig  # noqa: E402
from blockchain.polygon_client import (  # noqa: E402
    InsufficientFundsError,
    InvalidPrivateKeyError,
    InvalidContractError,
    build_web3,
    prepare_fee_fields,
)
from eth_account import Account  # noqa: E402
from web3 import Web3  # noqa: E402

TAG = "[DEPLOY]"

CONTRACT_FILE = PROJECT_ROOT / "contracts" / "GasDetectionStorage.sol"
OUTPUT_FILE = PROJECT_ROOT / "blockchain" / "deployed.json"
SOLC_VERSION = "0.8.20"


def compile_contract() -> tuple[list, str]:
    """Compile the Solidity source → (abi, bytecode)."""
    try:
        import solcx
    except ImportError as exc:
        raise SystemExit(
            "py-solc-x is not installed. Run:\n"
            "    pip install py-solc-x\n"
            "or deploy via Remix instead (see docs/BLOCKCHAIN.md)."
        ) from exc

    installed = {str(v) for v in solcx.get_installed_solc_versions()}
    if SOLC_VERSION not in installed:
        print(f"[DEPLOY] Installing solc {SOLC_VERSION} (one-time download)...")
        solcx.install_solc(SOLC_VERSION)

    result = solcx.compile_files(
        [str(CONTRACT_FILE)],
        output_values=["abi", "bin"],
        solc_version=SOLC_VERSION,
        optimize=True,
        optimize_runs=200,
    )
    key = next(k for k in result if k.endswith("GasDetectionStorage"))
    return result[key]["abi"], result[key]["bin"]


def main() -> None:
    cfg = BlockchainConfig.load()
    if not cfg.rpc_url or not cfg.private_key:
        raise SystemExit(
            "[DEPLOY] Set POLYGON_AMOY_RPC_URL and POLYGON_AMOY_PRIVATE_KEY "
            "in .env first."
        )

    abi, bytecode = compile_contract()
    print(f"[DEPLOY] Compiled {CONTRACT_FILE.name} ({len(bytecode) // 2} bytes)")

    w3 = build_web3(cfg.rpc_url, cfg.request_timeout_s)
    if not w3.is_connected():
        raise SystemExit(f"{TAG} RPC unreachable — check POLYGON_AMOY_RPC_URL")

    reported_chain = w3.eth.chain_id
    if reported_chain != cfg.chain_id:
        raise SystemExit(
            f"[DEPLOY] Wrong network: chain {reported_chain}, expected "
            f"{cfg.chain_id} (Polygon Amoy)"
        )

    try:
        account = Account.from_key(cfg.private_key)
    except (TypeError, ValueError) as exc:
        raise InvalidPrivateKeyError(
            "private key is invalid"
        ) from exc

    balance = w3.eth.get_balance(account.address)
    if balance == 0:
        raise InsufficientFundsError(
            f"wallet {account.address} has no testnet POL — use a faucet "
            f"(see docs/BLOCKCHAIN.md)"
        )
    print(f"[DEPLOY] Wallet: {account.address}")
    print(f"[DEPLOY] Balance: {Web3.from_wei(balance, 'ether')} POL")
    print("[DEPLOY] Deploying GasDetectionStorage...")

    gas = int(w3.eth.estimate_gas({
        "from": account.address,
        "data": bytecode,
    }) * 1.2)  # constructor headroom

    fee_fields = prepare_fee_fields(w3)
    max_fee = fee_fields.get("maxFeePerGas", fee_fields.get("gasPrice", 0))
    tx_cost = gas * max_fee
    if balance < tx_cost:
        raise InsufficientFundsError(
            f"wallet has {Web3.from_wei(balance, 'ether')} POL but "
            f"deployment needs ~{Web3.from_wei(tx_cost, 'ether')} POL — "
            f"use a faucet (see docs/BLOCKCHAIN.md)"
        )

    tx = {
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "data": bytecode,
        "gas": gas,
        "chainId": cfg.chain_id,
        **fee_fields,
    }
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
    tx_hash = w3.eth.send_raw_transaction(raw)
    print(f"[DEPLOY] Transaction submitted: {tx_hash.hex()}")

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
    if receipt.get("status") != 1:
        raise SystemExit("[DEPLOY] Deployment reverted on-chain")
    contract_address = receipt["contractAddress"]
    print(f"[DEPLOY] Confirmed in block {receipt['blockNumber']}")
    print(f"[DEPLOY] Contract address: {contract_address}")

    code = w3.eth.get_code(Web3.to_checksum_address(contract_address))
    if len(code) == 0:
        raise SystemExit(
            f"[DEPLOY] FATAL: deployment succeeded but eth_getCode() is empty "
            f"at {contract_address} — something went wrong on-chain"
        )
    print(f"[DEPLOY] Runtime bytecode verified: {len(code)} bytes")

    OUTPUT_FILE.write_text(json.dumps({
        "contract": "GasDetectionStorage",
        "address": Web3.to_checksum_address(contract_address),
        "transaction_hash": tx_hash.hex(),
        "block_number": int(receipt["blockNumber"]),
        "chain_id": cfg.chain_id,
        "owner": account.address,
        "deployed_at_unix": int(time.time()),
    }, indent=2), encoding="utf-8")
    print(f"[DEPLOY] Saved deployment info to {OUTPUT_FILE.relative_to(PROJECT_ROOT)}")
    print(
        "\nNext steps:\n"
        f"  1. Put POLYGON_AMOY_CONTRACT_ADDRESS={Web3.to_checksum_address(contract_address)}\n"
        "     into your .env\n"
        "  2. Set BLOCKCHAIN_ENABLED=true\n"
        "  3. Run the live test: python tests/test_blockchain.py"
    )


if __name__ == "__main__":
    main()
