# SIPARTA Blockchain Services

Direktori ini berisi infrastruktur Web3 (Smart Contracts, Relayer Scripts, Pinata IPFS) untuk mencatat (logging) insiden berbahaya secara *immutable* di Polygon Amoy Testnet.

## 1. Project Overview

SIPARTA menggunakan konsep Desentralisasi Parsial. Data insiden yang diproses dari perangkat Edge dan Gemini AI harus diabadikan agar tidak dapat dihapus/diubah. Modul ini bertanggung jawab:
- Melakukan kompilasi dan _deployment_ Smart Contract (berbasis Solidity).
- Menyediakan utilitas *Relayer* (`src/relay.ts`) yang memungkinkan perangkat IoT melakukan pencatatan on-chain tanpa perlu membayarkan *gas fee* (Gasless Meta-transaction) dari dompet pengguna akhir. Semua *gas fee* dibayar oleh `RELAYER_PRIVATE_KEY` di _backend_.

## 2. Architecture Overview

- **Smart Contract Framework**: Hardhat
- **Script Language**: TypeScript / Node.js
- **Network**: Polygon Amoy (Testnet)
- **Decentralized Storage (Opsional)**: IPFS via Pinata SDK
- **Provider / Web3 SDK**: Ethers.js & Thirdweb SDK v5

## 3. Prerequisites

- **Node.js 20+**
- Saldo **MATIC (Amoy Testnet)** pada dompet (Wallet) yang akan dijadikan *Relayer*. Anda bisa mendapatkan token *faucet* gratis dari situs resmi Polygon.

## 4. Environment Configuration

Salin file contoh env:
```bash
cp .env.example .env
```

Lengkapi kredensial berikut (Jangan membagikan `.env` ini!):
- `RELAYER_PRIVATE_KEY` = Kunci privat dompet Anda tanpa awalan `0x`.
- `POLYGON_AMOY_RPC_URL` = URL Node RPC (Bawaan: `https://polygon-amoy.drpc.org`).
- `PINATA_JWT` = Token dari [app.pinata.cloud](https://app.pinata.cloud/developers) untuk mengunggah gambar.
- Kunci `THIRDWEB_*` = Hanya diperlukan jika Anda beralih menggunakan *Thirdweb Engine Backend*. Saat ini skrip relayer default menggunakan koneksi _Direct Ethers/Thirdweb_.

## 5. Installation & Setup

Buka terminal di dalam direktori `blockchain_services`:
```bash
npm install
```

## 6. Smart Contract Deployment

Untuk meluncurkan kontrak penyimpanan data audit baru ke Polygon Amoy:
```bash
npm run deploy:audit
```
Setelah proses selesai, terminal akan mencetak alamat *Contract Address*. Salin alamat tersebut dan masukkan ke dalam file `.env`:
`SIPARTA_AUDIT_CONTRACT=0x...`

Anda juga dapat melakukan hal yang sama untuk sertifikat (opsional):
```bash
npm run deploy:certificate
```

## 7. Integration (Relay Script)

File inti pada modul ini adalah `src/relay.ts`.
Script ini **tidak dijalankan secara manual** melainkan di-_spawn_ oleh *Backend FastAPI* melalui argumen CLI string JSON.
Backend memanggil:
```bash
npx ts-node src/relay.ts '{"status":"BAHAYA", "message":"...", "image_b64":"..."}'
```

Skrip Typescript ini akan:
1. Mengunggah Base64 Image ke Pinata IPFS (jika ada).
2. Membentuk metadata JSON standar NFT.
3. Menandatangani dan mengirim transaksi (write) ke Polygon Amoy via Thirdweb Provider / Ethers.
4. Mengembalikan output terminal `{"txHash": "0x...", "ipfsUrl": "..."}` yang kemudian di-*parse* oleh Python FastAPI.

## 8. Troubleshooting

- **Symptom**: Transaksi Reverted (Insufficient Funds).
  - **Penyebab**: Wallet yang ada pada `RELAYER_PRIVATE_KEY` kehabisan saldo MATIC testnet.
  - **Solusi**: Isi ulang melalui Amoy Faucet, lalu pastikan RPC berfungsi dengan baik.
- **Symptom**: Backend FastAPI *stuck/timeout* saat *saving to web3*.
  - **Penyebab**: Node.js gagal mengeksekusi `relay.ts` (mungkin `ts-node` tidak ditemukan atau *path* tidak valid).
  - **Solusi**: Pastikan `npm install` berhasil di folder `blockchain_services`.