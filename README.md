# SIPARTA Blockchain Services

Direktori ini berisi infrastruktur *Smart Contracts* untuk mencatat (logging) insiden berbahaya secara *immutable* di Polygon Amoy Testnet. 

> [!IMPORTANT]  
> **Update Arsitektur Terbaru:** Kode relayer yang sebelumnya menggunakan Node.js (`src/relay.ts`) **telah dihentikan (deprecated)** dan dipindahkan sepenuhnya menjadi *Native Python* ke dalam *Backend* (`web_backend/fastapi/services/blockchain/`). Direktori `blockchain_services` saat ini difokuskan **hanya** untuk pengembangan, kompilasi (ABI), dan deployment Smart Contract menggunakan Hardhat.

## 1. Project Overview

SIPARTA menggunakan konsep Desentralisasi Parsial. Data insiden yang diproses dari perangkat Edge dan Gemini AI harus diabadikan agar tidak dapat dihapus/diubah. Modul ini bertanggung jawab:
- Melakukan kompilasi dan *deployment* Smart Contract (SipartaAudit) berbasis Solidity.
- Menghasilkan file ABI yang kemudian digunakan oleh backend FastAPI untuk berinteraksi dengan blockchain Polygon.

## 2. Architecture Overview

- **Smart Contract Framework**: Hardhat
- **Network**: Polygon Amoy (Testnet)
- **Language**: Solidity
- **Node Environment**: Node.js 20+ (Hanya untuk skrip deployment Hardhat)

## 3. Prerequisites

- **Node.js 20+**
- Saldo **MATIC (Amoy Testnet)** pada dompet (Wallet) yang akan dijadikan *Deployer*. Anda bisa mendapatkan token *faucet* gratis dari situs resmi Polygon.

## 4. Environment Configuration

Salin file contoh env:
```bash
cp .env.example .env
```

Lengkapi kredensial berikut:
- `RELAYER_PRIVATE_KEY` = Kunci privat dompet Anda (tanpa awalan `0x`) yang digunakan untuk melakukan *deploy* Smart Contract.
- `POLYGON_AMOY_RPC_URL` = URL Node RPC (Bawaan: `https://polygon-amoy.drpc.org`).

*(Catatan: Konfigurasi seperti PINATA_JWT atau integrasi blockchain harian sekarang diatur langsung dari `.env` di dalam `web_backend`)*.

## 5. Installation & Setup

Buka terminal di dalam direktori `blockchain_services`:
```bash
npm install
```

## 6. Smart Contract Deployment

Untuk meluncurkan kontrak penyimpanan data audit (SipartaAudit) baru ke Polygon Amoy:
```bash
npm run deploy:audit
```
Setelah proses selesai, terminal akan mencetak alamat *Contract Address*. Salin alamat tersebut dan masukkan ke dalam file `.env` di **backend** (`web_backend/.env`):
`SIPARTA_AUDIT_CONTRACT=0x...`

## 7. Integrasi dengan Backend Python

File ABI dari kontrak ini (`siparta_audit_abi.json`) telah disalin ke dalam direktori `web_backend/fastapi/services/blockchain/`. Jika Anda melakukan perubahan pada *Smart Contract* Solidity, pastikan untuk mengompilasinya ulang dan menyalin file ABI yang baru ke backend agar terhubung sempurna.

## 8. Troubleshooting

- **Symptom**: Transaksi Reverted (Insufficient Funds) saat Deploy.
  - **Penyebab**: Wallet yang ada pada `RELAYER_PRIVATE_KEY` kehabisan saldo MATIC testnet.
  - **Solusi**: Isi ulang melalui Amoy Faucet.
- **Symptom**: Hardhat gagal kompilasi.
  - **Penyebab**: `node_modules` belum ada atau versi Node tidak didukung.
  - **Solusi**: Pastikan Anda sudah menjalankan `npm install` dengan Node 20+.