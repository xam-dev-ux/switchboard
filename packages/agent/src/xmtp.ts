import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { toBytes, keccak256 } from "viem";
import { randomBytes } from "crypto";
import { handleUserRequest, getAgentUSDCBalance } from "./broker.js";
import { sessions, jobLog, agentStats } from "./sessions.js";
import { findBestAgent } from "./registry.js";
import { USER_FEE, MIN_MARGIN } from "./constants.js";

const HELP_TEXT = [
  "🔀 *SWITCHBOARD* — AI broker on ERC-8004",
  "",
  "Commands:",
  "  *status*   — your active jobs + wallet balance",
  "  *history*  — your last 5 completed jobs",
  "  *agents*   — top 5 available agents in ERC-8004",
  "  *help*     — show this message",
  "",
  "Or just describe your task and I'll find the best agent for $0.05 USDC.",
].join("\n");

function buildSendFn(client: Client, convId: string): (text: string) => Promise<void> {
  return async (text: string): Promise<void> => {
    try {
      await client.conversations.sync();
      const conv = await client.conversations.getConversationById(convId);
      if (conv) await conv.send(text);
      else console.error(`[xmtp] conv ${convId} not found after sync`);
    } catch (e) {
      console.error("[xmtp] send error:", e);
    }
  };
}

export async function startXmtp(): Promise<Client> {
  const privateKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  const account    = privateKeyToAccount(privateKey);

  const signer = {
    type: "EOA" as const,
    getIdentifier: () => ({
      identifier:     account.address,
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const sig = await account.signMessage({ message });
      return toBytes(sig);
    },
  };

  const dbEncryptionKey = toBytes(keccak256(toBytes(privateKey)));

  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: "production",
  });

  try {
    await client.revokeAllOtherInstallations();
    console.log("[xmtp] revoked stale installations");
  } catch (e) {
    console.warn("[xmtp] could not revoke installations:", e);
  }

  await client.conversations.sync();
  console.log(`[xmtp] listening — inboxId: ${client.inboxId}`);

  listenForMessages(client).catch(console.error);

  return client;
}

async function listenForMessages(client: Client): Promise<void> {
  while (true) {
    try {
      const stream = await client.conversations.streamAllMessages();

      for await (const message of stream) {
        if (!message) continue;
        if (message.senderInboxId === client.inboxId) continue;
        if (message.contentType?.typeId !== "text") continue;

        const content = typeof message.content === "string" ? message.content.trim() : "";
        if (!content) continue;

        const convId      = message.conversationId;
        const senderId    = message.senderInboxId;
        const userAddress = senderId as `0x${string}`;
        const send        = buildSendFn(client, convId);
        const sessionKey  = senderId.toLowerCase();

        if (!sessions.has(sessionKey)) {
          sessions.set(sessionKey, { userAddress, lastSeen: Date.now(), jobCount: 0, history: [] });
        } else {
          sessions.get(sessionKey)!.lastSeen = Date.now();
        }

        const cmd = content.toLowerCase();

        if (cmd === "help")    { await send(HELP_TEXT); continue; }
        if (cmd === "status")  { await handleStatus(send, userAddress); continue; }
        if (cmd === "history") { await handleHistory(send, sessionKey); continue; }
        if (cmd === "agents")  { await handleAgents(send, content); continue; }
        if (cmd === "confirm" || cmd === "paid") {
          await send("✅ Payment is processed via the browser pay page. No manual confirmation needed.");
          continue;
        }

        const nonce = randomBytes(16).toString("hex");
        handleUserRequest(userAddress, content, send, sessionKey, nonce).catch((e) =>
          console.error("[xmtp] handleUserRequest error:", e),
        );
      }
    } catch (err) {
      console.error("[xmtp] stream error, restarting in 5s:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function handleStatus(send: (t: string) => Promise<void>, userAddress: `0x${string}`): Promise<void> {
  try {
    const balance  = await getAgentUSDCBalance();
    const userJobs = jobLog.filter((j) => j.userAddress.toLowerCase() === userAddress.toLowerCase());
    await send(
      [
        "🔀 *SWITCHBOARD STATUS*",
        "",
        `Agent wallet USDC: $${(Number(balance) / 1e6).toFixed(4)}`,
        `Your completed jobs: ${userJobs.length}`,
        `Total network jobs: ${jobLog.length}`,
        `User fee: $${(Number(USER_FEE) / 1e6).toFixed(2)} · Min margin: $${(Number(MIN_MARGIN) / 1e6).toFixed(2)}`,
      ].join("\n"),
    );
  } catch (e) {
    await send("❌ Could not fetch status: " + (e as Error).message);
  }
}

async function handleHistory(send: (t: string) => Promise<void>, sessionKey: string): Promise<void> {
  const session = sessions.get(sessionKey);
  const history = session?.history?.slice(0, 5) ?? [];
  if (!history.length) { await send("No completed jobs yet in this session."); return; }
  const lines = history.map((j, i) => {
    const time = new Date(j.timestamp).toLocaleTimeString();
    return `${i + 1}. [${time}] ${j.agentName} · $${(j.margin / 1e6).toFixed(2)} margin`;
  });
  await send(["🔀 *LAST 5 JOBS*", ...lines].join("\n"));
}

async function handleAgents(send: (t: string) => Promise<void>, query: string): Promise<void> {
  await send("🔍 Scanning ERC-8004 network…");
  try {
    const agent = await findBestAgent(query || "general");
    if (!agent) { await send("No agents found with score > 85 and x402 support right now."); return; }
    const stats = [...agentStats.values()].sort((a, b) => b.jobs - a.jobs).slice(0, 5);
    const lines = stats.length
      ? stats.map((a) => `• ${a.name} · score ${a.score.toFixed(1)} · ${a.jobs} jobs · $${(a.price / 1e6).toFixed(2)}/req`)
      : [`• ${agent.name} · score ${agent.score.toFixed(1)} · $${(agent.price / 1e6).toFixed(2)}/req`];
    await send(["🔀 *TOP AGENTS (ERC-8004)*", ...lines].join("\n"));
  } catch (e) {
    await send("❌ Could not fetch agents: " + (e as Error).message);
  }
}
