import { publicClient } from "./wallet.js";
import { IDENTITY_REGISTRY, DEMO_AGENT_ENDPOINT } from "./constants.js";

export type SubAgent = {
  agentId:      number;
  name:         string;
  chain:        string;
  score:        number;
  endpoint:     string;
  hasX402:      boolean;
  price:        number;        // USDC 6-decimal units (e.g. 10000 = $0.01)
  capabilities: string[];
};

const TOKEN_URI_ABI = [
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const SCAN_BASE = "https://8004scan.io/api/v1";

export async function findBestAgent(task: string): Promise<SubAgent | null> {
  const candidates: SubAgent[] = [];

  // ── 1. Query 8004scan for Base agents ─────────────────────────────────────
  try {
    const keyword = encodeURIComponent(task.slice(0, 64));
    const res = await fetch(`${SCAN_BASE}/agents?chain_id=8453&q=${keyword}&limit=20`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json() as { items?: any[] };
      const items = data.items ?? [];

      // For each agent, try to get its HTTP endpoint from the on-chain tokenURI
      await Promise.all(items.slice(0, 10).map(async (item: any) => {
        const tokenId = Number(item.token_id);
        const score   = Number(item.total_score ?? 0);

        let endpoint     = "";
        let capabilities: string[] = [];

        try {
          const uri = await publicClient.readContract({
            address: IDENTITY_REGISTRY as `0x${string}`,
            abi: TOKEN_URI_ABI,
            functionName: "tokenURI",
            args: [BigInt(tokenId)],
          }) as string;

          const meta = await parseAgentURI(uri);
          if (meta) {
            endpoint     = meta.endpoint ?? "";
            capabilities = meta.capabilities ?? [];
          }
        } catch {
          // agent has no tokenURI or unreachable metadata
        }

        // Only include agents with HTTP endpoints
        if (!endpoint.startsWith("http")) return;

        candidates.push({
          agentId:      tokenId,
          name:         String(item.name ?? "unknown"),
          chain:        "base",
          score,
          endpoint,
          hasX402:      Boolean(item.x402_supported),
          price:        0,  // will be probed below
          capabilities,
        });
      }));
    }
  } catch (e) {
    console.error("[registry] 8004scan fetch error:", e);
  }

  // ── 2. Fallback: demo agent from env var ───────────────────────────────────
  if (!candidates.length && DEMO_AGENT_ENDPOINT) {
    candidates.push({
      agentId:      0,
      name:         "Demo Agent",
      chain:        "base",
      score:        100,
      endpoint:     DEMO_AGENT_ENDPOINT,
      hasX402:      true,
      price:        10000, // default $0.01 if probe finds nothing
      capabilities: ["general"],
    });
  }

  if (!candidates.length) return null;

  // ── 3. Probe prices (only override if probe finds a real value) ───────────
  await Promise.all(
    candidates.map(async (a) => {
      const probed = await probeAgentPrice(a.endpoint);
      if (probed > 0) a.price = probed;
    }),
  );

  // ── 4. Sort: score desc, price asc ────────────────────────────────────────
  candidates.sort((a, b) => b.score - a.score || a.price - b.price);

  return candidates[0] ?? null;
}

async function parseAgentURI(uri: string): Promise<Record<string, any> | null> {
  try {
    // data:application/json;base64,...
    if (uri.startsWith("data:application/json;base64,")) {
      const b64 = uri.slice("data:application/json;base64,".length).trim();
      return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    }
    // data:application/json,...
    if (uri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
    }
    // https:// → fetch the JSON
    if (uri.startsWith("https://") || uri.startsWith("http://")) {
      const res = await fetch(uri, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return await res.json() as Record<string, any>;
    }
  } catch {}
  return null;
}

async function probeAgentPrice(endpoint: string): Promise<number> {
  try {
    const res = await fetch(endpoint, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 402) {
      const header = res.headers.get("X-Payment-Required") ?? res.headers.get("x-payment-required");
      if (header) {
        try {
          const info = JSON.parse(header) as { amount?: number | string; amountUSDC?: number };
          if (info.amountUSDC != null) return Math.round(info.amountUSDC * 1e6);
          if (info.amount != null) return Number(info.amount);
        } catch {
          const match = header.match(/amount[=:]\s*([\d.]+)/i);
          if (match) return Math.round(Number(match[1]) * 1e6);
        }
      }
    }
  } catch {}
  return 0;
}
