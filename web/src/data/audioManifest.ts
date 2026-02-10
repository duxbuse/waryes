/**
 * Audio Manifest for Stellar Siege
 * Maps sound IDs to file paths and audio configurations
 * Organized by category: weapons, impacts, voices, ambient
 */

import type {
  SoundEffect,
  AudioConfig,
  WeaponFireSound,
  ImpactSound,
  UnitVoiceSound,
  AmbientSound,
} from './types';

// Default audio configurations for different sound categories
const DEFAULT_WEAPON_CONFIG: AudioConfig = {
  volume: 0.6,
  pitchVariation: 0.1,
  spatialSettings: {
    refDistance: 50,
    maxDistance: 300,
    rolloffFactor: 1.5,
  },
};

const DEFAULT_IMPACT_CONFIG: AudioConfig = {
  volume: 0.5,
  pitchVariation: 0.15,
  spatialSettings: {
    refDistance: 30,
    maxDistance: 200,
    rolloffFactor: 2.0,
  },
};

const DEFAULT_VOICE_CONFIG: AudioConfig = {
  volume: 0.7,
  pitchVariation: 0.05,
  spatialSettings: {
    refDistance: 40,
    maxDistance: 150,
    rolloffFactor: 1.8,
  },
};

const DEFAULT_AMBIENT_CONFIG: AudioConfig = {
  volume: 0.3,
  pitchVariation: 0,
  spatialSettings: {
    refDistance: 100,
    maxDistance: 500,
    rolloffFactor: 1.0,
  },
};

// Weapon fire sounds
const WEAPON_FIRE_SOUNDS: SoundEffect[] = [
  {
    id: 'rifle_fire',
    category: 'weapon_fire',
    filePath: '/assets/sounds/weapons/rifle_fire.ogg',
    config: DEFAULT_WEAPON_CONFIG,
  },
  {
    id: 'machinegun_fire',
    category: 'weapon_fire',
    filePath: '/assets/sounds/weapons/machinegun_fire.ogg',
    config: DEFAULT_WEAPON_CONFIG,
  },
  {
    id: 'cannon_fire',
    category: 'weapon_fire',
    filePath: '/assets/sounds/weapons/cannon_fire.ogg',
    config: {
      ...DEFAULT_WEAPON_CONFIG,
      volume: 0.8,
      spatialSettings: {
        refDistance: 60,
        maxDistance: 400,
        rolloffFactor: 1.2,
      },
    },
  },
  {
    id: 'missile_launch',
    category: 'weapon_fire',
    filePath: '/assets/sounds/weapons/missile_launch.ogg',
    config: {
      ...DEFAULT_WEAPON_CONFIG,
      volume: 0.7,
      spatialSettings: {
        refDistance: 70,
        maxDistance: 350,
        rolloffFactor: 1.3,
      },
    },
  },
  {
    id: 'artillery_fire',
    category: 'weapon_fire',
    filePath: '/assets/sounds/weapons/artillery_fire.ogg',
    config: {
      ...DEFAULT_WEAPON_CONFIG,
      volume: 0.9,
      spatialSettings: {
        refDistance: 80,
        maxDistance: 500,
        rolloffFactor: 1.0,
      },
    },
  },
  {
    id: 'launcher_fire',
    category: 'weapon_fire',
    filePath: '/assets/sounds/weapons/launcher_fire.ogg',
    config: DEFAULT_WEAPON_CONFIG,
  },
];

// Impact sounds
const IMPACT_SOUNDS: SoundEffect[] = [
  {
    id: 'penetration',
    category: 'impact',
    filePath: '/assets/sounds/impacts/penetration.ogg',
    config: DEFAULT_IMPACT_CONFIG,
  },
  {
    id: 'deflection',
    category: 'impact',
    filePath: '/assets/sounds/impacts/deflection.ogg',
    config: DEFAULT_IMPACT_CONFIG,
  },
  {
    id: 'infantry_hit',
    category: 'impact',
    filePath: '/assets/sounds/impacts/infantry_hit.ogg',
    config: {
      ...DEFAULT_IMPACT_CONFIG,
      volume: 0.4,
    },
  },
  {
    id: 'vehicle_explosion',
    category: 'impact',
    filePath: '/assets/sounds/impacts/vehicle_explosion.ogg',
    config: {
      ...DEFAULT_IMPACT_CONFIG,
      volume: 0.8,
      spatialSettings: {
        refDistance: 50,
        maxDistance: 300,
        rolloffFactor: 1.5,
      },
    },
  },
  {
    id: 'building_hit',
    category: 'impact',
    filePath: '/assets/sounds/impacts/building_hit.ogg',
    config: DEFAULT_IMPACT_CONFIG,
  },
];

// Unit voice sounds
const UNIT_VOICE_SOUNDS: SoundEffect[] = [
  {
    id: 'move_order',
    category: 'unit_voice',
    filePath: '/assets/sounds/voices/move_order.ogg',
    config: DEFAULT_VOICE_CONFIG,
  },
  {
    id: 'attack_order',
    category: 'unit_voice',
    filePath: '/assets/sounds/voices/attack_order.ogg',
    config: DEFAULT_VOICE_CONFIG,
  },
  {
    id: 'under_fire',
    category: 'unit_voice',
    filePath: '/assets/sounds/voices/under_fire.ogg',
    config: DEFAULT_VOICE_CONFIG,
  },
  {
    id: 'low_morale',
    category: 'unit_voice',
    filePath: '/assets/sounds/voices/low_morale.ogg',
    config: DEFAULT_VOICE_CONFIG,
  },
  {
    id: 'retreating',
    category: 'unit_voice',
    filePath: '/assets/sounds/voices/retreating.ogg',
    config: DEFAULT_VOICE_CONFIG,
  },
];

// Ambient sounds
const AMBIENT_SOUNDS: SoundEffect[] = [
  {
    id: 'battle_ambient',
    category: 'ambient',
    filePath: '/assets/sounds/ambient/battle_ambient.ogg',
    config: DEFAULT_AMBIENT_CONFIG,
  },
  {
    id: 'off_screen_combat',
    category: 'ambient',
    filePath: '/assets/sounds/ambient/off_screen_combat.ogg',
    config: DEFAULT_AMBIENT_CONFIG,
  },
  {
    id: 'environmental',
    category: 'ambient',
    filePath: '/assets/sounds/ambient/environmental.ogg',
    config: DEFAULT_AMBIENT_CONFIG,
  },
];

// Combined manifest of all sound effects
export const AUDIO_MANIFEST: SoundEffect[] = [
  ...WEAPON_FIRE_SOUNDS,
  ...IMPACT_SOUNDS,
  ...UNIT_VOICE_SOUNDS,
  ...AMBIENT_SOUNDS,
];

// Helper functions for accessing sounds

/**
 * Get a sound effect by its ID
 */
export function getSoundById(id: string): SoundEffect | undefined {
  return AUDIO_MANIFEST.find((sound) => sound.id === id);
}

/**
 * Get all sounds in a specific category
 */
export function getSoundsByCategory(category: string): SoundEffect[] {
  return AUDIO_MANIFEST.filter((sound) => sound.category === category);
}

/**
 * Get all weapon fire sounds
 */
export function getWeaponFireSounds(): SoundEffect[] {
  return WEAPON_FIRE_SOUNDS;
}

/**
 * Get a specific weapon fire sound by type
 */
export function getWeaponFireSound(type: WeaponFireSound): SoundEffect | undefined {
  return WEAPON_FIRE_SOUNDS.find((sound) => sound.id === type);
}

/**
 * Get all impact sounds
 */
export function getImpactSounds(): SoundEffect[] {
  return IMPACT_SOUNDS;
}

/**
 * Get a specific impact sound by type
 */
export function getImpactSound(type: ImpactSound): SoundEffect | undefined {
  return IMPACT_SOUNDS.find((sound) => sound.id === type);
}

/**
 * Get all unit voice sounds
 */
export function getUnitVoiceSounds(): SoundEffect[] {
  return UNIT_VOICE_SOUNDS;
}

/**
 * Get a specific unit voice sound by type
 */
export function getUnitVoiceSound(type: UnitVoiceSound): SoundEffect | undefined {
  return UNIT_VOICE_SOUNDS.find((sound) => sound.id === type);
}

/**
 * Get all ambient sounds
 */
export function getAmbientSounds(): SoundEffect[] {
  return AMBIENT_SOUNDS;
}

/**
 * Get a specific ambient sound by type
 */
export function getAmbientSound(type: AmbientSound): SoundEffect | undefined {
  return AMBIENT_SOUNDS.find((sound) => sound.id === type);
}

/**
 * Get all file paths for preloading
 */
export function getAllSoundPaths(): string[] {
  return AUDIO_MANIFEST.map((sound) => sound.filePath).filter(
    (path): path is string => path !== undefined
  );
}
