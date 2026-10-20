import pino from 'pino';
import { SecretRedactor } from '@autoplay/shared';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    log(obj) {
      return SecretRedactor.redactObject(obj);
    }
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:HH:MM:ss'
          }
        }
      : undefined
});
