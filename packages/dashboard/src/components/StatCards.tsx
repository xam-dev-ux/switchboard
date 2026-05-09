import type { Stats } from "../api";

type Props = { stats: Stats | null };

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "#131720", border: "1px solid #1E1E2E", borderRadius: 14,
      padding: "20px 24px", flex: 1, minWidth: 160,
    }}>
      <div style={{ color: "#475569", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function usd(micro: number) {
  return `$${(micro / 1e6).toFixed(2)}`;
}

export function StatCards({ stats }: Props) {
  if (!stats) return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      {["JOBS", "REVENUE", "PAID OUT", "PROFIT"].map((l) => (
        <Card key={l} label={l} value="—" />
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Card label="JOBS"    value={String(stats.totalJobs)} sub="total routed" />
      <Card label="REVENUE" value={usd(stats.totalRevenue)} sub="user fees collected" />
      <Card label="PAID OUT" value={usd(stats.totalPaidToAgents)} sub="to sub-agents" />
      <Card
        label="PROFIT"
        value={usd(stats.profit)}
        sub={`vault: ${usd(stats.vaultBalance)} · agent: ${usd(stats.agentBalance)}`}
      />
    </div>
  );
}
