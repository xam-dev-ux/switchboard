import { useEffect, useState } from "react";
import { fetchAgents, type AgentStat } from "../api";

export function AgentNetwork() {
  const [agents, setAgents] = useState<AgentStat[]>([]);

  useEffect(() => {
    const load = async () => {
      try { setAgents(await fetchAgents()); } catch {}
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: "#131720", border: "1px solid #1E1E2E", borderRadius: 14 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E1E2E", fontSize: 12, color: "#475569", fontWeight: 700, letterSpacing: 1 }}>
        AGENTS USED — ERC-8004 NETWORK
      </div>
      <div style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
        {agents.length === 0 && (
          <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "24px" }}>
            No agents used yet
          </div>
        )}
        {agents.map((a) => (
          <div
            key={a.name}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderRadius: 10, background: "#0d1117",
              border: "1px solid #1E1E2E",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "#818CF8", fontSize: 14 }}>{a.name}</div>
              <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>
                score {a.score.toFixed(1)} · ${(a.price / 1e6).toFixed(2)}/req
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 16 }}>{a.jobs}</div>
              <div style={{ color: "#475569", fontSize: 11 }}>jobs</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
