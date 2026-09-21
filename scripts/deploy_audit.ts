import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SipartaAudit with relayer:", deployer.address);

  const SipartaAudit = await ethers.getContractFactory("SipartaAudit");
  const contract = await SipartaAudit.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ SipartaAudit deployed to:", address);
  console.log("   Salin address ini ke .env -> SIPARTA_AUDIT_CONTRACT");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
