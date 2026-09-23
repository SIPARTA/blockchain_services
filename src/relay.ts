/**
 * SIPARTA Blockchain Relay Service
 * =================================
 * Modul ini adalah JEMBATAN antara FastAPI Backend dan Polygon Amoy.
 *
 * Alur (sesuai architecture_design.md Section 8):
 *   FastAPI (Python) → HTTP POST → relay.ts → ethers.js → Polygon Amoy
 *
 * Mengapa TypeScript/Node.js terpisah dari Python?
 *   - Ekosistem Web3 di JS/TS (ethers, viem, thirdweb) jauh lebih mature
 *     dan mendapat update lebih cepat dari Polygon/EVM tooling.
 *   - Memisahkan concern: Python fokus AI/ML, TS fokus blockchain.
 *   - Bisa di-deploy independen sebagai microservice di Render.
 *
 * Strategi Kontrak (Dual Mode):
 *   - PRIMARY : SipartaAudit.sol  — hanya menyimpan bytes32 hash + IPFS CID (hemat gas, sesuai blueprint).
 *   - LEGACY  : GasDetectionStorage.sol — menyimpan data sensor mentah (sudah live di Amoy, digunakan siparta_device).
 *   Mode dipilih otomatis berdasarkan env var yang tersedia.
 */

import { ethers } from "ethers";
import "dotenv/config";

// ============================================================
// ABI — SipartaAudit (kontrak utama, sesuai blueprint)
// ============================================================

const AUDIT_ABI = [
  "function logIncident(bytes32 incidentId, string ipfsCid) external",
  "function verifyIncident(bytes32 incidentId) external view returns (bool)",
  "function totalIncidents() external view returns (uint256)",
  "event IncidentLogged(bytes32 indexed incidentId, string ipfsCid, uint256 timestamp, address indexed relayer)",
];

// ============================================================
// ABI — GasDetectionStorage (legacy, sudah live di Polygon Amoy)
// Referensi: blockchain_services/artifacts/GasDetectionStorage.abi.json
// ============================================================

const GAS_DETECTION_ABI = [
  "function addData(uint256 timestamp, uint256 mics5524, uint256 tgs2600, uint256 mq2, uint256 mq135, string classification, string imageUrl) external returns (uint256 id)",
  "function getData(uint256 id) external view returns (tuple(uint256 timestamp, uint256 mics5524, uint256 tgs2600, uint256 mq2, uint256 mq135, string classification, string imageUrl))",
  "function getTotalData() external view returns (uint256)",
  "event DataStored(uint256 indexed id, uint256 timestamp, uint256 mics5524, uint256 tgs2600, uint256 mq2, uint256 mq135, string classification, string imageUrl)",
];

const CERTIFICATE_ABI = [
  "function issueCertificate(address student, uint256 courseId, string metadataURI) external returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)",
  "event CertificateIssued(uint256 indexed tokenId, address indexed student, uint256 courseId, uint256 timestamp)",
];

// ============================================================
// KONFIGURASI
// ============================================================

const RPC_URL = process.env.POLYGON_AMOY_RPC_URL || "https://polygon-amoy.drpc.org";
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const AUDIT_ADDRESS = process.env.SIPARTA_AUDIT_CONTRACT;
const GAS_DETECTION_ADDRESS = process.env.GAS_DETECTION_CONTRACT;
const CERTIFICATE_ADDRESS = process.env.SIPARTA_CERTIFICATE_CONTRACT;

// Mode deteksi: primary (SipartaAudit) atau legacy (GasDetectionStorage)
const USE_LEGACY_CONTRACT = !AUDIT_ADDRESS && !!GAS_DETECTION_ADDRESS;

// ============================================================
// PROVIDER & SIGNER (Relayer Wallet)
// ============================================================

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function getRelayerSigner(): ethers.Wallet {
  if (!PRIVATE_KEY) {
    throw new Error("RELAYER_PRIVATE_KEY belum diset di .env");
  }
  return new ethers.Wallet(PRIVATE_KEY, getProvider());
}

// ============================================================
// CONTRACT INSTANCES
// ============================================================

function getAuditContract(): ethers.Contract {
  if (!AUDIT_ADDRESS) throw new Error("SIPARTA_AUDIT_CONTRACT belum diset di .env");
  return new ethers.Contract(AUDIT_ADDRESS, AUDIT_ABI, getRelayerSigner());
}

function getGasDetectionContract(): ethers.Contract {
  if (!GAS_DETECTION_ADDRESS) throw new Error("GAS_DETECTION_CONTRACT belum diset di .env");
  return new ethers.Contract(GAS_DETECTION_ADDRESS, GAS_DETECTION_ABI, getRelayerSigner());
}

function getCertificateContract(): ethers.Contract {
  if (!CERTIFICATE_ADDRESS) throw new Error("SIPARTA_CERTIFICATE_CONTRACT belum diset di .env");
  return new ethers.Contract(CERTIFICATE_ADDRESS, CERTIFICATE_ABI, getRelayerSigner());
}

// ============================================================
// EXPORTED FUNCTIONS
// ============================================================

/**
 * Mencatat insiden kritikal ke blockchain Polygon Amoy.
 *
 * MODE PRIMARY (SipartaAudit):
 *   - Memerlukan SIPARTA_AUDIT_CONTRACT di .env
 *   - Menyimpan hanya hash incidentId dan ipfsCid (hemat gas)
 *
 * MODE LEGACY (GasDetectionStorage — fallback jika SipartaAudit belum di-deploy):
 *   - Memerlukan GAS_DETECTION_CONTRACT di .env
 *   - Menyimpan data sensor mentah langsung ke chain
 *   - sensorPayload wajib diisi jika mode LEGACY aktif
 *
 * @param incidentUUID   UUID insiden dari tabel incident_events (PostgreSQL).
 * @param ipfsCid        CID metadata insiden yang sudah diupload ke IPFS/Pinata.
 * @param sensorPayload  (Opsional) Data sensor mentah; wajib jika mode LEGACY aktif.
 */
export async function anchorIncident(
  incidentUUID: string,
  ipfsCid: string,
  sensorPayload?: {
    classification: "aman" | "waspada" | "bahaya";
    mics5524: number;
    tgs2600: number;
    mq2: number;
    mq135: number;
    imageUrl?: string;
  }
): Promise<{ txHash: string; blockNumber: number; mode: "primary" | "legacy" }> {
  if (USE_LEGACY_CONTRACT) {
    // ── LEGACY MODE ───────────────────────────────────────────────────────
    if (!sensorPayload) {
      throw new Error("[RELAY] sensorPayload wajib diisi saat mode LEGACY (GasDetectionStorage).");
    }
    console.log(`[RELAY] Mode LEGACY: Menggunakan GasDetectionStorage (${GAS_DETECTION_ADDRESS})`);
    const contract = getGasDetectionContract();
    const ts = Math.floor(Date.now() / 1000);
    const tx = await contract.addData(
      ts,
      Math.round(sensorPayload.mics5524 * 100),  // unit integer (x100 untuk presisi)
      Math.round(sensorPayload.tgs2600 * 100),
      Math.round(sensorPayload.mq2 * 100),
      Math.round(sensorPayload.mq135 * 100),
      sensorPayload.classification,
      sensorPayload.imageUrl || ipfsCid,
    );
    console.log(`[RELAY] Tx Hash: ${tx.hash} — Menunggu konfirmasi...`);
    const receipt = await tx.wait(1);
    console.log(`[RELAY] (LEGACY) Terkonfirmasi di block #${receipt.blockNumber}`);
    return { txHash: tx.hash, blockNumber: receipt.blockNumber, mode: "legacy" };
  }

  // ── PRIMARY MODE ──────────────────────────────────────────────────────
  const contract = getAuditContract();
  const incidentId = ethers.keccak256(ethers.toUtf8Bytes(incidentUUID));

  console.log(`[RELAY] Mode PRIMARY: Menggunakan SipartaAudit (${AUDIT_ADDRESS})`);
  console.log(`  incidentId (bytes32): ${incidentId}`);
  console.log(`  ipfsCid: ${ipfsCid}`);

  const tx = await contract.logIncident(incidentId, ipfsCid);
  console.log(`[RELAY] Tx Hash: ${tx.hash} — Menunggu konfirmasi...`);
  const receipt = await tx.wait(1);
  console.log(`[RELAY] Terkonfirmasi di block #${receipt.blockNumber}`);

  return { txHash: tx.hash, blockNumber: receipt.blockNumber, mode: "primary" };
}

/**
 * Menerbitkan Soulbound Token (SBT) sertifikat edukasi K3.
 *
 * @param studentAddress Wallet address mahasiswa (dari Metamask/SIWE).
 * @param courseId       ID kursus/modul K3 yang telah lulus.
 * @param metadataURI    IPFS URI berisi detail sertifikat.
 */
export async function issueSBTCertificate(
  studentAddress: string,
  courseId: number,
  metadataURI: string
): Promise<{ txHash: string; tokenId: number }> {
  const contract = getCertificateContract();

  console.log(`[RELAY] Menerbitkan SBT Certificate ke ${studentAddress}...`);

  const tx = await contract.issueCertificate(studentAddress, courseId, metadataURI);
  const receipt = await tx.wait(1);

  const iface = new ethers.Interface(CERTIFICATE_ABI);
  const log = receipt.logs.find((l: ethers.Log) => {
    try { iface.parseLog(l); return true; } catch { return false; }
  });

  let tokenId = 0;
  if (log) {
    const parsed = iface.parseLog(log);
    tokenId = Number(parsed?.args[0] || 0);
  }

  console.log(`[RELAY] SBT Token #${tokenId} diterbitkan di block #${receipt.blockNumber}`);
  return { txHash: tx.hash, tokenId };
}

/**
 * Verifikasi apakah insiden sudah tercatat di blockchain.
 * Bisa dipanggil dari Frontend via Backend (read-only, tanpa gas fee).
 *
 * @param incidentUUID UUID insiden dari database.
 */
export async function verifyIncidentOnChain(incidentUUID: string): Promise<boolean> {
  if (USE_LEGACY_CONTRACT) {
    // Legacy contract tidak memiliki verifikasi berdasarkan UUID
    console.log("[RELAY] Verifikasi tidak didukung di mode LEGACY — gunakan SipartaAudit.");
    return false;
  }
  const contract = getAuditContract();
  const incidentId = ethers.keccak256(ethers.toUtf8Bytes(incidentUUID));
  return await contract.verifyIncident(incidentId);
}

/**
 * Mengambil total insiden yang tercatat di blockchain.
 */
export async function getTotalOnChainIncidents(): Promise<number> {
  if (USE_LEGACY_CONTRACT) {
    const contract = getGasDetectionContract();
    return Number(await contract.getTotalData());
  }
  const contract = getAuditContract();
  return Number(await contract.totalIncidents());
}

// ============================================================
// SELF-TEST (Jalankan: npx tsx src/relay.ts)
// ============================================================

async function selfTest() {
  console.log("============================================");
  console.log("  SIPARTA Blockchain Relay — Self Test");
  console.log("============================================");
  console.log(`Mode: ${USE_LEGACY_CONTRACT ? "LEGACY (GasDetectionStorage)" : "PRIMARY (SipartaAudit)"}`);

  const provider = getProvider();
  const network = await provider.getNetwork();
  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);

  if (PRIVATE_KEY) {
    const signer = getRelayerSigner();
    const balance = await provider.getBalance(signer.address);
    console.log(`Relayer: ${signer.address}`);
    console.log(`Balance: ${ethers.formatEther(balance)} POL`);
  } else {
    console.log("RELAYER_PRIVATE_KEY belum diset. Skipping wallet check.");
  }

  if (AUDIT_ADDRESS || GAS_DETECTION_ADDRESS) {
    const total = await getTotalOnChainIncidents();
    console.log(`Total insiden on-chain: ${total}`);
  } else {
    console.log("Tidak ada contract address yang diset. Skipping contract check.");
  }

  console.log("\nSelf test selesai.");
}

const isDirectRun = process.argv[1]?.includes("relay");
if (isDirectRun) {
  selfTest().catch(console.error);
}
