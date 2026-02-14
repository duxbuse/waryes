/**
 * Structured logger using Pino.
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info({ lobbyCode: 'ABCD-1234' }, 'Lobby created');
 *   logger.warn({ tick: 100, desyncCount: 3 }, 'Desync detected');
 */

import pino from 'pino';

const level = process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug');

export const logger = pino({
  level,
  transport:
    process.env['NODE_ENV'] !== 'production'
      ? { target: 'pino/file', options: { destination: 1 } } // stdout in dev
      : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: {
    service: 'stellar-siege',
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
