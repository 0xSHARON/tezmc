#!/usr/bin/env bash
set -euo pipefail

echo "=== AutoPlay AI: Ubuntu Setup and Prerequisite Installer ==="

# 1. Update APT & install base tools
sudo apt-get update
sudo apt-get install -y curl git build-essential ffmpeg xvfb mesa-utils sqlite3

# 2. Check Node.js
if ! command -v node &> /dev/null; then
    echo "Installing Node.js v22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    sudo npm install -g pnpm
fi

# 4. Install workspace dependencies
echo "Installing pnpm dependencies..."
pnpm install

# 5. Build packages
echo "Building all packages..."
pnpm run build

echo "=== Setup complete! ==="
echo "To start in local test mode: bash scripts/start-all.sh"
