# SWITCHBOARD — Build Prompt

Build SWITCHBOARD — an AI broker agent registered in ERC-8004 that receives user
requests via XMTP, finds the best agent in the 8004 network, pays that agent via
x402, and charges the user a margin. Owner wallet deploys + withdraws. Agent wallet
does all runtime ops.

---

## PAYMENT FLOW — x402 exactly as ChatTrader does it

This project uses the same battle-tested x402 payment pattern from ChatTrader.
Do NOT use EIP-3009 / transferWithAuthorization / eth_signTypedData_v4.
Use direct USDC.transfer() + server-side receipt watching.

### Browser pay page pattern

```typescript
// src/payPage.ts
export function buildPayPage(amountUSDC: number, description: string, agentAddress: string): string {
  const amountMicro = String(Math.round(amountUSDC * 1e6));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pay · SWITCHBOARD</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0C0C0F; color: #f1f5f9; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { background: #131720; border: 1px solid #1E1E2E; border-radius: 20px;
      padding: 36px 32px; max-width: 420px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
    .logo { font-size: 22px; font-weight: 800; margin-bottom: 4px;
      background: linear-gradient(90deg,#818CF8,#6366f1); -webkit-background-clip: text;
      -webkit-text-fill-color: transparent; background-clip: text; }
    .tagline { color: #475569; font-size: 13px; margin-bottom: 28px; }
    .amount-card { background: #0d1117; border: 1px solid #1E1E2E; border-radius: 14px;
      padding: 24px; text-align: center; margin-bottom: 24px; }
    .amount-value { font-size: 44px; font-weight: 800; line-height: 1.1; }
    .amount-unit { font-size: 16px; color: #818CF8; font-weight: 600; margin-top: 6px; }
    .amount-desc { font-size: 13px; color: #64748b; margin-top: 10px; }
    .btn { width: 100%; padding: 16px; border: none; border-radius: 12px;
      font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-pay { background: linear-gradient(135deg,#6366f1,#818CF8); color: #fff; }
    .btn-pay:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,102,241,0.45); }
    .status { margin-top: 16px; padding: 14px 16px; border-radius: 10px; font-size: 14px;
      line-height: 1.55; display: none; word-break: break-word; }
    .status.loading { background: #0e1f3d; color: #93c5fd; display: block; }
    .status.success { background: #052e16; color: #4ade80; display: block; }
    .status.error   { background: #2d0f0f; color: #f87171; display: block; }
    .tx-link { display: block; margin-top: 8px; color: #4ade80; text-decoration: underline; font-size: 13px; }
    .powered { text-align: center; margin-top: 20px; font-size: 12px; color: #1e293b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔀 SWITCHBOARD</div>
    <div class="tagline">Agent broker · ERC-8004 network · Base</div>
    <div class="amount-card">
      <div class="amount-value">${amountUSDC}</div>
      <div class="amount-unit">USDC on Base</div>
      <div class="amount-desc">${description}</div>
    </div>
    <button class="btn btn-pay" id="pay-btn">Pay with Base Wallet</button>
    <div class="status" id="status"></div>
    <div class="powered">ERC-20 Transfer · Base Mainnet</div>
  </div>

  <script type="module">
    import { createWalletClient, custom, encodeFunctionData } from 'https://esm.sh/viem@2.21.0';
    import { base } from 'https://esm.sh/viem@2.21.0/chains';

    const USDC_ADDRESS  = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const AGENT_ADDRESS = '${agentAddress}';
    const AMOUNT_MICRO  = ${amountMicro}n;
    const NONCE         = new URLSearchParams(location.search).get('nonce') ?? '';

    const TRANSFER_ABI = [{
      name: 'transfer', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ name: '', type: 'bool' }],
    }];

    function setStatus(html, type) {
      const el = document.getElementById('status');
      el.innerHTML = html;
      el.className = 'status ' + type;
    }

    document.getElementById('pay-btn').addEventListener('click', async () => {
      const btn = document.getElementById('pay-btn');
      btn.disabled = true;

      try {
        setStatus('Connecting wallet…', 'loading');
        if (!window.ethereum) throw new Error('No wallet detected. Install Coinbase Wallet or MetaMask.');

        const walletClient = createWalletClient({ chain: base, transport: custom(window.ethereum) });
        const [userAddress] = await walletClient.requestAddresses();

        setStatus('Switching to Base network…', 'loading');
        try {
          await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
        } catch (err) {
          if (err.code === 4902) {
            await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
              chainId: '0x2105', chainName: 'Base',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'],
            }]});
          } else throw err;
        }

        setStatus('Approve the USDC transfer in your wallet…', 'loading');
        const data = encodeFunctionData({
          abi: TRANSFER_ABI,
          functionName: 'transfer',
          args: [AGENT_ADDRESS, AMOUNT_MICRO],
        });

        const txHash = await walletClient.sendTransaction({
          account: userAddress,
          to: USDC_ADDRESS,
          data,
        });

        setStatus('Transaction submitted! Waiting for confirmation…', 'loading');

        const resp = await fetch('/api/confirm-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash, nonce: NONCE, userAddress }),
        });
        const body = await resp.json();
        if (!resp.ok) throw new Error(body.error || 'Server error');

        btn.textContent = '✓ Paid';
        setStatus(
          '⏳ Payment confirmed! Finding best agent…' +
          '<a class="tx-link" href="https://basescan.org/tx/' + txHash + '" target="_blank">View on Basescan →</a>',
          'loading'
        );

        // Poll for job result (up to 2 min)
        let polls = 0;
        const poll = setInterval(async () => {
          polls++;
          if (polls > 40) {
            clearInterval(poll);
            setStatus(
              '✓ Payment sent. Result coming in your XMTP chat.' +
              '<a class="tx-link" href="https://basescan.org/tx/' + txHash + '" target="_blank">View payment →</a>',
              'success'
            );
            return;
          }
          try {
            const s = await fetch('/api/payment-status/' + NONCE).then(r => r.json());
            if (s.status === 'done') {
              clearInterval(poll);
              setStatus(
                '✓ Done! Result sent to your XMTP chat.' +
                (s.jobTx ? '<a class="tx-link" href="https://basescan.org/tx/' + s.jobTx + '" target="_blank">View job onchain →</a>' : ''),
                'success'
              );
            } else if (s.status === 'failed') {
              clearInterval(poll);
              setStatus('Job failed: ' + s.error, 'error');
              document.getElementById('pay-btn').disabled = false;
            }
          } catch { /* ignore poll errors */ }
        }, 3000);

      } catch (err) {
        setStatus('Error: ' + (err.shortMessage || err.message || String(err)), 'error');
        document.getElementById('pay-btn').disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
```

### Server-side payment confirmation (same pattern as ChatTrader)

```typescript
// In src/index.ts — POST /api/confirm-payment
type PaymentStatus = 
  | { status: "processing" }
  | { status: "done"; jobTx?: string }
  | { status: "failed"; error: string };

type PendingEntry = {
  type: "broker";
  userAddress: `0x${string}`;
  agent: SubAgent;
  intent: Intent;
  send: (text: string) => Promise<void>;
  expiresAt: number;
};

const paymentStatus = new Map<string, PaymentStatus>();
const pendingPayments = new Map<string, PendingEntry>();

// POST /api/confirm-payment
const body = await readBody(req) as { txHash: string; nonce: string; userAddress: string };
const { txHash, nonce, userAddress } = body;

const pending = pendingPayments.get(nonce);
if (!pending || Date.now() > pending.expiresAt) {
  json(res, { error: "Payment window expired" }, 410);
  return;
}

paymentStatus.set(nonce, { status: "processing" });
json(res, { status: "processing", txHash });   // respond immediately

(async () => {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 120_000,
    });
    if (receipt.status !== "success") {
      paymentStatus.set(nonce, { status: "failed", error: "Transaction reverted" });
      return;
    }

    // Call sub-agent via x402
    const result = await callAgentEndpoint(pending.agent.endpoint, pending.intent.query);

    // Record job onchain
    const jobTx = await recordJob({
      jobId: `0x${randomBytes(32).toString("hex")}` as `0x${string}`,
      user: pending.userAddress,
      charged: Number(USER_FEE),
      paidOut: pending.agent.price,
      agentName: pending.agent.name,
      agentId: pending.agent.agentId,
    });

    paymentStatus.set(nonce, { status: "done", jobTx });

    await pending.send([
      `✅ Done — via ${pending.agent.name}\n`,
      result,
      `\n─────────────────`,
      `Job recorded onchain ✓`,
      `View: https://basescan.org/tx/${jobTx}`,
    ].join("\n")).catch(console.error);

  } catch (e) {
    paymentStatus.set(nonce, { status: "failed", error: (e as Error).message });
    await pending.send(`❌ Job failed: ${(e as Error).message}`).catch(console.error);
  } finally {
    pendingPayments.delete(nonce);
  }
})();
```

### XMTP send() closure — always sync first

```typescript
// CRITICAL: background tasks must sync before getConversationById
const send = async (text: string): Promise<void> => {
  try {
    await client.conversations.sync();
    const conv = await client.conversations.getConversationById(convId);
    if (conv) await conv.send(text);
    else console.error(`[xmtp] conv ${convId} not found after sync`);
  } catch (e) {
    console.error("[xmtp] send error:", e);
  }
};
```

---

## LESSONS FROM CHATTRADER — APPLY EVERYWHERE

Hard-won fixes from a production XMTP bot on Base. Not suggestions — requirements.

1. **XMTP background tasks**: Always call `await client.conversations.sync()` BEFORE
   `client.conversations.getConversationById(convId)` in any async callback running
   outside the message handler (payment confirmations, sub-agent callbacks, etc).
   Without sync(), getConversationById returns null on a stale cache.

2. **Browser payments — direct ERC-20 only, never EIP-3009**:
   Coinbase Wallet mobile returns ABI-encoded empty bytes when asked to sign
   `eth_signTypedData_v4` (r=0x0000...0020, s=0x0000...0000).
   This causes "FiatTokenV2: invalid signature" on-chain. Wallet-level bug, not fixable.
   Solution: use `USDC.transfer(agentAddress, amount)` via `encodeFunctionData`.
   Server side: watch the tx hash with `publicClient.waitForTransactionReceipt`.

3. **viem in browser**: `import from 'https://esm.sh/viem@2.21.0'` — only this CDN
   works reliably. unpkg and skypack fail.

4. **Payment polling**: browser polls `/api/payment-status/:nonce` every 3s, max 40
   polls (2 min). Server responds 200 to POST immediately, processes async.

5. **Price data from cloud** (if needed — Render/Railway): CoinCap DNS fails, Binance
   returns 451, CoinGecko rate-limits cloud IPs. Use in order:
   1. CryptoCompare: `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=ETH&tsyms=USD`
      → `RAW.ETH.USD.PRICE`, `RAW.ETH.USD.CHANGEPCT24HOUR`
   2. Kraken: `https://api.kraken.com/0/public/Ticker?pair=ETHUSD`
      → `result[pair].c[0]` (price), `result[pair].P[1]` (24h %)
   3. CoinGecko: last resort only

6. **skipLibCheck: true** in ALL tsconfig files — no exceptions.

7. **ERC-8021 Builder Code suffix** on EVERY on-chain write:
   ```typescript
   const data = concat([calldata, hexToBytes(`0x${Buffer.from(BUILDER_CODE).toString("hex")}`)]);
   ```

---

## ARCHITECTURE

```
YOUR WALLET (0xOWNER...)          — deploys contract, owns it, calls withdraw()
      │
      ▼
SwitchboardVault.sol              — holds USDC, simple escrow + withdraw
      │
      ▼
AGENT WALLET (0xAGENT...)         — stored in Render env, does all daily ops:
      ├── listens on XMTP
      ├── searches ERC-8004 registry
      ├── pays sub-agents via x402
      ├── serves browser pay pages
      └── receives user payments (USDC.transfer → watches receipt)
```

Economic loop:
```
User pays $0.05 USDC to agent wallet (browser pay page)
       ↓
Agent wallet watches receipt via publicClient.waitForTransactionReceipt
       ↓
SWITCHBOARD finds best ERC-8004 agent via 8004scan (score > 85, hasX402)
       ↓
SWITCHBOARD calls sub-agent endpoint (x402 auto-pay, ~$0.01–$0.03)
       ↓
recordJob() → SwitchboardVault onchain (with ERC-8021 builder code suffix)
       ↓
Result delivered to user via XMTP
       ↓
Margin ($0.02–$0.04) accumulates in vault → owner calls withdraw()
```

---

## MONOREPO STRUCTURE

```
switchboard/
├── packages/
│   ├── contracts/
│   │   ├── contracts/SwitchboardVault.sol
│   │   ├── scripts/deploy.ts
│   │   ├── hardhat.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── deployments/base.json   (created by deploy script)
│   ├── agent/
│   │   ├── src/
│   │   │   ├── index.ts        # Express (health + REST) + XMTP boot
│   │   │   ├── xmtp.ts         # XMTP listener, message dispatch
│   │   │   ├── registry.ts     # ERC-8004 agent search via 8004scan
│   │   │   ├── broker.ts       # find agent → request payment → call → deliver
│   │   │   ├── caller.ts       # HTTP calls to sub-agents (x402 auto-pay)
│   │   │   ├── vault.ts        # recordJob() → SwitchboardVault
│   │   │   ├── wallet.ts       # viem WalletClient + PublicClient
│   │   │   ├── sessions.ts     # in-memory session + job log Maps
│   │   │   ├── payPage.ts      # buildPayPage() — direct USDC transfer
│   │   │   └── constants.ts    # addresses + config
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── render.yaml
│   │   └── .env.example
│   └── dashboard/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── api.ts
│       │   └── components/
│       │       ├── StatCards.tsx
│       │       ├── JobFeed.tsx
│       │       ├── AgentNetwork.tsx
│       │       ├── WithdrawBar.tsx
│       │       └── LiveIndicator.tsx
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vercel.json
├── package.json                    # workspaces: ["packages/*"]
└── README.md
```

---

## PART 1 — SMART CONTRACT (packages/contracts)

### packages/contracts/contracts/SwitchboardVault.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SwitchboardVault
/// @notice Agent operator receives payments, owner withdraws profits.
/// @dev Owner = personal wallet. Operator = agent wallet on Render.
contract SwitchboardVault is Ownable {

    IERC20 public immutable usdc;
    address public operator;

    uint256 public userFee   = 50000;   // $0.05 in USDC 6-decimals
    uint256 public minMargin = 10000;   // $0.01 minimum profit per job

    uint256 public totalJobs;
    uint256 public totalRevenue;
    uint256 public totalPaidToAgents;

    bytes public builderCode;

    struct Job {
        bytes32  jobId;
        address  user;
        uint256  charged;
        uint256  paidOut;
        uint256  margin;
        string   agentName;
        uint256  agentId;
        uint256  timestamp;
    }

    mapping(bytes32 => Job) public jobs;
    bytes32[] public jobLog;

    event JobRecorded(
        bytes32 indexed jobId,
        address indexed user,
        uint256 charged,
        uint256 paidOut,
        uint256 margin,
        string agentName,
        uint256 agentId
    );
    event OperatorUpdated(address indexed newOperator);
    event FeeUpdated(uint256 newFee);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    constructor(
        address _usdc,
        address _operator,
        address _owner,
        bytes memory _builderCode
    ) Ownable(_owner) {
        usdc = IERC20(_usdc);
        operator = _operator;
        builderCode = _builderCode;
    }

    function recordJob(
        bytes32 jobId,
        address user,
        uint256 charged,
        uint256 paidOut,
        string calldata agentName,
        uint256 agentId
    ) external onlyOperator {
        require(jobs[jobId].timestamp == 0, "Job exists");
        require(charged > paidOut, "No margin");
        require(charged - paidOut >= minMargin, "Below min margin");

        uint256 margin = charged - paidOut;
        jobs[jobId] = Job({
            jobId:     jobId,
            user:      user,
            charged:   charged,
            paidOut:   paidOut,
            margin:    margin,
            agentName: agentName,
            agentId:   agentId,
            timestamp: block.timestamp
        });
        jobLog.push(jobId);
        totalJobs++;
        totalRevenue      += charged;
        totalPaidToAgents += paidOut;
        emit JobRecorded(jobId, user, charged, paidOut, margin, agentName, agentId);
    }

    function withdraw() external onlyOwner {
        uint256 bal = usdc.balanceOf(address(this));
        require(bal > 0, "Nothing to withdraw");
        require(usdc.transfer(owner(), bal), "Transfer failed");
        emit Withdrawn(owner(), bal);
    }

    function setUserFee(uint256 newFee) external onlyOwner {
        userFee = newFee;
        emit FeeUpdated(newFee);
    }

    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
        emit OperatorUpdated(newOperator);
    }

    function getJobLog() external view returns (bytes32[] memory) {
        return jobLog;
    }

    function getStats() external view returns (
        uint256 _totalJobs,
        uint256 _totalRevenue,
        uint256 _totalPaidToAgents,
        uint256 _profit,
        uint256 _balance
    ) {
        return (
            totalJobs,
            totalRevenue,
            totalPaidToAgents,
            totalRevenue - totalPaidToAgents,
            usdc.balanceOf(address(this))
        );
    }
}
```

### packages/contracts/hardhat.config.ts

- Networks: Base mainnet (`https://mainnet.base.org`, chainId 8453) + Base Sepolia
- Etherscan verify: Basescan API key from `BASESCAN_API_KEY` env var
- Solidity: 0.8.20

### packages/contracts/scripts/deploy.ts

Deploy `SwitchboardVault`:
- `_usdc`: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- `_operator`: `process.env.AGENT_WALLET_ADDRESS`
- `_owner`: `process.env.OWNER_WALLET_ADDRESS` (personal wallet — deploy only)
- `_builderCode`: `Buffer.from(process.env.BUILDER_CODE!)` as bytes

Log deployed address. Verify on Basescan. Save to `deployments/base.json`.

---

## PART 2 — AGENT (packages/agent)

### src/constants.ts

```typescript
export const IDENTITY_REGISTRY   = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
export const USDC_ADDRESS        = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BASE_RPC            = "https://mainnet.base.org";
export const SCAN_API_BASE       = "https://8004scan.io";
export const USER_FEE            = BigInt(process.env.USER_FEE   ?? "50000");  // $0.05
export const MIN_MARGIN          = BigInt(process.env.MIN_MARGIN ?? "10000");  // $0.01
export const BUILDER_CODE        = process.env.BUILDER_CODE ?? "";
export const VAULT_ADDRESS       = (process.env.VAULT_ADDRESS ?? "") as `0x${string}`;
```

### src/wallet.ts

```typescript
import { createWalletClient, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_RPC } from "./constants.js";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);

export const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC) });
export const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC) });
```

### src/registry.ts

```typescript
export type SubAgent = {
  agentId:      number;
  name:         string;
  chain:        string;
  score:        number;
  endpoint:     string;
  hasX402:      boolean;
  price:        number;        // USDC 6-decimal units (e.g. 10000 = $0.01)
  capabilities: string[];
};

// Query 8004scan API for agents matching a keyword.
// Filter: score > 85, hasX402 = true, reachable endpoint.
// Sort: score desc, then price asc (cheapest good agent wins).
export async function findBestAgent(task: string): Promise<SubAgent | null>

// HEAD request to endpoint. If 402 returned, parse X-Payment-Required header for price.
// Returns price in USDC 6-decimal units, or 0 if not x402.
async function probeAgentPrice(endpoint: string): Promise<number>

// Fetch tokenURI from IDENTITY_REGISTRY, resolve the IPFS/HTTP JSON.
async function resolveAgentRegistration(chain: string, agentId: number): Promise<Registration>
```

### src/broker.ts

```typescript
// Core orchestration. Called from xmtp.ts message handler.
export async function handleUserRequest(
  userAddress: `0x${string}`,
  message: string,
  send: (text: string) => Promise<void>,   // closure with sync() already baked in
  sessionId: string,
  nonce: string                            // pre-generated, used for pay URL + status map
): Promise<void>

// Intent types: "price", "analysis", "data", "swap_signal", "custom"
// If no agent found OR margin < MIN_MARGIN: send explanation, do NOT proceed.
// On success: pendingPayments.set(nonce, { type: "broker", ... })
// Send user the browser pay page URL.
```

### src/vault.ts

```typescript
import { concat, encodeFunctionData, hexToBytes } from "viem";
import { walletClient } from "./wallet.js";
import { VAULT_ADDRESS, BUILDER_CODE } from "./constants.js";

// ERC-8021: append builder code bytes to every calldata
async function recordJob(params: RecordJobParams): Promise<`0x${string}`> {
  const calldata = encodeFunctionData({ abi: VAULT_ABI, functionName: "recordJob", args: [...] });
  const suffix = hexToBytes(`0x${Buffer.from(BUILDER_CODE).toString("hex")}`);
  const data = concat([calldata, suffix]);
  return walletClient.sendTransaction({ to: VAULT_ADDRESS, data });
}
```

### src/xmtp.ts

```typescript
// Message dispatch:
// "status"         → active jobs + agent wallet USDC balance
// "history"        → last 5 jobs this session
// "agents"         → top 5 available agents in 8004 right now
// "help"           → command list
// "CONFIRM"/"paid" → legacy fallback (main flow uses browser pay page)
// anything else    → broker.handleUserRequest()

// ALWAYS build send() with sync():
const send = async (text: string): Promise<void> => {
  try {
    await client.conversations.sync();
    const conv = await client.conversations.getConversationById(convId);
    if (conv) await conv.send(text);
    else console.error(`[xmtp] conv ${convId} not found after sync`);
  } catch (e) {
    console.error("[xmtp] send error:", e);
  }
};
```

### src/index.ts — Express endpoints

```
GET  /health                       → { status: "ok", uptime }
GET  /pay/:nonce                   → buildPayPage() if browser (Accept: text/html)
                                     → 402 JSON if API client
POST /api/confirm-payment          → { txHash, nonce, userAddress }
                                     Respond 200 immediately. Async:
                                     waitForTransactionReceipt → callAgent
                                     → recordJob → send() → set paymentStatus
GET  /api/payment-status/:nonce    → paymentStatus.get(nonce) ?? { status: "unknown" }
GET  /api/stats                    → vault.getStats() + uptime + agent USDC balance
GET  /api/jobs                     → last 50 JobRecorded events
GET  /api/agents                   → last 10 sub-agents used
```

CORS: `Access-Control-Allow-Origin: *` on all endpoints.

### src/index.ts — browser detection

```typescript
function isBrowser(req: http.IncomingMessage): boolean {
  return req.headers.accept?.includes("text/html") ?? false;
}

// GET /pay/:nonce
if (isBrowser(req)) {
  const pending = pendingPayments.get(nonce);
  if (!pending) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(buildPayPage(Number(USER_FEE) / 1e6, "SWITCHBOARD service", AGENT_WALLET_ADDRESS));
} else {
  json(res, { error: "Payment required", amountUSDC: Number(USER_FEE) / 1e6 }, 402);
}
```

### XMTP reply style

```
🔀 SWITCHBOARD

🔍 Found: Toppa (score: 94.0, Base)
   Capability: market analysis
   Their price: $0.01 · Your cost: $0.05

💰 Pay 0.05 USDC:
   https://switchboard.onrender.com/pay/abc123

⏱️ Window: 5 minutes
```

After delivery:
```
✅ Done — via Toppa

[result from sub-agent]

─────────────────
Job recorded onchain ✓
View: https://basescan.org/tx/0x...
```

### packages/agent/.env.example

```
AGENT_PRIVATE_KEY=0x...        # agent wallet — Render only, never share
AGENT_WALLET_ADDRESS=0x...     # derived from above
OWNER_WALLET_ADDRESS=0x...     # personal wallet — deploy only, NEVER to Render
BUILDER_CODE=bc_...            # from api.base.dev (register with owner wallet)
VAULT_ADDRESS=0x...            # deployed SwitchboardVault address
BASE_RPC_URL=https://mainnet.base.org
USER_FEE=50000                 # $0.05 in USDC 6 decimals
MIN_MARGIN=10000               # $0.01 minimum
PORT=3000
BOT_URL=https://switchboard.onrender.com   # set after first deploy
```

### packages/agent/render.yaml

```yaml
services:
  - type: web
    name: switchboard-agent
    runtime: node
    buildCommand: npm install && npm run build
    startCommand: node dist/index.js
    envVars:
      - key: AGENT_PRIVATE_KEY
        sync: false
      - key: AGENT_WALLET_ADDRESS
        sync: false
      - key: VAULT_ADDRESS
        sync: false
      - key: BUILDER_CODE
        value: "bc_CHANGEME"
      - key: BASE_RPC_URL
        value: "https://mainnet.base.org"
      - key: USER_FEE
        value: "50000"
      - key: MIN_MARGIN
        value: "10000"
      - key: PORT
        value: "3000"
      - key: BOT_URL
        sync: false
```

### packages/agent/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

---

## PART 3 — DASHBOARD (packages/dashboard)

### Design System

```
Font:        "IBM Plex Mono" (Google Fonts)
Background:  #0C0C0F
Card bg:     #131720
Border:      1px solid #1E1E2E
Accent:      #818CF8  (indigo)
Profit:      #34D399  (emerald)
Cost:        #F87171  (red)
Muted text:  #475569
```

### Layout

```
┌────────────────────────────────────────────────────────┐
│ 🔀 SWITCHBOARD          Base Mainnet        ● LIVE     │
│ Agent broker · ERC-8004 network                        │
├──────────┬──────────┬──────────┬───────────────────────┤
│ JOBS     │ REVENUE  │ PAID OUT │ PROFIT (withdrawable) │
│ 312      │ $15.60   │ $3.12    │ $12.48 USDC           │
├──────────┴──────────┴──────────┴───────────────────────┤
│ AGENTS USED (from ERC-8004 network)                    │
│  Toppa  · score 94.0 · 89 jobs · $0.01/req            │
│  Agent8 · score 93.4 · 44 jobs · $0.02/req            │
├────────────────────────────────────────────────────────┤
│ JOB LOG (onchain · SwitchboardVault events)            │
├──────────┬───────────────┬────────┬─────────┬──────────┤
│ TIME     │ USER          │ AGENT  │ CHARGED │ MARGIN   │
├──────────┼───────────────┼────────┼─────────┼──────────┤
│ 12:04:21 │ 0x4a3f...     │ Toppa  │ $0.05   │ +$0.04  │
│ 11:58:44 │ 0x9f2a...     │ Agent8 │ $0.05   │ +$0.03  │
├──────────┴───────────────┴────────┴─────────┴──────────┤
│ CONTRACT: 0x...  [basescan ↗]                          │
│ VAULT BALANCE: 12.48 USDC available                    │
│ Withdraw via your wallet at basescan writeContract     │
└────────────────────────────────────────────────────────┘
```

### Components

- **StatCards.tsx** — jobs, revenue, paid out, profit, live USDC balance from `/api/stats`
- **JobFeed.tsx** — new rows flash `#818CF8` for 300ms; MARGIN column always emerald;
  click TX hash → basescan; poll every 5s
- **AgentNetwork.tsx** — card per sub-agent: name, score, jobs routed, avg price,
  link to 8004scan profile; from `/api/agents`
- **WithdrawBar.tsx** — shows vault USDC balance; banner: "Withdraw from your wallet
  at basescan.org/address/[VAULT]#writeContract"; NO withdraw button (safer)
- **LiveIndicator.tsx** — pulsing dot; polls `/api/stats` every 10s

### packages/dashboard/package.json

```json
{
  "scripts": {
    "build": "vite build"
  }
}
```
**ONLY `vite build`** in the build script. No other commands.

### packages/dashboard/tsconfig.json

```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  }
}
```

### packages/dashboard/vercel.json

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## ROOT FILES

### package.json (workspaces root)

```json
{
  "name": "switchboard",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build:agent": "npm run build --workspace=packages/agent",
    "build:dashboard": "npm run build --workspace=packages/dashboard"
  }
}
```

---

## DEPLOY ORDER

1. **Generate agent wallet**:
   ```bash
   cast wallet new
   ```
   Save private key → Render `AGENT_PRIVATE_KEY`

2. **Deploy contract** (from your personal wallet):
   ```bash
   cd packages/contracts
   OWNER_WALLET_ADDRESS=0x... AGENT_WALLET_ADDRESS=0x... BUILDER_CODE=bc_... \
   npx hardhat run scripts/deploy.ts --network base
   ```
   → VAULT_ADDRESS saved to `deployments/base.json`

3. **Register Builder Code** (with your personal wallet):
   ```bash
   curl -X POST https://api.base.dev/v1/agents/builder-codes \
     -d '{"walletAddress": "0xYOUR..."}'
   ```

4. **Register SWITCHBOARD in ERC-8004** at [8004scan.io](https://8004scan.io)
   (connect your personal wallet):
   - name: `SWITCHBOARD`
   - description: `Agent broker. Finds and pays ERC-8004 agents on your behalf.`
   - endpoint: `xmtp://0xAGENT...`
   - owner: your personal wallet

5. **Fund agent wallet**:
   - 0.005 ETH for gas
   - 1 USDC for sub-agent payments

6. **Set env vars in Render → deploy**

7. **Update `BOT_URL`** in Render to live service URL

8. **Set `VITE_API_URL`** in Vercel → deploy dashboard

---

## GLOBAL CONSTRAINTS — NON-NEGOTIABLE

- `skipLibCheck: true` in ALL tsconfig files
- Dashboard `package.json` build script: `"vite build"` ONLY
- CORS fully open on agent API
- ERC-8021 Builder Code suffix appended to EVERY on-chain write (vault.ts)
- `OWNER_WALLET_ADDRESS` never in Render config — deploy time only
- `withdraw()` called manually from personal wallet, never from the app
- `USER_FEE` hardcoded $0.05; sub-agent price discovered at runtime by probing
- `recordJob()` called ONLY after successful delivery — no failed-job pollution
- In-memory Maps for sessions/payments — no database for MVP
- If no x402 sub-agent found with margin ≥ MIN_MARGIN → tell user, do NOT proceed
- Payment page uses direct `USDC.transfer()`, never `eth_signTypedData_v4`
- XMTP `send()` closure always calls `conversations.sync()` before `getConversationById()`
- Price data (if needed): CryptoCompare → Kraken → CoinGecko (in that order)

---

## GENERATION ORDER

Generate all files in this order:

1. `packages/contracts/` — Solidity + Hardhat config + deploy script
2. `packages/agent/src/` — all TypeScript source files
3. `packages/agent/` root files — package.json, tsconfig.json, render.yaml, .env.example
4. `packages/dashboard/src/` — React + all components
5. `packages/dashboard/` root files — package.json, tsconfig.json, vercel.json, index.html
6. Root `package.json` + `README.md` (with full deploy order)
