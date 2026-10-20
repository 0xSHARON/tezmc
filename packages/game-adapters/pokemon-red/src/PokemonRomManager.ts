import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { EventEmitter } from 'node:events';

export class PokemonRomManager extends EventEmitter {
  private static readonly DEFAULT_ROM_URL =
    'https://archive.org/download/game-boy-and-game-boy-color-complete-collection/Pokemon%20Red%20Version%20%28USA%29%20%28SGB%20Enhanced%29.gb';

  public static getDefaultRomPath(): string {
    const cwd = process.cwd();
    const candidateDirs = [
      path.join(cwd, 'data', 'roms'),
      path.join(cwd, '..', '..', 'data', 'roms'),
      '/app/data/roms',
      path.join(cwd, 'roms')
    ];

    // Priority 1: Check for pokemon_red_enhanced.gb
    for (const dir of candidateDirs) {
      const enhancedPath = path.join(dir, 'pokemon_red_enhanced.gb');
      if (fs.existsSync(enhancedPath)) {
        return enhancedPath;
      }
    }

    // Priority 2: Check for pokemon_red.gb
    for (const dir of candidateDirs) {
      const redPath = path.join(dir, 'pokemon_red.gb');
      if (fs.existsSync(redPath)) {
        return redPath;
      }
    }

    return path.join(cwd, 'data', 'roms', 'pokemon_red_enhanced.gb');
  }

  public static async ensureRom(customPath?: string, allowDownload = true): Promise<{ path: string; buffer: Buffer; title: string }> {
    const targetPath = customPath || this.getDefaultRomPath();

    if (fs.existsSync(targetPath)) {
      const buffer = fs.readFileSync(targetPath);
      const title = this.validateHeader(buffer);
      if (title) {
        return { path: targetPath, buffer, title };
      }
    }

    if (!allowDownload) {
      throw new Error(`Pokemon Red ROM not found on disk at: ${targetPath}`);
    }

    // Auto-download ROM
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const buffer = await this.downloadRom(this.DEFAULT_ROM_URL);
    const title = this.validateHeader(buffer) || 'POKEMON RED';

    fs.writeFileSync(targetPath, buffer);
    return { path: targetPath, buffer, title };
  }

  private static validateHeader(buffer: Buffer): string | null {
    if (buffer.length < 0x150) return null;
    const rawTitle = buffer.subarray(0x134, 0x143).toString('ascii').replace(/\0/g, '').trim();
    if (rawTitle.includes('POKEMON') || rawTitle.includes('RED')) {
      return rawTitle;
    }
    return rawTitle || null;
  }

  private static downloadRom(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const fetchUrl = (currentUrl: string, redirectsRemaining = 5) => {
        if (redirectsRemaining <= 0) {
          reject(new Error('Too many HTTP redirects while downloading Pokemon Red ROM'));
          return;
        }

        const req = https.get(currentUrl, {
          headers: { 'User-Agent': 'TEZMC-Autonomous-Stream/1.0 (Retro Emulation Pipeline)' }
        }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, currentUrl).toString();
            fetchUrl(redirectUrl, redirectsRemaining - 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Failed to download Pokemon Red ROM: HTTP ${res.statusCode}`));
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });

        req.on('error', reject);
      };

      fetchUrl(url);
    });
  }
}
