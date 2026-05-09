import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_RPC } from "./constants.js";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);

export const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC) });
export const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC) });
