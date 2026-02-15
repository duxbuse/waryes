/**
 * Web Worker for map generation
 * Runs MapGenerator in a separate thread to avoid blocking the UI
 */
import { MapGenerator } from './MapGenerator';
import type { BiomeType, MapSize } from '../../data/types';

interface GenerateRequest {
  seed: number;
  size: MapSize;
  biome?: BiomeType;
}

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { seed, size, biome } = e.data;
  const generator = new MapGenerator(seed, size, biome);
  const map = generator.generate();
  self.postMessage(map);
};
