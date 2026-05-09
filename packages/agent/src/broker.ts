import { randomBytes } from "crypto";
import { findBestAgent } from "./registry.js";
import { callAgentEndpoint } from "./caller.js";
import { recordJob, submitJobFeedback } from "./vault.js";
import { pendingPayments, paymentStatus, jobLog, agentStats, sessions } from "./sessions.js";
import { USER_FEE, MIN_MARGIN, BOT_URL, AGENT_WALLET_ADDRESS } from "./constants.js";
import { publicClient } from "./wallet.js";
import { USDC_ADDRESS } from "./constants.js";

export type Intent = {
  type:  "price" | "analysis" | "data" | "swap_signal" | "custom";
  query: string;
};

function classifyIntent(message: string): Intent {
  const m = message.toLowerCase();
  if (/\b(price|cost|worth|value|usd|eur)\b/.test(m))         return { type: "price",       query: message };
  if (/\b(analys|review|breakdown|explain|research)\b/.test(m)) return { type: "analysis",    query: message };
  if (/\b(data|feed|stats|metric|chart|history)\b/.test(m))    return { type: "data",        query: message };
  if (/\b(signal|trade|buy|sell|entry|exit|swap)\b/.test(m))   return { type: "swap_signal", query: message };
  return { type: "custom", query: message };
}

export async function handleUserRequest(
  userAddress: `0x${string}`,
  message: string,
  send: (text: string) => Promise<void>,
  sessionId: string,
  nonce: string,
): Promise<void> {
  const intent = classifyIntent(message);

  await send("🔀 *SWITCHBOARD*\n\n🔍 Searching the ERC-8004 network…");

  const agent = await findBestAgent(intent.query);

  if (!agent) {
    await send(
      "🔀 *SWITCHBOARD*\n\n❌ No suitable agent found in the ERC-8004 network for your request.\n" +
      "Try rephrasing or check back later.",
    );
    return;
  }

  const agentPriceMicro = agent.price;
  const userFeeMicro    = Number(USER_FEE);
  const margin          = userFeeMicro - agentPriceMicro;

  if (margin < Number(MIN_MARGIN)) {
    await send(
      `🔀 *SWITCHBOARD*\n\n⚠️ Found *${agent.name}* (score: ${agent.score.toFixed(1)}) but their price ` +
      `($${(agentPriceMicro / 1e6).toFixed(2)}) leaves less than the minimum margin. Cannot proceed.`,
    );
    return;
  }

  const expiresAt = Date.now() + 5 * 60 * 1000; // 5-minute window

  pendingPayments.set(nonce, {
    type:        "broker",
    userAddress,
    agent,
    intent,
    send,
    expiresAt,
  });

  const payUrl = `${BOT_URL}/pay/${nonce}`;

  await send(
    [
      "🔀 *SWITCHBOARD*",
      "",
      `🔍 Found: *${agent.name}* (score: ${agent.score.toFixed(1)}, ${agent.chain})`,
      `   Capability: ${agent.capabilities.slice(0, 2).join(", ") || intent.type}`,
      `   Their price: $${(agentPriceMicro / 1e6).toFixed(2)} · Your cost: $${(userFeeMicro / 1e6).toFixed(2)}`,
      "",
      `💰 Pay ${(userFeeMicro / 1e6).toFixed(2)} USDC:`,
      `   ${payUrl}`,
      "",
      "⏱️ Window: 5 minutes",
    ].join("\n"),
  );
}

// Called from POST /api/confirm-payment after receipt confirmed
export async function processPayment(
  nonce: string,
  txHash: `0x${string}`,
  userAddress: `0x${string}`,
): Promise<void> {
  const pending = pendingPayments.get(nonce);
  if (!pending || Date.now() > pending.expiresAt) {
    paymentStatus.set(nonce, { status: "failed", error: "Payment window expired" });
    return;
  }

  paymentStatus.set(nonce, { status: "processing" });

  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    });

    if (receipt.status !== "success") {
      paymentStatus.set(nonce, { status: "failed", error: "Transaction reverted" });
      await pending.send("❌ Payment failed — transaction reverted.").catch(console.error);
      return;
    }

    await pending.send("⏳ Payment confirmed! Calling agent…").catch(console.error);

    const result = await callAgentEndpoint(pending.agent.endpoint, pending.intent.query);

    const jobId = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
    const jobTx = await recordJob({
      jobId,
      user:      pending.userAddress,
      charged:   Number(USER_FEE),
      paidOut:   pending.agent.price,
      agentName: pending.agent.name,
      agentId:   pending.agent.agentId,
    });

    paymentStatus.set(nonce, { status: "done", jobTx });

    // Fire-and-forget: submit reputation feedback after every successful job
    submitJobFeedback(pending.agent.endpoint).catch(console.error);

    // Update in-memory stats
    const margin = Number(USER_FEE) - pending.agent.price;
    const entry = {
      jobId,
      agentName:   pending.agent.name,
      agentId:     pending.agent.agentId,
      charged:     Number(USER_FEE),
      paidOut:     pending.agent.price,
      margin,
      txHash:      jobTx,
      userAddress: pending.userAddress,
      timestamp:   Date.now(),
    };
    jobLog.unshift(entry);
    if (jobLog.length > 500) jobLog.pop();

    const key = pending.agent.name;
    const existing = agentStats.get(key);
    if (existing) {
      existing.jobs++;
    } else {
      agentStats.set(key, {
        name:     pending.agent.name,
        agentId:  pending.agent.agentId,
        score:    pending.agent.score,
        price:    pending.agent.price,
        jobs:     1,
        endpoint: pending.agent.endpoint,
      });
    }

    // Update session history
    const session = sessions.get(sessionId(pending.userAddress));
    if (session) {
      session.jobCount++;
      session.history.unshift(entry);
      if (session.history.length > 20) session.history.pop();
    }

    await pending.send(
      [
        `✅ Done — via ${pending.agent.name}`,
        "",
        result,
        "",
        "─────────────────",
        "Job recorded onchain ✓",
        `View: https://basescan.org/tx/${jobTx}`,
      ].join("\n"),
    ).catch(console.error);

  } catch (e) {
    const errMsg = (e as Error).message;
    paymentStatus.set(nonce, { status: "failed", error: errMsg });
    await pending.send(`❌ Job failed: ${errMsg}`).catch(console.error);
  } finally {
    pendingPayments.delete(nonce);
  }
}

function sessionId(address: `0x${string}`): string {
  return address.toLowerCase();
}

// Get USDC balance of agent wallet
export async function getAgentUSDCBalance(): Promise<bigint> {
  const BALANCE_OF_ABI = [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
  ] as const;

  return publicClient.readContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: [AGENT_WALLET_ADDRESS],
  }) as Promise<bigint>;
}
