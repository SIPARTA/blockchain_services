import dotenv from 'dotenv';
dotenv.config();

/**
 * Service to interact with Pinata IPFS API
 * Uses native Node.js fetch API.
 */

const PINATA_JWT = process.env.PINATA_JWT;

/**
 * Uploads a JSON object to Pinata IPFS
 * @param metadata JSON object containing the metadata
 * @param name Optional name for the file in Pinata
 * @returns The IPFS CID of the uploaded JSON
 */
export async function uploadJSONToIPFS(metadata: Record<string, any>, name: string = 'siparta-incident-metadata.json'): Promise<string> {
    if (!PINATA_JWT) {
        throw new Error("PINATA_JWT is not defined in environment variables.");
    }

    const payload = {
        pinataOptions: {
            cidVersion: 1
        },
        pinataMetadata: {
            name: name,
        },
        pinataContent: metadata
    };

    try {
        const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PINATA_JWT}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Pinata API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        
        // Ensure data has IpfsHash
        if (!data.IpfsHash) {
            throw new Error("Invalid response from Pinata: missing IpfsHash");
        }

        return data.IpfsHash;
    } catch (error) {
        console.error("Failed to upload JSON to IPFS via Pinata:", error);
        throw error;
    }
}
