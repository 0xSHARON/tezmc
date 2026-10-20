# Multi-stage production build for AutoPlay AI on Ubuntu
FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install FFmpeg, Xvfb and graphic dependencies for headless canvas & rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    xvfb \
    mesa-utils \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    procps \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

# Copy workspace package manifests
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-adapters/adapter-sdk/package.json ./packages/game-adapters/adapter-sdk/
COPY packages/game-adapters/minecraft-java/package.json ./packages/game-adapters/minecraft-java/
COPY packages/streaming/package.json ./packages/streaming/
COPY packages/capture/package.json ./packages/capture/
COPY packages/overlay/package.json ./packages/overlay/
COPY packages/session-manager/package.json ./packages/session-manager/
COPY services/scheduler/package.json ./services/scheduler/
COPY services/monitoring/package.json ./services/monitoring/

# Install dependencies
RUN pnpm install --frozen-lockfile=false

# Copy source trees
COPY . .

# Build all packages & apps
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000 5173 3007

CMD ["node", "apps/api/dist/index.js"]
