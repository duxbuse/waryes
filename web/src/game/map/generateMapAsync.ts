/**
 * Async wrapper for map generation using Web Workers
 * Spawns a worker, generates the map, then terminates the worker
 */
import type { GameMap, MapSize, BiomeType } from '../../data/types';

export function generateMapAsync(
  seed: number,
  size: MapSize,
  biome?: BiomeType
): Promise<GameMap> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./mapGeneratorWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent<GameMap>) => {
      resolve(e.data);
      worker.terminate();
    };

    worker.onerror = (e: ErrorEvent) => {
      reject(new Error(`Map generation failed: ${e.message}`));
      worker.terminate();
    };

    worker.postMessage({ seed, size, biome });
  });
}
