/**
 * Registers SWITCHBOARD as an agent in the ERC-8004 IdentityRegistry.
 * Run AFTER deploy.ts, using your personal (owner) wallet.
 *
 * Usage:
 *   cd packages/contracts
 *   npx hardhat run scripts/register.ts --network base
 */
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
// Try both cwd and hardcoded paths to handle any Hardhat CWD quirks
for (const p of [".env", "../.env"]) {
  dotenvConfig({ path: resolve(process.cwd(), p), override: false });
}

import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

const IDENTITY_REGISTRY = process.env.ERC8004_IDENTITY_REGISTRY
  ?? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

const REGISTRY_ABI = [
  "function registerAgent(string name, string description, string endpoint, string[] capabilities) external returns (uint256)",
  "function register(string name, string endpoint, string metadataURI) external returns (uint256)",
  "function agentOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
];

async function main() {
  const deployKey  = process.env.DEPLOY_PRIVATE_KEY;
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  const builderCode = process.env.BUILDER_CODE;

  if (!deployKey) {
    console.error("\n❌ DEPLOY_PRIVATE_KEY not found.\n");
    console.error("Add it to packages/contracts/.env:");
    console.error("  DEPLOY_PRIVATE_KEY=0x<tu_clave_privada>\n");
    console.error("Or export it in the shell before running:");
    console.error("  export DEPLOY_PRIVATE_KEY=0x<tu_clave_privada>");
    console.error("  npx hardhat run scripts/register.ts --network base\n");
    process.exit(1);
  }
  if (!agentWallet)  throw new Error("AGENT_WALLET_ADDRESS must be set in .env");

  // Read vault address from deploy output
  let vaultAddress = "";
  try {
    const dep = JSON.parse(
      readFileSync(join(__dirname, "../deployments/base.json"), "utf8"),
    ) as { address: string };
    vaultAddress = dep.address;
  } catch {
    console.warn("[register] deployments/base.json not found — continuing without vaultAddress");
  }

  // Build signer from DEPLOY_PRIVATE_KEY directly (bypasses hardhat accounts issue)
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const signer   = new ethers.Wallet(deployKey, provider);

  console.log("[register] Signing with:", signer.address);
  console.log("[register] Registry:    ", IDENTITY_REGISTRY);

  const registry = new ethers.Contract(IDENTITY_REGISTRY, REGISTRY_ABI, signer);

  const name         = "SWITCHBOARD";
  const description  = "Agent broker. Finds and pays ERC-8004 agents on your behalf. Powered by x402 + XMTP.";
  const endpoint     = `xmtp://${agentWallet}`;
  const capabilities = ["broker", "routing", "x402", "analysis", "price", "data"];

  const metadataObj = {
    name, description, endpoint, capabilities,
    vault: vaultAddress,
    builderCode: builderCode ?? "",
    version: "1.0.0",
  };
  const metadataURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadataObj)).toString("base64")}`;

  // Try Variant A first, fall back to Variant B
  let tx: any;
  try {
    console.log("[register] Trying registerAgent(name, description, endpoint, capabilities[])…");
    tx = await registry["registerAgent(string,string,string,string[])"](
      name, description, endpoint, capabilities,
    );
  } catch (e: any) {
    if (
      e.code === "CALL_EXCEPTION" ||
      e.code === "BAD_DATA" ||
      e.message?.includes("no matching function") ||
      e.message?.includes("could not decode")
    ) {
      console.log("[register] Variant A failed, trying register(name, endpoint, metadataURI)…");
      tx = await registry["register(string,string,string)"](name, endpoint, metadataURI);
    } else {
      throw e;
    }
  }

  console.log("[register] Tx submitted:", tx.hash);
  const receipt = await tx.wait();
  console.log("[register] Confirmed in block", receipt.blockNumber);

  try {
    const agentId = await registry["agentOf"](signer.address);
    console.log(`[register] ✓ SWITCHBOARD registered — agentId: ${agentId.toString()}`);
    console.log(`           Add ERC8004_AGENT_ID=${agentId.toString()} to agent .env`);
  } catch {
    console.log("[register] ✓ Registered. Check https://8004scan.io to confirm agentId.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
