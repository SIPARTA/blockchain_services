import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SipartaCertificate with admin:", deployer.address);

  const SipartaCertificate = await ethers.getContractFactory("SipartaCertificate");
  const contract = await SipartaCertificate.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ SipartaCertificate (SBT) deployed to:", address);
  console.log("   Salin address ini ke .env -> SIPARTA_CERTIFICATE_CONTRACT");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
