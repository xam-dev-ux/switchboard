import { useEffect, useRef, useState } from "react";
import { fetchJobs, type Job } from "../api";

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function shortTx(tx: string) {
  return tx.slice(0, 8) + "…" + tx.slice(-4);
}

export function JobFeed() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const prevIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJobs();
        const newIds = new Set(data.map((j) => j.jobId));
        const added  = data.filter((j) => !prevIds.current.has(j.jobId)).map((j) => j.jobId);
        if (added.length) {
          setFlash(new Set(added));
          setTimeout(() => setFlash(new Set()), 300);
        }
        prevIds.current = newIds;
        setJobs(data);
      } catch {}
    };
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, []);

  const th: React.CSSProperties = {
    padding: "8px 12px", textAlign: "left", fontSize: 11,
    color: "#475569", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
    borderBottom: "1px solid #1E1E2E",
  };
  const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };

  return (
    <div style={{ background: "#131720", border: "1px solid #1E1E2E", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1E1E2E", fontSize: 12, color: "#475569", fontWeight: 700, letterSpacing: 1 }}>
        JOB LOG — ONCHAIN · SWITCHBOARDVAULT EVENTS
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>TIME</th>
              <th style={th}>USER</th>
              <th style={th}>AGENT</th>
              <th style={th}>CHARGED</th>
              <th style={th}>MARGIN</th>
              <th style={th}>TX</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...td, color: "#475569", textAlign: "center", padding: "32px" }}>
                  No jobs yet
                </td>
              </tr>
            )}
            {jobs.map((j) => (
              <tr
                key={j.jobId}
                style={{
                  borderBottom: "1px solid #1E1E2E",
                  background: flash.has(j.jobId) ? "#818CF822" : "transparent",
                  transition: "background 0.3s",
                }}
              >
                <td style={{ ...td, color: "#64748b" }}>
                  {new Date(j.timestamp).toLocaleTimeString()}
                </td>
                <td style={{ ...td, fontFamily: "monospace", color: "#94a3b8" }}>
                  {shortAddr(j.userAddress)}
                </td>
                <td style={{ ...td, color: "#818CF8", fontWeight: 600 }}>{j.agentName}</td>
                <td style={{ ...td, color: "#f1f5f9" }}>
                  ${(j.charged / 1e6).toFixed(2)}
                </td>
                <td style={{ ...td, color: "#34D399", fontWeight: 700 }}>
                  +${(j.margin / 1e6).toFixed(2)}
                </td>
                <td style={td}>
                  <a
                    href={`https://basescan.org/tx/${j.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#818CF8", textDecoration: "none", fontFamily: "monospace", fontSize: 12 }}
                  >
                    {shortTx(j.txHash)} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
