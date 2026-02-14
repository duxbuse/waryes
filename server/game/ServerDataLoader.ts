/**
 * ServerDataLoader - Loads unit, weapon, and division JSON data for the server.
 *
 * Uses Bun's glob to scan the web/src/data/ directory for JSON files.
 * This provides the same data as the client's Vite-based dataLoader.
 */

import { Glob } from 'bun';
import { join, resolve } from 'path';
import type { UnitData, WeaponData, DivisionData } from '@shared/data/types';

const DATA_DIR = resolve(import.meta.dir, '../../web/src/data');

let units: UnitData[] = [];
let weapons: WeaponData[] = [];
let divisions: DivisionData[] = [];
let loaded = false;

async function loadJsonFiles<T>(pattern: string): Promise<T[]> {
  const results: T[] = [];
  const glob = new Glob(pattern);

  for await (const file of glob.scan({ cwd: DATA_DIR, absolute: true })) {
    try {
      const content = await Bun.file(file).json();
      results.push(content as T);
    } catch (e) {
      console.warn(`[ServerDataLoader] Failed to load ${file}:`, e);
    }
  }

  return results;
}

/** Load all game data. Must be called once at server startup. */
export async function loadGameData(): Promise<void> {
  if (loaded) return;

  const [u, w, d] = await Promise.all([
    loadJsonFiles<UnitData>(join('units', '**', '*.json')),
    loadJsonFiles<WeaponData>(join('weapons', '**', '*.json')),
    loadJsonFiles<DivisionData>(join('divisions', '**', '*.json')),
  ]);

  units = u;
  weapons = w;
  divisions = d;
  loaded = true;

  console.log(`[ServerDataLoader] Loaded ${units.length} units, ${weapons.length} weapons, ${divisions.length} divisions`);
}

export function getUnits(): readonly UnitData[] {
  return units;
}

export function getWeapons(): readonly WeaponData[] {
  return weapons;
}

export function getDivisions(): readonly DivisionData[] {
  return divisions;
}

export function getUnitById(id: string): UnitData | undefined {
  return units.find(u => u.id === id);
}

export function getWeaponById(id: string): WeaponData | undefined {
  return weapons.find(w => w.id === id);
}

export function getDivisionById(id: string): DivisionData | undefined {
  return divisions.find(d => d.id === id);
}
