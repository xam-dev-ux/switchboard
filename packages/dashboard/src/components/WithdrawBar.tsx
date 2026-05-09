import type { Stats } from "../api";

type Props = { stats: Stats | null };

export function WithdrawBar({ stats }: Props) {
  const vault   = stats?.vaultAddress ?? "";
  const balance = stats ? (stats.vaultBalance / 1e6).toFixed(4) : "—";

  return (
    <div style={{
      background: "#131720", border: "1px solid #1E1E2E", borderRadius: 14,
      padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#475569", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
          VAULT BALANCE
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#34D399" }}>
          {balance} USDC
        </span>
      </div>
      {vault && (
        <>
          <div style={{ fontSize: 12, color: "#475569" }}>
            CONTRACT:{" "}
            <a
              href={`https://basescan.org/address/${vault}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#818CF8", fontFamily: "monospace" }}
            >
              {vault.slice(0, 10)}…{vault.slice(-6)} ↗
            </a>
          </div>
          <div style={{
            background: "#0d1117", border: "1px solid #1E1E2E", borderRadius: 10,
            padding: "12px 16px", fontSize: 13, color: "#94a3b8", lineHeight: 1.6,
          }}>
            💡 Withdraw from your personal wallet at{" "}
            <a
              href={`https://basescan.org/address/${vault}#writeContract`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#818CF8" }}
            >
              basescan.org → writeContract → withdraw()
            </a>
          </div>
        </>
      )}
    </div>
  );
}
