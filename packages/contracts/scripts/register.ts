/**
 * Registers SWITCHBOARD in the ERC-8004 IdentityRegistry (Base mainnet).
 * The registry is an ERC-721: each agent is an NFT minted via register(agentURI).
 *
 * Usage:
 *   cd packages/contracts
 *   npx hardhat run scripts/register.ts --network base
 */
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
for (const p of [".env", "../.env"]) {
  dotenvConfig({ path: resolve(process.cwd(), p), override: false });
}

import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

const IDENTITY_REGISTRY = process.env.ERC8004_IDENTITY_REGISTRY
  ?? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

// Real ABI from implementation 0x7274e874CA62410a93Bd8bf61c69d8045E399c02
const REGISTRY_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "event Registered(uint256 agentId, string agentURI, address owner)",
];

async function main() {
  const deployKey   = process.env.DEPLOY_PRIVATE_KEY;
  const agentWallet = process.env.AGENT_WALLET_ADDRESS;
  const builderCode = process.env.BUILDER_CODE;

  if (!deployKey) {
    console.error("\n❌ DEPLOY_PRIVATE_KEY not found.\n");
    console.error("Añade tu clave privada en packages/contracts/.env:");
    console.error("  DEPLOY_PRIVATE_KEY=0x<tu_clave_privada>\n");
    process.exit(1);
  }
  if (!agentWallet) {
    console.error("❌ AGENT_WALLET_ADDRESS must be set in .env");
    process.exit(1);
  }

  // Read vault address from deploy output
  let vaultAddress = "";
  try {
    const dep = JSON.parse(
      readFileSync(join(__dirname, "../deployments/base.json"), "utf8"),
    ) as { address: string };
    vaultAddress = dep.address;
  } catch {
    console.warn("[register] deployments/base.json not found — continuing");
  }

  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const signer   = new ethers.Wallet(deployKey, provider);

  console.log("[register] Owner wallet:", signer.address);
  console.log("[register] Registry:    ", IDENTITY_REGISTRY);

  // Build metadata JSON for the agentURI
  const metadata = {
    name:         "SWITCHBOARD",
    description:  "Agent broker. Finds and pays ERC-8004 agents on your behalf. Powered by x402 + XMTP.",
    endpoint:     `xmtp://${agentWallet}`,
    capabilities: ["broker", "routing", "x402", "analysis", "price", "data"],
    vault:        vaultAddress,
    builderCode:  builderCode ?? "",
    version:      "1.0.0",
    image:        "",
  };
  const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;

  const registry = new ethers.Contract(IDENTITY_REGISTRY, REGISTRY_ABI, signer);

  console.log("[register] Calling register(agentURI)…");
  const tx = await registry["register(string)"](agentURI);
  console.log("[register] Tx submitted:", tx.hash);

  const receipt = await tx.wait();
  console.log("[register] Confirmed in block", receipt.blockNumber);

  // Parse agentId from Registered event
  const iface    = new ethers.Interface(REGISTRY_ABI);
  let agentId    = "";
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "Registered") {
        agentId = parsed.args[0].toString();
        break;
      }
    } catch {}
  }

  if (agentId) {
    console.log(`\n✅ SWITCHBOARD registered — agentId: ${agentId}`);
    console.log(`   View: https://8004scan.io/agents/${agentId}`);
    console.log(`   Tx:   https://basescan.org/tx/${tx.hash}`);
    console.log(`\n   → Add to packages/agent/.env:`);
    console.log(`     ERC8004_AGENT_ID=${agentId}`);
  } else {
    console.log(`\n✅ Registered. Tx: https://basescan.org/tx/${tx.hash}`);
    console.log("   Check 8004scan.io to find your agentId.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
