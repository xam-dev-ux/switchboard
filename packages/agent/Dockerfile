FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 20 (Ubuntu 24.04 has glibc 2.39, satisfying @xmtp/node-bindings >= 2.38)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy agent package files (Docker context = repo root)
COPY packages/agent/package.json packages/agent/package-lock.json* ./
COPY packages/agent/scripts/ ./scripts/

RUN npm install

COPY packages/agent/tsconfig.json ./
COPY packages/agent/src/ ./src/

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
