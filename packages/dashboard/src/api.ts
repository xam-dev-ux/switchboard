const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

export type Stats = {
  totalJobs:         number;
  totalRevenue:      number;
  totalPaidToAgents: number;
  profit:            number;
  vaultBalance:      number;
  agentBalance:      number;
  uptime:            number;
  vaultAddress:      string;
  agentAddress:      string;
};

export type Job = {
  jobId:       string;
  agentName:   string;
  agentId:     number;
  charged:     number;
  paidOut:     number;
  margin:      number;
  txHash:      string;
  userAddress: string;
  timestamp:   number;
};

export type AgentStat = {
  name:     string;
  agentId:  number;
  score:    number;
  price:    number;
  jobs:     number;
  endpoint: string;
};

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch(`${API_BASE}/api/jobs`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

export async function fetchAgents(): Promise<AgentStat[]> {
  const res = await fetch(`${API_BASE}/api/agents`);
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}
