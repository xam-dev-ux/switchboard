import { encodeFunctionData } from "viem";
import { walletClient } from "./wallet.js";
import { VAULT_ADDRESS, BUILDER_CODE, REPUTATION_REGISTRY, ERC8004_AGENT_ID } from "./constants.js";

const VAULT_ABI = [
  {
    name: "recordJob",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId",     type: "bytes32"  },
      { name: "user",      type: "address"  },
      { name: "charged",   type: "uint256"  },
      { name: "paidOut",   type: "uint256"  },
      { name: "agentName", type: "string"   },
      { name: "agentId",   type: "uint256"  },
    ],
    outputs: [],
  },
] as const;

const REPUTATION_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId",       type: "uint256" },
      { name: "value",         type: "int128"  },
      { name: "valueDecimals", type: "uint8"   },
      { name: "tag1",          type: "string"  },
      { name: "tag2",          type: "string"  },
      { name: "endpoint",      type: "string"  },
      { name: "feedbackURI",   type: "string"  },
      { name: "feedbackHash",  type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const ZERO_HASH = `0x${"0".repeat(64)}` as `0x${string}`;

export type RecordJobParams = {
  jobId:     `0x${string}`;
  user:      `0x${string}`;
  charged:   number;
  paidOut:   number;
  agentName: string;
  agentId:   number;
};

export async function recordJob(params: RecordJobParams): Promise<`0x${string}`> {
  const calldata = encodeFunctionData({
    abi: VAULT_ABI,
    functionName: "recordJob",
    args: [
      params.jobId,
      params.user,
      BigInt(params.charged),
      BigInt(params.paidOut),
      params.agentName,
      BigInt(params.agentId),
    ],
  });

  // ERC-8021: append builder code bytes to every calldata
  const suffix = BUILDER_CODE ? Buffer.from(BUILDER_CODE).toString("hex") : "";
  const data = (calldata + suffix) as `0x${string}`;

  return walletClient.sendTransaction({ to: VAULT_ADDRESS, data });
}

// Submit positive feedback to ERC-8004 ReputationRegistry after each successful job.
// Fire-and-forget — never throws, never blocks job delivery.
export async function submitJobFeedback(subAgentEndpoint: string): Promise<void> {
  if (!ERC8004_AGENT_ID) return;

  try {
    const data = encodeFunctionData({
      abi: REPUTATION_ABI,
      functionName: "giveFeedback",
      args: [
        BigInt(ERC8004_AGENT_ID),
        100n,          // value = 100
        0,             // valueDecimals = 0
        "completion",  // tag1
        "success",     // tag2
        subAgentEndpoint,
        "",
        ZERO_HASH,
      ],
    });

    const tx = await walletClient.sendTransaction({
      to: REPUTATION_REGISTRY as `0x${string}`,
      data,
    });
    console.log(`[reputation] feedback submitted: ${tx}`);
  } catch (e) {
    console.error("[reputation] feedback error:", e);
  }
}
