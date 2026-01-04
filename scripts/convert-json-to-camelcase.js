/**
 * Script to convert all unit and weapon JSON files from snake_case to camelCase
 */

const fs = require('fs');
const path = require('path');

// Field mappings for units
const unitFieldMappings = {
  off_road: 'offRoad',
  forward_deploy: 'forwardDeploy',
  is_commander: 'isCommander',
  weapon_id: 'weaponId',
  max_ammo: 'maxAmmo',
  rotation_speed: 'rotation',
};

// Field mappings for weapons
const weaponFieldMappings = {
  rate_of_fire: 'rateOfFire',
  aim_time: 'aimTime',
  reload_time: 'reloadTime',
  salvo_length: 'salvoLength',
  supply_cost: 'supplyCost',
  is_guided: 'isGuided',
  projectile_speed: 'projectileSpeed',
};

function convertKeys(obj, mappings) {
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeys(item, mappings));
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = mappings[key] || key;
      newObj[newKey] = convertKeys(value, mappings);
    }
    return newObj;
  }
  return obj;
}

function processFile(filePath, mappings, fileType) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Add id field based on filename if not present (for weapons)
    if (fileType === 'weapon' && !data.id) {
      const filename = path.basename(filePath, '.json');
      data.id = filename;
    }

    const converted = convertKeys(data, mappings);

    // Add default fields for units if missing
    if (fileType === 'unit') {
      if (converted.tags === undefined) converted.tags = [];
      if (converted.isCommander === undefined) converted.isCommander = false;
      if (converted.commanderAuraRadius === undefined) converted.commanderAuraRadius = 0;
      if (converted.transportCapacity === undefined) converted.transportCapacity = 0;
      if (converted.canBeTransported === undefined) {
        // Infantry can be transported by default
        converted.canBeTransported = converted.category === 'INF';
      }
      if (converted.transportSize === undefined) converted.transportSize = 1;
      if (converted.veterancyBonus === undefined) converted.veterancyBonus = 0.1;

      // Add rotation speed if missing
      if (converted.speed && converted.speed.rotation === undefined) {
        converted.speed.rotation = 8; // Default rotation speed
      }

      // Add turretMounted to weapons if missing
      if (converted.weapons) {
        converted.weapons = converted.weapons.map(w => ({
          ...w,
          turretMounted: w.turretMounted !== undefined ? w.turretMounted : false,
        }));
      }
    }

    // Add default fields for weapons if missing
    if (fileType === 'weapon') {
      if (converted.isAntiAir === undefined) {
        converted.isAntiAir = converted.range?.air !== null && converted.range?.air !== undefined;
      }
      if (converted.canTargetGround === undefined) converted.canTargetGround = true;

      // Convert accuracy from object to single number if needed
      if (converted.accuracy && typeof converted.accuracy === 'object') {
        // Use static accuracy as base, normalized to 0-1
        converted.accuracy = (converted.accuracy.static || 50) / 100;
      }

      // Convert damage from string to number if needed
      if (typeof converted.damage === 'string') {
        const match = converted.damage.match(/^([\d.]+)/);
        converted.damage = match ? parseFloat(match[1]) : 10;
      }

      // Convert range from object to single number (use ground range)
      if (converted.range && typeof converted.range === 'object') {
        converted.range = converted.range.ground || 100;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(converted, null, 2) + '\n');
    console.log(`Converted: ${filePath}`);
    return true;
  } catch (err) {
    console.error(`Error processing ${filePath}: ${err.message}`);
    return false;
  }
}

function processDirectory(dir, mappings, fileType) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  let count = 0;

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      count += processDirectory(fullPath, mappings, fileType);
    } else if (item.name.endsWith('.json')) {
      if (processFile(fullPath, mappings, fileType)) {
        count++;
      }
    }
  }

  return count;
}

// Main
const rootDir = path.resolve(__dirname, '..');

console.log('Converting unit JSON files...');
const unitsDir = path.join(rootDir, 'units');
const unitCount = processDirectory(unitsDir, unitFieldMappings, 'unit');
console.log(`Converted ${unitCount} unit files.\n`);

console.log('Converting weapon JSON files...');
const weaponsDir = path.join(rootDir, 'weapons');
const weaponCount = processDirectory(weaponsDir, weaponFieldMappings, 'weapon');
console.log(`Converted ${weaponCount} weapon files.\n`);

console.log('Done!');
