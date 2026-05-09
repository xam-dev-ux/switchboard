/**
 * Registers SWITCHBOARD as an agent in the ERC-8004 IdentityRegistry.
 * Run AFTER deploy.ts, using your personal (owner) wallet.
 *
 * Usage:
 *   cd packages/contracts
 *   npx hardhat run scripts/register.ts --network base
 */
import { ethers } from "hardhat";
import { readFileSync } from "fs";
import { join } from "path";

// ERC-8004 IdentityRegistry — Base mainnet
const IDENTITY_REGISTRY = process.env.ERC8004_IDENTITY_REGISTRY
  ?? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

// Minimal ABI covering the two most common ERC-8004 register signatures.
// If the live contract uses a different selector, extend here.
const REGISTRY_ABI = [
  // Variant A — separate fields
  "function registerAgent(string name, string description, string endpoint, string[] capabilities) external returns (uint256)",
  // Variant B — metadata URI
  "function register(string name, string endpoint, string metadataURI) external returns (uint256)",
  // Read agentId by owner (for confirmation)
  "function agentOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
];

async function main() {
  const agentWallet  = process.env.AGENT_WALLET_ADDRESS;
  const builderCode  = process.env.BUILDER_CODE;

  if (!agentWallet) throw new Error("AGENT_WALLET_ADDRESS must be set in .env");

  // Read vault address from deploy output
  let vaultAddress = "";
  try {
    const dep = JSON.parse(readFileSync(join(__dirname, "../deployments/base.json"), "utf8")) as { address: string };
    vaultAddress = dep.address;
  } catch {
    console.warn("[register] deployments/base.json not found — vaultAddress will be empty in metadata");
  }

  const [signer] = await ethers.getSigners();
  console.log("[register] Signing with:", signer.address);
  console.log("[register] Registry:    ", IDENTITY_REGISTRY);

  const registry = new ethers.Contract(IDENTITY_REGISTRY, REGISTRY_ABI, signer);

  const name        = "SWITCHBOARD";
  const description = "Agent broker. Finds and pays ERC-8004 agents on your behalf. Powered by x402 + XMTP.";
  const endpoint    = `xmtp://${agentWallet}`;
  const capabilities = ["broker", "routing", "x402", "analysis", "price", "data"];

  // Build an inline JSON metadata URI for registries that want a URI
  const metadataObj = {
    name,
    description,
    endpoint,
    capabilities,
    vault: vaultAddress,
    builderCode: builderCode ?? "",
    version: "1.0.0",
  };
  const metadataURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadataObj)).toString("base64")}`;

  // Try Variant A first, fall back to Variant B
  let tx: any;
  try {
    console.log("[register] Trying registerAgent(name, description, endpoint, capabilities)…");
    tx = await registry["registerAgent(string,string,string,string[])"](
      name, description, endpoint, capabilities,
    );
  } catch (e: any) {
    if (e.code === "CALL_EXCEPTION" || e.message?.includes("no matching function")) {
      console.log("[register] Variant A failed, trying register(name, endpoint, metadataURI)…");
      tx = await registry["register(string,string,string)"](name, endpoint, metadataURI);
    } else {
      throw e;
    }
  }

  console.log("[register] Tx submitted:", tx.hash);
  const receipt = await tx.wait();
  console.log("[register] Confirmed in block", receipt.blockNumber);

  // Try to read back the assigned agentId
  try {
    const agentId = await registry["agentOf"](signer.address);
    console.log(`[register] ✓ SWITCHBOARD registered — agentId: ${agentId.toString()}`);
    console.log(`           Set ERC8004_AGENT_ID=${agentId.toString()} in agent .env if needed`);
  } catch {
    console.log("[register] ✓ Registered. Check 8004scan.io to confirm agentId.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
