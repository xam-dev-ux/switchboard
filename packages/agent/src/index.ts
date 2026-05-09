import http from "http";
import { randomBytes } from "crypto";
import { startXmtp } from "./xmtp.js";
import { buildPayPage } from "./payPage.js";
import { processPayment, getAgentUSDCBalance } from "./broker.js";
import { pendingPayments, paymentStatus, jobLog, agentStats } from "./sessions.js";
import { USER_FEE, AGENT_WALLET_ADDRESS, VAULT_ADDRESS, PORT } from "./constants.js";
import { publicClient } from "./wallet.js";

const startTime = Date.now();

const VAULT_ABI = [
  {
    name: "getStats",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_totalJobs",         type: "uint256" },
      { name: "_totalRevenue",      type: "uint256" },
      { name: "_totalPaidToAgents", type: "uint256" },
      { name: "_profit",            type: "uint256" },
      { name: "_balance",           type: "uint256" },
    ],
  },
] as const;

function isBrowser(req: http.IncomingMessage): boolean {
  return req.headers.accept?.includes("text/html") ?? false;
}

function json(res: http.ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function handler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url    = req.url ?? "/";
  const method = req.method ?? "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  cors(res);

  // GET /health
  if (method === "GET" && url === "/health") {
    json(res, { status: "ok", uptime: Math.floor((Date.now() - startTime) / 1000), agent: AGENT_WALLET_ADDRESS });
    return;
  }

  // GET /pay/:nonce
  const payMatch = url.match(/^\/pay\/([a-f0-9]{32})(\?.*)?$/);
  if (method === "GET" && payMatch) {
    const nonce   = payMatch[1];
    const pending = pendingPayments.get(nonce);
    if (!pending) {
      if (isBrowser(req)) {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>Payment link expired or not found</h1>");
      } else {
        json(res, { error: "Not found" }, 404);
      }
      return;
    }
    if (Date.now() > pending.expiresAt) {
      if (isBrowser(req)) {
        res.writeHead(410, { "Content-Type": "text/html" });
        res.end("<h1>Payment window expired</h1>");
      } else {
        json(res, { error: "Payment window expired" }, 410);
      }
      return;
    }
    if (isBrowser(req)) {
      const html = buildPayPage(Number(USER_FEE) / 1e6, "SWITCHBOARD service", AGENT_WALLET_ADDRESS, nonce);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } else {
      json(res, { error: "Payment required", amountUSDC: Number(USER_FEE) / 1e6, nonce }, 402);
    }
    return;
  }

  // POST /api/confirm-payment
  if (method === "POST" && url === "/api/confirm-payment") {
    let body: { txHash?: string; nonce?: string; userAddress?: string };
    try {
      body = (await readBody(req)) as typeof body;
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
      return;
    }

    const { txHash, nonce, userAddress } = body;
    if (!txHash || !nonce || !userAddress) {
      json(res, { error: "Missing txHash, nonce, or userAddress" }, 400);
      return;
    }

    const pending = pendingPayments.get(nonce);
    if (!pending) {
      json(res, { error: "Payment window expired or nonce not found" }, 410);
      return;
    }

    json(res, { status: "processing", txHash });

    processPayment(nonce, txHash as `0x${string}`, userAddress as `0x${string}`).catch(console.error);
    return;
  }

  // GET /api/payment-status/:nonce
  const statusMatch = url.match(/^\/api\/payment-status\/([a-f0-9]{32})$/);
  if (method === "GET" && statusMatch) {
    const nonce = statusMatch[1];
    json(res, paymentStatus.get(nonce) ?? { status: "unknown" });
    return;
  }

  // GET /api/stats
  if (method === "GET" && url === "/api/stats") {
    try {
      const [vaultStats, agentBalance] = await Promise.all([
        VAULT_ADDRESS
          ? publicClient.readContract({
              address: VAULT_ADDRESS,
              abi: VAULT_ABI,
              functionName: "getStats",
            })
          : Promise.resolve([0n, 0n, 0n, 0n, 0n]),
        getAgentUSDCBalance(),
      ]);

      const [totalJobs, totalRevenue, totalPaidToAgents, profit, vaultBalance] = vaultStats as bigint[];
      json(res, {
        totalJobs:       Number(totalJobs),
        totalRevenue:    Number(totalRevenue),
        totalPaidToAgents: Number(totalPaidToAgents),
        profit:          Number(profit),
        vaultBalance:    Number(vaultBalance),
        agentBalance:    Number(agentBalance),
        uptime:          Math.floor((Date.now() - startTime) / 1000),
        vaultAddress:    VAULT_ADDRESS,
        agentAddress:    AGENT_WALLET_ADDRESS,
      });
    } catch (e) {
      json(res, { error: (e as Error).message }, 500);
    }
    return;
  }

  // GET /api/jobs
  if (method === "GET" && url === "/api/jobs") {
    json(res, jobLog.slice(0, 50).map((j) => ({
      jobId:      j.jobId,
      agentName:  j.agentName,
      agentId:    j.agentId,
      charged:    j.charged,
      paidOut:    j.paidOut,
      margin:     j.margin,
      txHash:     j.txHash,
      userAddress: j.userAddress,
      timestamp:  j.timestamp,
    })));
    return;
  }

  // GET /api/agents
  if (method === "GET" && url === "/api/agents") {
    const agents = [...agentStats.values()]
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 10);
    json(res, agents);
    return;
  }

  json(res, { error: "Not found" }, 404);
}

async function main() {
  console.log("[switchboard] Starting…");

  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      console.error("[http] unhandled error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`[http] Listening on port ${PORT}`);
  });

  await startXmtp();
}

main().catch((err) => {
  console.error("[switchboard] Fatal:", err);
  process.exit(1);
});
