import { SCAN_API_BASE } from "./constants.js";

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

type Registration = {
  name:         string;
  description:  string;
  endpoint:     string;
  capabilities: string[];
};

export async function findBestAgent(task: string): Promise<SubAgent | null> {
  const keyword = encodeURIComponent(task.slice(0, 64));
  let candidates: SubAgent[] = [];

  try {
    const res = await fetch(`${SCAN_API_BASE}/api/agents?q=${keyword}&limit=20&minScore=85`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json() as { agents?: any[] };
      const raw = data.agents ?? [];
      candidates = raw
        .filter((a: any) => a.score >= 85)
        .map((a: any) => ({
          agentId:      Number(a.agentId ?? a.id),
          name:         String(a.name ?? "unknown"),
          chain:        String(a.chain ?? "base"),
          score:        Number(a.score),
          endpoint:     String(a.endpoint ?? ""),
          hasX402:      Boolean(a.hasX402 ?? a.has_x402 ?? false),
          price:        Number(a.price ?? a.priceUsdc ?? 0),
          capabilities: Array.isArray(a.capabilities) ? a.capabilities.map(String) : [],
        }))
        .filter((a) => a.hasX402 && a.endpoint);
    }
  } catch (e) {
    console.error("[registry] 8004scan fetch error:", e);
  }

  if (!candidates.length) return null;

  // Probe prices for agents that don't have price info yet
  await Promise.all(
    candidates
      .filter((a) => a.price === 0)
      .map(async (a) => {
        a.price = await probeAgentPrice(a.endpoint);
      }),
  );

  // Sort: score desc, then price asc
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.price - b.price;
  });

  return candidates[0] ?? null;
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
  } catch {
    // unreachable endpoint
  }
  return 0;
}

async function resolveAgentRegistration(chain: string, agentId: number): Promise<Registration> {
  try {
    const res = await fetch(`${SCAN_API_BASE}/api/agents/${chain}/${agentId}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json() as any;
      return {
        name:         String(data.name ?? ""),
        description:  String(data.description ?? ""),
        endpoint:     String(data.endpoint ?? ""),
        capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [],
      };
    }
  } catch {}
  return { name: "", description: "", endpoint: "", capabilities: [] };
}

export { resolveAgentRegistration };
