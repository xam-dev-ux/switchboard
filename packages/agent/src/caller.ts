import { encodeFunctionData } from "viem";
import { walletClient, publicClient } from "./wallet.js";
import { USDC_ADDRESS } from "./constants.js";

const TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Call a sub-agent endpoint, paying via x402 if required.
// Returns the agent's text response.
export async function callAgentEndpoint(endpoint: string, query: string): Promise<string> {
  // First attempt — no payment header
  const firstResp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15_000),
  });

  if (firstResp.ok) {
    return extractText(await firstResp.json());
  }

  if (firstResp.status !== 402) {
    throw new Error(`Agent returned ${firstResp.status}: ${firstResp.statusText}`);
  }

  // Parse payment requirements from 402 response
  const paymentHeader =
    firstResp.headers.get("X-Payment-Required") ??
    firstResp.headers.get("x-payment-required");

  let recipientAddress: `0x${string}`;
  let amountMicro: bigint;

  if (paymentHeader) {
    try {
      const info = JSON.parse(paymentHeader) as {
        recipient?: string;
        address?: string;
        amount?: number | string;
        amountUSDC?: number;
      };
      recipientAddress = (info.recipient ?? info.address ?? "") as `0x${string}`;
      const rawAmount = info.amountUSDC != null
        ? Math.round(info.amountUSDC * 1e6)
        : Number(info.amount ?? 0);
      amountMicro = BigInt(rawAmount);
    } catch {
      throw new Error("Could not parse X-Payment-Required header");
    }
  } else {
    const body402 = await firstResp.json().catch(() => ({})) as any;
    recipientAddress = (body402.recipient ?? body402.address ?? "") as `0x${string}`;
    amountMicro = BigInt(Math.round((body402.amountUSDC ?? body402.amount ?? 0) * 1e6));
  }

  if (!recipientAddress || !amountMicro) {
    throw new Error("Missing payment recipient or amount in 402 response");
  }

  // Pay via direct USDC.transfer()
  const data = encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [recipientAddress, amountMicro],
  });

  const txHash = await walletClient.sendTransaction({
    to: USDC_ADDRESS as `0x${string}`,
    data,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
  });

  if (receipt.status !== "success") {
    throw new Error("USDC payment to sub-agent reverted");
  }

  // Retry with payment proof
  const retryResp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Proof": txHash,
      "X-Payment-TxHash": txHash,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!retryResp.ok) {
    throw new Error(`Agent rejected paid request: ${retryResp.status}`);
  }

  return extractText(await retryResp.json());
}

function extractText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.result === "string") return b.result;
    if (typeof b.response === "string") return b.response;
    if (typeof b.text === "string") return b.text;
    if (typeof b.output === "string") return b.output;
    if (typeof b.content === "string") return b.content;
    return JSON.stringify(body);
  }
  return String(body);
}
