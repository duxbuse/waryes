/**
 * RedisCoordinator - Tracks game server instances for horizontal scaling.
 *
 * Each server instance registers itself in a Redis sorted set, updating
 * its game count periodically. A coordinator can query the least-loaded
 * instance for routing new lobbies.
 *
 * Key layout:
 *   ss:servers          - sorted set: { instanceId: gameCount }
 *   ss:server:{id}      - hash: { host, port, activeGames, activePlayers, lastHeartbeat }
 *   ss:server:{id}:lock - TTL key: heartbeat expiry (auto-remove dead instances)
 */

import Redis from 'ioredis';
import { logger } from './logger';
import { randomUUID } from 'crypto';

const HEARTBEAT_INTERVAL_MS = 10_000; // 10 seconds
const INSTANCE_TTL_S = 30; // 30 seconds TTL — dead instances auto-expire
const KEY_PREFIX = 'ss:';

export interface ServerInstanceInfo {
  instanceId: string;
  host: string;
  port: number;
  activeGames: number;
  maxGames: number;
  activePlayers: number;
  lastHeartbeat: number;
}

export class RedisCoordinator {
  private redis: Redis | null = null;
  private readonly instanceId: string;
  private readonly host: string;
  private readonly port: number;
  private readonly maxGames: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private getLoadInfo: (() => { activeGames: number; maxGames: number; activePlayers: number }) | null = null;

  constructor(port: number, maxGames: number) {
    this.instanceId = `srv_${randomUUID().slice(0, 8)}`;
    this.host = process.env['FLY_ALLOC_ID']
      ? `${process.env['FLY_ALLOC_ID']}.vm.${process.env['FLY_APP_NAME']}.internal`
      : 'localhost';
    this.port = port;
    this.maxGames = maxGames;
  }

  /**
   * Connect to Redis. If REDIS_URL is not set, coordinator operates in no-op mode.
   */
  async connect(
    loadInfoFn: () => { activeGames: number; maxGames: number; activePlayers: number },
  ): Promise<void> {
    this.getLoadInfo = loadInfoFn;

    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      logger.info('No REDIS_URL configured — running in single-instance mode');
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 10) return null; // stop retrying
          return Math.min(times * 200, 5000);
        },
        lazyConnect: true,
      });

      await this.redis.connect();
      logger.info({ instanceId: this.instanceId, redisUrl: redisUrl.replace(/\/\/.*@/, '//***@') }, 'Redis connected');

      // Register this instance
      await this.registerInstance();

      // Start heartbeat
      this.heartbeatTimer = setInterval(() => {
        this.heartbeat().catch(err => logger.error({ err }, 'Heartbeat failed'));
      }, HEARTBEAT_INTERVAL_MS);
    } catch (err) {
      logger.warn({ err }, 'Failed to connect to Redis — running in single-instance mode');
      this.redis = null;
    }
  }

  /** Check if Redis is connected */
  isConnected(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  /** Register this server instance in Redis */
  private async registerInstance(): Promise<void> {
    if (!this.redis) return;

    const key = `${KEY_PREFIX}server:${this.instanceId}`;
    const info: Record<string, string> = {
      host: this.host,
      port: String(this.port),
      activeGames: '0',
      maxGames: String(this.maxGames),
      activePlayers: '0',
      lastHeartbeat: String(Date.now()),
    };

    await this.redis.hset(key, info);
    await this.redis.expire(key, INSTANCE_TTL_S);
    await this.redis.zadd(`${KEY_PREFIX}servers`, 0, this.instanceId);

    logger.info({ instanceId: this.instanceId }, 'Server instance registered');
  }

  /** Periodic heartbeat — updates load and refreshes TTL */
  private async heartbeat(): Promise<void> {
    if (!this.redis || !this.getLoadInfo) return;

    const load = this.getLoadInfo();
    const key = `${KEY_PREFIX}server:${this.instanceId}`;

    await this.redis
      .multi()
      .hset(key, {
        activeGames: String(load.activeGames),
        activePlayers: String(load.activePlayers),
        lastHeartbeat: String(Date.now()),
      })
      .expire(key, INSTANCE_TTL_S)
      .zadd(`${KEY_PREFIX}servers`, load.activeGames, this.instanceId)
      .exec();
  }

  /**
   * Get the least-loaded server instance for a new game.
   * Returns null if no instances have capacity.
   */
  async getLeastLoadedInstance(): Promise<ServerInstanceInfo | null> {
    if (!this.redis) {
      // Single-instance mode — return self
      const load = this.getLoadInfo?.() ?? { activeGames: 0, maxGames: this.maxGames, activePlayers: 0 };
      return {
        instanceId: this.instanceId,
        host: this.host,
        port: this.port,
        activeGames: load.activeGames,
        maxGames: load.maxGames,
        activePlayers: load.activePlayers,
        lastHeartbeat: Date.now(),
      };
    }

    // Get instances sorted by game count (ascending)
    const members = await this.redis.zrangebyscore(`${KEY_PREFIX}servers`, '-inf', '+inf', 'LIMIT', 0, 5);

    for (const memberId of members) {
      const key = `${KEY_PREFIX}server:${memberId}`;
      const data = await this.redis.hgetall(key);
      if (!data || !data['host']) continue; // expired instance

      const info: ServerInstanceInfo = {
        instanceId: memberId,
        host: data['host'],
        port: parseInt(data['port'] ?? '3001', 10),
        activeGames: parseInt(data['activeGames'] ?? '0', 10),
        maxGames: parseInt(data['maxGames'] ?? '20', 10),
        activePlayers: parseInt(data['activePlayers'] ?? '0', 10),
        lastHeartbeat: parseInt(data['lastHeartbeat'] ?? '0', 10),
      };

      if (info.activeGames < info.maxGames) {
        return info;
      }
    }

    return null;
  }

  /** Get all registered server instances (for admin/monitoring) */
  async getAllInstances(): Promise<ServerInstanceInfo[]> {
    if (!this.redis) return [];

    const members = await this.redis.zrangebyscore(`${KEY_PREFIX}servers`, '-inf', '+inf');
    const instances: ServerInstanceInfo[] = [];

    for (const memberId of members) {
      const key = `${KEY_PREFIX}server:${memberId}`;
      const data = await this.redis.hgetall(key);
      if (!data || !data['host']) continue;

      instances.push({
        instanceId: memberId,
        host: data['host'],
        port: parseInt(data['port'] ?? '3001', 10),
        activeGames: parseInt(data['activeGames'] ?? '0', 10),
        maxGames: parseInt(data['maxGames'] ?? '20', 10),
        activePlayers: parseInt(data['activePlayers'] ?? '0', 10),
        lastHeartbeat: parseInt(data['lastHeartbeat'] ?? '0', 10),
      });
    }

    return instances;
  }

  /** Get this instance's ID */
  getInstanceId(): string {
    return this.instanceId;
  }

  /** Graceful shutdown — deregister from Redis */
  async dispose(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.redis) {
      try {
        await this.redis.del(`${KEY_PREFIX}server:${this.instanceId}`);
        await this.redis.zrem(`${KEY_PREFIX}servers`, this.instanceId);
        logger.info({ instanceId: this.instanceId }, 'Server instance deregistered');
      } catch {
        // Best effort during shutdown
      }
      this.redis.disconnect();
      this.redis = null;
    }
  }
}
