/**
 * Script to generate TypeScript data files from JSON unit and weapon definitions
 * Run with: bun scripts/generate-data.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const unitsDir = path.join(rootDir, 'units');
const weaponsDir = path.join(rootDir, 'weapons');
const outputDir = path.join(rootDir, 'web', 'src', 'data', 'generated');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function loadAllJsonFiles(dir) {
  const results = [];

  function processDir(currentDir) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      if (item.isDirectory()) {
        processDir(fullPath);
      } else if (item.name.endsWith('.json')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const data = JSON.parse(content);
          results.push(data);
        } catch (err) {
          console.error(`Error loading ${fullPath}: ${err.message}`);
        }
      }
    }
  }

  processDir(dir);
  return results;
}

// Load all units
console.log('Loading unit JSON files...');
const units = loadAllJsonFiles(unitsDir);
console.log(`Loaded ${units.length} units`);

// Load all weapons
console.log('Loading weapon JSON files...');
const weapons = loadAllJsonFiles(weaponsDir);
console.log(`Loaded ${weapons.length} weapons`);

// Generate units.ts
const unitsContent = `/**
 * Auto-generated from JSON files in /units directory
 * Do not edit manually - run: bun scripts/generate-data.js
 */

import type { UnitData } from '../types';

export const UNITS_DATA: UnitData[] = ${JSON.stringify(units, null, 2)};

export function getUnitDataById(id: string): UnitData | undefined {
  return UNITS_DATA.find(u => u.id === id);
}

export function getUnitDataByCategory(category: string): UnitData[] {
  return UNITS_DATA.filter(u => u.category === category);
}

export function getUnitDataByFaction(factionPrefix: string): UnitData[] {
  return UNITS_DATA.filter(u => u.id.startsWith(factionPrefix));
}
`;

fs.writeFileSync(path.join(outputDir, 'units.ts'), unitsContent);
console.log('Generated units.ts');

// Generate weapons.ts
const weaponsContent = `/**
 * Auto-generated from JSON files in /weapons directory
 * Do not edit manually - run: bun scripts/generate-data.js
 */

import type { WeaponData } from '../types';

export const WEAPONS_DATA: WeaponData[] = ${JSON.stringify(weapons, null, 2)};

export function getWeaponDataById(id: string): WeaponData | undefined {
  return WEAPONS_DATA.find(w => w.id === id);
}
`;

fs.writeFileSync(path.join(outputDir, 'weapons.ts'), weaponsContent);
console.log('Generated weapons.ts');

// Generate index.ts for exports
const indexContent = `/**
 * Auto-generated data exports
 * Do not edit manually - run: bun scripts/generate-data.js
 */

export { UNITS_DATA, getUnitDataById, getUnitDataByCategory, getUnitDataByFaction } from './units';
export { WEAPONS_DATA, getWeaponDataById } from './weapons';
`;

fs.writeFileSync(path.join(outputDir, 'index.ts'), indexContent);
console.log('Generated index.ts');

console.log('\\nData generation complete!');
