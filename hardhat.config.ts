import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const DEPLOYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const POLYGON_AMOY_RPC = process.env.POLYGON_AMOY_RPC_URL || "https://polygon-amoy.drpc.org";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    amoy: {
      url: POLYGON_AMOY_RPC,
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 80002,
    },
    hardhat: {
      chainId: 31337,
    },
  },
};

export default config;
