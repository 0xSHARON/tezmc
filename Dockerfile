# Multi-stage production build for AutoPlay AI on Ubuntu
FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install FFmpeg, Xvfb, Chromium, Python3, and graphic dependencies for headless canvas & retro emulation
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    xvfb \
    chromium \
    mesa-utils \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    procps \
    curl \
    ca-certificates \
    python3 \
    python3-pip \
    python3-pil \
    libsdl2-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir pyboy pillow --break-system-packages

RUN npm install -g pnpm

# Copy workspace package manifests
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/shared/package.json ./packages/shared/
COPY packages/game-adapters/adapter-sdk/package.json ./packages/game-adapters/adapter-sdk/
COPY packages/game-adapters/subway-surfers/package.json ./packages/game-adapters/subway-surfers/
COPY packages/game-adapters/pokemon-red/package.json ./packages/game-adapters/pokemon-red/
COPY packages/streaming/package.json ./packages/streaming/
COPY packages/capture/package.json ./packages/capture/
COPY packages/overlay/package.json ./packages/overlay/
COPY packages/chat-interactivity/package.json ./packages/chat-interactivity/
COPY packages/session-manager/package.json ./packages/session-manager/
COPY services/scheduler/package.json ./services/scheduler/
COPY services/monitoring/package.json ./services/monitoring/

# Install dependencies
RUN pnpm install --frozen-lockfile=false --dangerously-allow-all-builds

# Copy source trees
COPY . .

# Build all packages & apps
RUN pnpm run build

RUN chmod +x deploy/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000 5173 3008

ENTRYPOINT ["./deploy/docker-entrypoint.sh"]
