/**
 * SIPARTA Relay Runner — CLI entrypoint
 * =====================================
 * Script ini dipanggil oleh FastAPI (Python) via subprocess.
 * Menerima argumen CLI dan mencetak hasil JSON ke stdout
 * agar Python bisa mem-parse hasilnya.
 *
 * Usage:
 *   npx tsx src/relay_runner.ts --action anchor --payload '{"incident_id":"uuid","ipfs_cid":"bafybeihash","classification":"bahaya","mics5524":2.1,"tgs2600":1.8,"mq2":3.0,"mq135":2.5}'
 *   npx tsx src/relay_runner.ts --action verify --uuid "abc-123-def"
 */

import { anchorIncident, verifyIncidentOnChain } from "./relay";
import { uploadJSONToIPFS } from "./pinataService";
import { randomUUID } from "crypto";

interface CLIArgs {
  action: "anchor" | "verify";
  payload?: string;
  uuid?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: Partial<CLIArgs> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace("--", "");
    const value = args[i + 1];
    (result as Record<string, string>)[key] = value;
  }

  return result as CLIArgs;
}

async function main() {
  const args = parseArgs();

  if (args.action === "anchor") {
    const payload = args.payload ? JSON.parse(args.payload) : {};

    const incidentUUID = payload.incident_id || randomUUID();

    // Untuk IPFS CID: gunakan dari payload jika tersedia.
    // Jika tidak ada, upload metadata ke Pinata IPFS untuk mendapatkan CID asli.
    let ipfsCid = payload.ipfs_cid;
    if (!ipfsCid) {
      try {
        const metadata = {
          incident_id: incidentUUID,
          classification: payload.classification || "unknown",
          sensor_data: {
            mics5524: payload.mics5524,
            tgs2600: payload.tgs2600,
            mq2: payload.mq2,
            mq135: payload.mq135,
          },
          image_url: payload.image_url || "",
          timestamp: new Date().toISOString()
        };
        
        ipfsCid = await uploadJSONToIPFS(metadata, `incident-${incidentUUID}.json`);
      } catch (uploadError: any) {
        console.log(JSON.stringify({
          txHash: null,
          blockNumber: 0,
          mode: "error",
          error: "IPFS Upload Failed: " + uploadError.message,
        }));
        process.exit(1);
      }
    }

    // Bangun sensorPayload untuk mode LEGACY (GasDetectionStorage)
    // Field ini diisi dari payload RPi; jika tidak ada, mode primary (SipartaAudit) tidak membutuhkannya
    const sensorPayload = (payload.classification && payload.mics5524 !== undefined)
      ? {
          classification: payload.classification as "aman" | "waspada" | "bahaya",
          mics5524: Number(payload.mics5524 || 0),
          tgs2600: Number(payload.tgs2600 || 0),
          mq2: Number(payload.mq2 || 0),
          mq135: Number(payload.mq135 || 0),
          imageUrl: payload.image_url || "",
        }
      : undefined;

    try {
      const result = await anchorIncident(incidentUUID, ipfsCid, sensorPayload);
      // Output JSON di baris terakhir agar Python bisa parse
      console.log(JSON.stringify(result));
    } catch (error: any) {
      console.log(JSON.stringify({
        txHash: null,
        blockNumber: 0,
        mode: "error",
        error: error.message,
      }));
      process.exit(1);
    }

  } else if (args.action === "verify") {
    const uuid = args.uuid || "";
    try {
      const verified = await verifyIncidentOnChain(uuid);
      console.log(JSON.stringify({ verified, uuid }));
    } catch (error: any) {
      console.log(JSON.stringify({ verified: false, error: error.message }));
      process.exit(1);
    }

  } else {
    console.error("Usage: --action [anchor|verify]");
    process.exit(1);
  }
}

main().catch(console.error);
