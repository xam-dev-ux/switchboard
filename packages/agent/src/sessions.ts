import type { SubAgent } from "./registry.js";
import type { Intent } from "./broker.js";

export type JobEntry = {
  jobId:        string;
  agentName:    string;
  agentId:      number;
  charged:      number;
  paidOut:      number;
  margin:       number;
  txHash:       string;
  userAddress:  `0x${string}`;
  timestamp:    number;
};

export type SessionEntry = {
  userAddress: `0x${string}`;
  lastSeen:    number;
  jobCount:    number;
  history:     JobEntry[];
};

export type PaymentStatus =
  | { status: "processing" }
  | { status: "done"; jobTx?: string }
  | { status: "failed"; error: string };

export type PendingEntry = {
  type:        "broker";
  userAddress: `0x${string}`;
  agent:       SubAgent;
  intent:      Intent;
  send:        (text: string) => Promise<void>;
  expiresAt:   number;
};

export type AgentStat = {
  name:     string;
  agentId:  number;
  score:    number;
  price:    number;
  jobs:     number;
  endpoint: string;
};

// In-memory state — no database for MVP
export const sessions        = new Map<string, SessionEntry>();
export const paymentStatus   = new Map<string, PaymentStatus>();
export const pendingPayments = new Map<string, PendingEntry>();
export const jobLog: JobEntry[] = [];
export const agentStats      = new Map<string, AgentStat>();
