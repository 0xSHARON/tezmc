import os from 'node:os';
import fs from 'node:fs';
import { CaptureSource } from '@autoplay/streaming';

export class CaptureValidator {
  public static async resolveBestSource(preferredType?: string): Promise<CaptureSource> {
    const platform = os.platform();

    if (preferredType === 'test_pattern') {
      return {
        type: 'test_pattern',
        displayOrDevice: 'test_pattern',
        width: 1280,
        height: 720,
        fps: 30
      };
    }

    if (preferredType === 'x11' || platform === 'linux') {
      const display = process.env.DISPLAY || ':99.0';
      const x11Socket = `/tmp/.X11-unix/X${display.replace(':', '').split('.')[0]}`;

      if (fs.existsSync(x11Socket) || preferredType === 'x11') {
        return {
          type: 'x11',
          displayOrDevice: display,
          width: 1280,
          height: 720,
          fps: 30
        };
      }
    }

    if (platform === 'win32') {
      return {
        type: 'gdigrab',
        displayOrDevice: 'desktop',
        width: 1280,
        height: 720,
        fps: 30
      };
    }

    // Default to test pattern if no physical/virtual screen is present
    return {
      type: 'test_pattern',
      displayOrDevice: 'test_pattern',
      width: 1280,
      height: 720,
      fps: 30
    };
  }

  public static async validateSource(source: CaptureSource): Promise<boolean> {
    if (source.type === 'test_pattern') return true;
    if (source.type === 'x11') {
      const display = source.displayOrDevice || process.env.DISPLAY || ':99.0';
      const socket = `/tmp/.X11-unix/X${display.replace(':', '').split('.')[0]}`;
      return fs.existsSync(socket);
    }
    return true;
  }
}
