import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@autoplay/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@autoplay/adapter-sdk': path.resolve(__dirname, 'packages/game-adapters/adapter-sdk/src/index.ts'),
      '@autoplay/game-adapter-sdk': path.resolve(__dirname, 'packages/game-adapters/adapter-sdk/src/index.ts'),
      '@autoplay/adapter-minecraft-java': path.resolve(__dirname, 'packages/game-adapters/minecraft-java/src/index.ts'),
      '@autoplay/streaming': path.resolve(__dirname, 'packages/streaming/src/index.ts'),
      '@autoplay/capture': path.resolve(__dirname, 'packages/capture/src/index.ts'),
      '@autoplay/session-manager': path.resolve(__dirname, 'packages/session-manager/src/index.ts'),
      '@autoplay/overlay': path.resolve(__dirname, 'packages/overlay/src/index.ts'),
      '@autoplay/scheduler': path.resolve(__dirname, 'services/scheduler/src/index.ts'),
      '@autoplay/monitoring': path.resolve(__dirname, 'services/monitoring/src/index.ts')
    }
  },
  ssr: {
    external: ['node:sqlite', 'sqlite']
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
