import { concat, encodeFunctionData, hexToBytes } from "viem";
import { walletClient } from "./wallet.js";
import { VAULT_ADDRESS, BUILDER_CODE } from "./constants.js";

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
  const suffix = BUILDER_CODE
    ? hexToBytes(`0x${Buffer.from(BUILDER_CODE).toString("hex")}`)
    : new Uint8Array(0);

  const data = concat([calldata, suffix]);

  return walletClient.sendTransaction({ to: VAULT_ADDRESS, data });
}
