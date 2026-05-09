import { useEffect, useState } from "react";
import { fetchStats } from "../api";

export function LiveIndicator() {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        await fetchStats();
        setAlive(true);
      } catch {
        setAlive(false);
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: alive ? "#34D399" : "#F87171" }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: alive ? "#34D399" : "#F87171",
        boxShadow: alive ? "0 0 6px #34D399" : "none",
        animation: alive ? "pulse 2s infinite" : "none",
      }} />
      {alive ? "LIVE" : "OFFLINE"}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </span>
  );
}
