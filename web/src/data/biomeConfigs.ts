/**
 * Biome Configuration System
 *
 * Defines visual appearance, terrain distribution, vegetation parameters,
 * and strategic objectives for each biome type.
 */

import type { BiomeConfig, BiomeType } from './types';

export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  rainforest: {
    id: 'rainforest',
    name: 'Rainforest',
    description: 'Dense jungle with heavy canopy and resource extraction sites',

    // Visual: Dark green, lush appearance
    groundColor: 0x3a5f3a,  // Dark green
    forestColor: 0x2a4a2a,  // Very dark green
    waterColor: 0x4a6a5a,   // Murky green-blue

    // Vegetation: Very dense forests, large patches
    forestDensity: { min: 3.0, max: 4.0 },
    forestSizeScale: 1.5,
    treeType: 'palm',

    // Terrain: More forest and hills, less open field
    terrainWeights: {
      field: 0.2,
      forest: 0.7,
      hill: 0.1,
    },

    // Elevation: Hills and valleys, few plains
    elevationFeatureWeights: {
      hill: 0.4,
      valley: 0.3,
      plains: 0.3,
    },

    // Settlements: Sparse, small villages
    settlementDensity: 0.3,
    settlementTypes: ['hamlet', 'village'],

    // Strategic objectives: Resource extraction + small settlements
    objectiveTypes: ['oil_field', 'logging_camp', 'indigenous_settlement', 'hamlet', 'village'],
    objectiveCount: { min: 3, max: 5 },

    // Balance: Limited open space, high cover
    openSpaceRatio: 0.25,
    coverRatio: 0.6,
  },

  tundra: {
    id: 'tundra',
    name: 'Tundra',
    description: 'Frozen wasteland with research facilities and mining operations',

    // Visual: Pale blue-white, icy appearance
    groundColor: 0xd0d8e0,  // Pale blue-white
    forestColor: 0xa0a8b0,  // Gray-white for sparse vegetation
    waterColor: 0x8090a0,   // Icy blue

    // Vegetation: Very sparse, small clusters
    forestDensity: { min: 0.2, max: 0.5 },
    forestSizeScale: 0.4,
    treeType: 'pine',

    // Terrain: Mostly open, minimal forest
    terrainWeights: {
      field: 0.8,
      forest: 0.05,
      hill: 0.15,
    },

    // Elevation: Plains and hills, gentle ridges
    elevationFeatureWeights: {
      plains: 0.4,
      hill: 0.3,
      ridge: 0.3,
    },

    // Settlements: Very sparse outposts
    settlementDensity: 0.2,
    settlementTypes: ['hamlet', 'village'],

    // Strategic objectives: Science and mining + outposts
    objectiveTypes: ['research_station', 'mine', 'fuel_depot', 'hamlet', 'village'],
    objectiveCount: { min: 3, max: 5 },

    // Balance: Lots of open space, minimal cover
    openSpaceRatio: 0.7,
    coverRatio: 0.1,
  },

  mesa: {
    id: 'mesa',
    name: 'Mesa',
    description: 'Arid plateau with mining and observation positions',

    // Visual: Tan/brown, rocky appearance
    groundColor: 0xc09060,  // Tan/brown
    forestColor: 0xa08050,  // Darker brown
    waterColor: 0x6a8a9a,   // Clear blue

    // Vegetation: Sparse, small shrubs
    forestDensity: { min: 0.3, max: 0.8 },
    forestSizeScale: 0.6,
    treeType: 'sparse',

    // Terrain: Mix of open and hills
    terrainWeights: {
      field: 0.6,
      forest: 0.1,
      hill: 0.3,
    },

    // Elevation: Plateaus and mountains
    elevationFeatureWeights: {
      plateau: 0.4,
      mountain: 0.3,
      hill: 0.3,
    },

    // Settlements: Moderate, varied sizes
    settlementDensity: 0.4,
    settlementTypes: ['hamlet', 'village', 'town'],

    // Strategic objectives: Mining and observation + settlements
    objectiveTypes: ['mining_operation', 'observation_post', 'water_well', 'hamlet', 'village', 'town'],
    objectiveCount: { min: 4, max: 5 },

    // Balance: Good open space, some cover
    openSpaceRatio: 0.6,
    coverRatio: 0.2,
  },

  mountains: {
    id: 'mountains',
    name: 'Mountains',
    description: 'High altitude terrain with strategic positions',

    // Visual: Mountain green-brown
    groundColor: 0x6b8e5a,  // Mountain green
    forestColor: 0x5a7a4a,  // Dark forest green
    waterColor: 0x4a7a9a,   // Mountain lake blue

    // Vegetation: Moderate forests
    forestDensity: { min: 1.0, max: 2.0 },
    forestSizeScale: 1.0,
    treeType: 'pine',

    // Terrain: Balanced distribution
    terrainWeights: {
      field: 0.3,
      forest: 0.3,
      hill: 0.4,
    },

    // Elevation: Mountains, ridges, valleys
    elevationFeatureWeights: {
      mountain: 0.5,
      ridge: 0.3,
      valley: 0.2,
    },

    // Settlements: Moderate density
    settlementDensity: 0.5,
    settlementTypes: ['hamlet', 'village', 'town'],

    // Strategic objectives: High-altitude positions + settlements
    objectiveTypes: ['communication_tower', 'ski_resort', 'military_base', 'hamlet', 'village', 'town'],
    objectiveCount: { min: 3, max: 5 },

    // Balance: Moderate open space and cover
    openSpaceRatio: 0.4,
    coverRatio: 0.35,
  },

  plains: {
    id: 'plains',
    name: 'Plains',
    description: 'Open grassland with agricultural infrastructure',

    // Visual: Grass green
    groundColor: 0x7aa855,  // Grass green
    forestColor: 0x5a8840,  // Forest green
    waterColor: 0x4a7a9a,   // Clear blue

    // Vegetation: Light-moderate forests
    forestDensity: { min: 0.8, max: 1.5 },
    forestSizeScale: 0.8,
    treeType: 'oak',

    // Terrain: Mostly open fields
    terrainWeights: {
      field: 0.75,
      forest: 0.15,
      hill: 0.1,
    },

    // Elevation: Plains dominant, some hills, occasional low plateaus
    elevationFeatureWeights: {
      plains: 0.6,
      hill: 0.3,
      valley: 0.05,
      plateau: 0.05,  // Low weight for occasional variety (0-2 per map)
    },

    // Settlements: High density
    settlementDensity: 0.8,
    settlementTypes: ['village', 'town'],

    // Strategic objectives: Agricultural infrastructure + settlements
    objectiveTypes: ['grain_silo', 'wind_farm', 'rail_junction', 'village', 'town'],
    objectiveCount: { min: 4, max: 5 },

    // Balance: Very open, good for ranged combat
    openSpaceRatio: 0.65,
    coverRatio: 0.2,
  },


  cities: {
    id: 'cities',
    name: 'Urban',
    description: 'Dense urban environment with city districts',

    // Visual: Gray concrete
    groundColor: 0x6a8840,  // Urban-park green (was 0x808080)
    forestColor: 0x4a5a4a,  // Slightly darker green (was 0x6a7a6a)
    waterColor: 0x4a6a8a,   // Urban water

    // Vegetation: Minimal (parks only)
    forestDensity: { min: 0.1, max: 0.3 },
    forestSizeScale: 0.5,
    treeType: 'oak',

    // Terrain: Dominated by buildings
    terrainWeights: {
      field: 0.2,
      forest: 0.05,
      hill: 0.05,
      // Note: ~70% will be buildings
    },

    // Elevation: Flat, minimal elevation features
    elevationFeatureWeights: {
      plains: 0.8,
      hill: 0.2,
    },

    // Settlements: Very high density, larger settlements
    settlementDensity: 2.0,
    settlementTypes: ['town', 'city'],

    // Strategic objectives: City districts + urban settlements
    objectiveTypes: ['city_district', 'town', 'city'],
    objectiveCount: { min: 5, max: 7 },

    // Balance: Limited open space, high cover from buildings
    openSpaceRatio: 0.3,
    coverRatio: 0.5,
  },
};

/**
 * Select a biome type based on map seed using weighted random distribution
 *
 * @param seed - Map generation seed
 * @returns BiomeType selected for this seed
 */
export function selectBiomeFromSeed(seed: number): BiomeType {
  // Weighted distribution - slightly favor varied terrain biomes
  const weights: Record<BiomeType, number> = {
    rainforest: 1.0,
    tundra: 1.0,
    mesa: 1.2,
    mountains: 1.5,  // Slightly favor mountains for gameplay variety
    plains: 1.5,     // and plains for open combat
    cities: 0.8,     // Less common (intense urban combat)
  };

  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

  // Convert seed to 0-1 range
  const random = ((seed % 10000) / 10000);

  // Select biome based on weighted thresholds
  let threshold = 0;
  for (const [biome, weight] of Object.entries(weights)) {
    threshold += weight / totalWeight;
    if (random < threshold) {
      return biome as BiomeType;
    }
  }

  // Fallback (should never reach here)
  return 'plains';
}
