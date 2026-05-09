import { useEffect, useState } from "react";
import { fetchStats, type Stats } from "./api";
import { StatCards }    from "./components/StatCards";
import { JobFeed }      from "./components/JobFeed";
import { AgentNetwork } from "./components/AgentNetwork";
import { WithdrawBar }  from "./components/WithdrawBar";
import { LiveIndicator } from "./components/LiveIndicator";

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = async () => {
      try { setStats(await fetchStats()); } catch {}
    };
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const container: React.CSSProperties = {
    maxWidth: 1100, margin: "0 auto", padding: "24px 16px",
    display: "flex", flexDirection: "column", gap: 20,
  };
  const header: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    flexWrap: "wrap", gap: 8,
  };

  return (
    <div style={{ background: "#0C0C0F", minHeight: "100vh", color: "#f1f5f9", fontFamily: "'IBM Plex Mono', monospace" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet" />

      <div style={container}>
        <div style={header}>
          <div>
            <div style={{
              fontSize: 24, fontWeight: 800,
              background: "linear-gradient(90deg,#818CF8,#6366f1)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              🔀 SWITCHBOARD
            </div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>
              Agent broker · ERC-8004 network
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#475569" }}>
            <span>Base Mainnet</span>
            <LiveIndicator />
          </div>
        </div>

        <StatCards stats={stats} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
          <JobFeed />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <AgentNetwork />
          </div>
        </div>

        <WithdrawBar stats={stats} />
      </div>
    </div>
  );
}
