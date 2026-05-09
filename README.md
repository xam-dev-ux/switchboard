# 🔀 SWITCHBOARD

AI broker agent registered in ERC-8004 that receives user requests via XMTP, finds the best agent in the 8004 network, pays that agent via x402, and charges the user a margin.

## Architecture

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

## Monorepo Structure

```
switchboard/
├── .gitignore                      ← ignora .env y node_modules
├── packages/
│   ├── contracts/
│   │   ├── .env.example            ← copia a .env para hacer deploy
│   │   └── ...
│   ├── agent/
│   │   ├── .env.example            ← copia a .env / pega en Render
│   │   └── ...
│   └── dashboard/
│       └── ...
└── package.json
```

---

## Setup de variables de entorno

> ⚠️ **Nunca subas un archivo `.env` a Git.** El `.gitignore` ya los excluye,
> pero revisa siempre antes de hacer `git add`.

### contracts/.env

```bash
cd packages/contracts
cp .env.example .env
```

Edita `.env` y rellena:

| Variable | Descripción |
|---|---|
| `DEPLOY_PRIVATE_KEY` | Clave privada de tu wallet personal (deployer / owner). **Solo aquí, nunca en Render.** |
| `OWNER_WALLET_ADDRESS` | Dirección pública derivada de la clave anterior |
| `AGENT_WALLET_ADDRESS` | Dirección del wallet del agente (genera con `cast wallet new`) |
| `BUILDER_CODE` | Código obtenido en api.base.dev |
| `BASESCAN_API_KEY` | API key de basescan.org para verificar el contrato (opcional) |

### agent/.env

```bash
cd packages/agent
cp .env.example .env
```

Edita `.env` y rellena:

| Variable | Descripción |
|---|---|
| `AGENT_PRIVATE_KEY` | Clave privada del wallet del agente. **Solo aquí y en Render, nunca compartir.** |
| `AGENT_WALLET_ADDRESS` | Dirección pública del agente |
| `VAULT_ADDRESS` | Dirección del contrato desplegado (sale de `deployments/base.json`) |
| `BUILDER_CODE` | Mismo que en contracts |
| `BOT_URL` | URL pública de Render (rellena después del primer deploy) |
| Resto | Valores por defecto del `.env.example` sirven tal cual |

---

## Deploy Order

### 1. Genera dos wallets

```bash
# Wallet del agente (el que va a Render)
cast wallet new
# → guarda Address y Private Key en packages/agent/.env
```

Tu wallet personal (owner) lo tienes ya. Su clave privada va solo en `packages/contracts/.env`.

### 2. Crea los archivos .env

```bash
cp packages/contracts/.env.example packages/contracts/.env
cp packages/agent/.env.example     packages/agent/.env
# edítalos con tus valores reales
```

### 3. Despliega el contrato (desde tu wallet personal)

```bash
cd packages/contracts
npm install
npx hardhat run scripts/deploy.ts --network base
```

La dirección del contrato se guarda en `deployments/base.json`.
Cópiala a `VAULT_ADDRESS` en `packages/agent/.env`.

### 4. Registra el Builder Code (con tu wallet personal)

```bash
curl -X POST https://api.base.dev/v1/agents/builder-codes \
  -d '{"walletAddress": "0xTU_OWNER_WALLET"}'
```

Copia el `bc_...` resultante a `BUILDER_CODE` en ambos `.env`.

### 5. Registra SWITCHBOARD en ERC-8004

```bash
cd packages/contracts
npx hardhat run scripts/register.ts --network base
```

El script llama a `IdentityRegistry.registerAgent()` desde tu wallet personal con:
- name: `SWITCHBOARD`
- description: `Agent broker. Finds and pays ERC-8004 agents on your behalf.`
- endpoint: `xmtp://<AGENT_WALLET_ADDRESS>`
- capabilities: `["broker", "routing", "x402", "analysis", "price", "data"]`

Al terminar imprime el `agentId` asignado. Puedes verificarlo en [8004scan.io](https://8004scan.io).

### 6. Fondea el wallet del agente

- 0.005 ETH para gas
- 1 USDC para pagar a sub-agentes

### 7. Despliega el agente en Render

Añade las variables de entorno de `packages/agent/.env` en el dashboard de Render
(una a una o usando el bulk import).

> ⚠️ **No añadas `DEPLOY_PRIVATE_KEY` ni `OWNER_WALLET_ADDRESS` a Render.**
> Esas claves son solo para el deploy del contrato.

```bash
# Render ejecuta automáticamente:
npm install && npm run build
node dist/index.js
```

### 8. Actualiza BOT_URL

Una vez Render te dé la URL pública, ponla en la variable `BOT_URL` de Render.

### 9. Despliega el dashboard en Vercel

```bash
cd packages/dashboard
npm install && npm run build
```

En Vercel, añade la variable de entorno:
```
VITE_API_URL=https://switchboard.onrender.com
```

---

## Withdraw de beneficios

Llama a `withdraw()` desde tu wallet personal en Basescan:

```
https://basescan.org/address/[VAULT_ADDRESS]#writeContract
```

No hay botón de withdraw en la app. Solo el owner wallet puede llamarlo.

---

## Key Constraints

- `USER_FEE` = $0.05 USDC (50000 micro)
- `MIN_MARGIN` = $0.01 USDC (10000 micro) — si el margen es menor, no se procede
- Solo agentes con score > 85 y x402 habilitado
- Pago: `USDC.transfer()` directa, nunca `eth_signTypedData_v4`
- ERC-8021 builder code en cada write onchain
- Sin base de datos — Maps en memoria para MVP
- `OWNER_WALLET_ADDRESS` y `DEPLOY_PRIVATE_KEY` nunca a Render — solo al deploy
