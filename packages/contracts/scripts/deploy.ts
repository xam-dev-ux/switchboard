import { ethers, run } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  const operatorAddress = process.env.AGENT_WALLET_ADDRESS;
  const ownerAddress = process.env.OWNER_WALLET_ADDRESS;
  const builderCode = process.env.BUILDER_CODE;

  if (!operatorAddress || !ownerAddress || !builderCode) {
    throw new Error("AGENT_WALLET_ADDRESS, OWNER_WALLET_ADDRESS, and BUILDER_CODE must be set");
  }

  console.log("Deploying SwitchboardVault...");
  console.log("  USDC:    ", USDC_ADDRESS);
  console.log("  Operator:", operatorAddress);
  console.log("  Owner:   ", ownerAddress);
  console.log("  Builder: ", builderCode);

  const factory = await ethers.getContractFactory("SwitchboardVault");
  const vault = await factory.deploy(
    USDC_ADDRESS,
    operatorAddress,
    ownerAddress,
    Buffer.from(builderCode),
  );
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  console.log("SwitchboardVault deployed to:", address);

  console.log("Verifying on Basescan...");
  try {
    await run("verify:verify", {
      address,
      constructorArguments: [
        USDC_ADDRESS,
        operatorAddress,
        ownerAddress,
        Buffer.from(builderCode),
      ],
    });
    console.log("Verified ✓");
  } catch (e: any) {
    console.warn("Verification failed:", e.message);
  }

  const deploymentDir = join(__dirname, "../deployments");
  mkdirSync(deploymentDir, { recursive: true });
  writeFileSync(
    join(deploymentDir, "base.json"),
    JSON.stringify(
      { address, network: "base", chainId: 8453, deployedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log("Saved to deployments/base.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
