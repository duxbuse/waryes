/**
 * AudioManager - Manages game audio and sound effects
 *
 * Currently uses Web Audio API for procedural sounds
 * Can be extended to load audio files in the future
 */

import * as THREE from 'three';
import type { WeaponData, AudioCategory, ImpactSound, UnitVoiceSound } from '../../data/types';
import type { SoundLibrary } from './SoundLibrary';
import type { SpatialAudioManager } from './SpatialAudioManager';
import { getSoundById } from '../../data/audioManifest';

export type SoundEffect =
  | 'weapon_fire'
  | 'explosion'
  | 'unit_select'
  | 'unit_move'
  | 'unit_death'
  | 'victory'
  | 'defeat'
  | 'button_click'
  | 'zone_capture'
  | 'income_tick'
  | 'zone_contested';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterVolume: number = 0.15; // 15% volume by default to prevent clipping
  private sfxVolume: number = 0.4;
  private enabled: boolean = true;

  // References to other audio systems
  private soundLibrary?: SoundLibrary;
  private spatialAudioManager?: SpatialAudioManager;

  // Sound throttling to prevent audio from homogenizing
  private lastPlayTimes: Map<SoundEffect, number> = new Map();
  private minTimeBetweenSounds: Map<SoundEffect, number> = new Map([
    ['weapon_fire', 0.05],    // Max 20 weapon sounds per second
    ['explosion', 0.1],       // Max 10 explosions per second
    ['unit_select', 0.05],
    ['unit_move', 0.05],
    ['unit_death', 0.1],
    ['victory', 1.0],
    ['defeat', 1.0],
    ['button_click', 0.05],
    ['zone_capture', 2.0],    // Max once per 2 seconds
    ['income_tick', 4.0],     // Max once per 4 seconds (matches income frequency)
    ['zone_contested', 2.0],  // Max once per 2 seconds
  ]);

  // Per-weapon-category throttling
  private weaponCategoryLastPlayTimes: Map<AudioCategory, number> = new Map();
  private weaponCategoryThrottleLimits: Map<AudioCategory, number> = new Map([
    ['machinegun', 0.03],   // Machine guns: 0.03s (33 sounds/sec max)
    ['rifle', 0.05],        // Rifles: 0.05s (20 sounds/sec max)
    ['cannon', 0.1],        // Cannons: 0.1s (10 sounds/sec max)
    ['artillery', 0.2],     // Artillery: 0.2s (5 sounds/sec max)
    ['missile', 0.15],      // Missiles: 0.15s (6.7 sounds/sec max)
    ['launcher', 0.15],     // Launchers: 0.15s (6.7 sounds/sec max)
  ]);

  // Per-impact-type throttling
  private impactLastPlayTimes: Map<ImpactSound, number> = new Map();
  private impactThrottleLimits: Map<ImpactSound, number> = new Map([
    ['penetration', 0.05],         // Penetrations: 0.05s (20 sounds/sec max)
    ['deflection', 0.05],          // Deflections: 0.05s (20 sounds/sec max)
    ['infantry_hit', 0.03],        // Infantry hits: 0.03s (33 sounds/sec max)
    ['vehicle_explosion', 0.15],   // Vehicle explosions: 0.15s (6.7 sounds/sec max)
    ['building_hit', 0.1],         // Building hits: 0.1s (10 sounds/sec max)
  ]);

  // Per-voice-line throttling
  private voiceLineLastPlayTimes: Map<UnitVoiceSound, number> = new Map();
  private voiceLineThrottleLimits: Map<UnitVoiceSound, number> = new Map([
    ['move_order', 2.0],      // Move orders: 2.0s (prevent spam)
    ['attack_order', 2.0],    // Attack orders: 2.0s (prevent spam)
    ['under_fire', 5.0],      // Under fire: 5.0s (critical alerts)
    ['low_morale', 5.0],      // Low morale: 5.0s (critical alerts)
    ['retreating', 5.0],      // Retreating: 5.0s (critical alerts)
  ]);

  constructor() {
    // Create audio context on first user interaction (browser policy)
    this.initAudioContext();
  }

  /**
   * Initialize audio systems (called by Game after audio managers are created)
   */
  initializeSpatialAudio(soundLibrary: SoundLibrary, spatialAudioManager: SpatialAudioManager): void {
    this.soundLibrary = soundLibrary;
    this.spatialAudioManager = spatialAudioManager;
  }

  private initAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported', e);
      this.enabled = false;
    }
  }

  /**
   * Ensure audio context is running (needed after user interaction)
   */
  private resumeContext(): void {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Play a sound effect
   */
  playSound(effect: SoundEffect): void {
    if (!this.enabled || !this.audioContext) return;

    this.resumeContext();

    const now = this.audioContext.currentTime;

    // Throttle sounds to prevent homogenization
    const lastPlayTime = this.lastPlayTimes.get(effect) ?? 0;
    const minTimeBetween = this.minTimeBetweenSounds.get(effect) ?? 0;

    if (now - lastPlayTime < minTimeBetween) {
      return; // Skip this sound, it's playing too frequently
    }

    this.lastPlayTimes.set(effect, now);

    switch (effect) {
      case 'weapon_fire':
        this.playWeaponFire(now);
        break;
      case 'explosion':
        this.playExplosion(now);
        break;
      case 'unit_select':
        this.playUnitSelect(now);
        break;
      case 'unit_move':
        this.playUnitMove(now);
        break;
      case 'unit_death':
        this.playUnitDeath(now);
        break;
      case 'victory':
        this.playVictory(now);
        break;
      case 'defeat':
        this.playDefeat(now);
        break;
      case 'button_click':
        this.playButtonClick(now);
        break;
      case 'zone_capture':
        this.playZoneCapture(now);
        break;
      case 'income_tick':
        this.playIncomeTick(now);
        break;
      case 'zone_contested':
        this.playZoneContested(now);
        break;
    }
  }

  /**
   * Play a weapon-specific sound at a 3D position
   * Maps weapon categories to specific sounds with spatial audio
   * @param weaponData - Weapon data containing audio category
   * @param position - 3D world position where the sound should play
   */
  playWeaponSound(weaponData: WeaponData, position: THREE.Vector3): void {
    if (!this.enabled || !this.spatialAudioManager || !this.soundLibrary) {
      return;
    }

    // Determine audio category from weapon data
    // If weaponData has a soundId, use that; otherwise infer from weapon properties
    let audioCategory: AudioCategory | undefined;
    let soundId: string | undefined = weaponData.soundId;

    // If no explicit soundId, try to infer audio category from weapon properties
    if (!soundId) {
      // Infer audio category from weapon characteristics
      // This is a fallback - weapons should ideally specify their soundId
      if (weaponData.rateOfFire > 300) {
        audioCategory = 'machinegun';
      } else if (weaponData.rateOfFire > 100) {
        audioCategory = 'rifle';
      } else if (weaponData.damage > 100) {
        audioCategory = 'cannon';
      } else if (weaponData.name.toLowerCase().includes('missile')) {
        audioCategory = 'missile';
      } else if (weaponData.name.toLowerCase().includes('artillery')) {
        audioCategory = 'artillery';
      } else {
        audioCategory = 'launcher';
      }

      // Map audio category to sound ID
      soundId = this.mapAudioCategoryToSoundId(audioCategory);
    }

    // Extract audio category from soundId for throttling
    // This handles both explicit soundIds and inferred ones
    if (soundId) {
      if (soundId === 'rifle_fire') audioCategory = 'rifle';
      else if (soundId === 'machinegun_fire') audioCategory = 'machinegun';
      else if (soundId === 'cannon_fire') audioCategory = 'cannon';
      else if (soundId === 'missile_launch') audioCategory = 'missile';
      else if (soundId === 'artillery_fire') audioCategory = 'artillery';
      else if (soundId === 'launcher_fire') audioCategory = 'launcher';
    }

    // Check throttling for this weapon category
    if (audioCategory && this.audioContext) {
      const now = this.audioContext.currentTime;
      const lastPlayTime = this.weaponCategoryLastPlayTimes.get(audioCategory) ?? 0;
      const throttleLimit = this.weaponCategoryThrottleLimits.get(audioCategory) ?? 0.05;

      if (now - lastPlayTime < throttleLimit) {
        return; // Skip this sound, playing too frequently
      }

      this.weaponCategoryLastPlayTimes.set(audioCategory, now);
    }

    // Get the sound configuration from the manifest
    const soundEffect = getSoundById(soundId!);
    if (!soundEffect || !soundEffect.config) {
      console.warn(`AudioManager: No sound configuration found for "${soundId}"`);
      return;
    }

    // Play the sound at the 3D position with spatial audio
    this.spatialAudioManager.playSoundAt(soundId!, position, soundEffect.config);
  }

  /**
   * Map audio category to sound ID
   * @param category - Audio category
   * @returns Sound ID string
   */
  private mapAudioCategoryToSoundId(category: AudioCategory): string {
    const mapping: Record<AudioCategory, string> = {
      rifle: 'rifle_fire',
      machinegun: 'machinegun_fire',
      cannon: 'cannon_fire',
      missile: 'missile_launch',
      artillery: 'artillery_fire',
      launcher: 'launcher_fire',
    };
    return mapping[category];
  }

  /**
   * Play an impact sound at a 3D position
   * Different sounds for penetration, deflection, infantry hits, explosions, etc.
   * @param impactType - Type of impact ('penetration', 'deflection', 'infantry_hit', 'vehicle_explosion', 'building_hit')
   * @param position - 3D world position where the sound should play
   * @param intensity - Impact intensity (0-1), affects volume
   */
  playImpactSound(impactType: ImpactSound, position: THREE.Vector3, intensity: number = 1.0): void {
    if (!this.enabled || !this.spatialAudioManager || !this.soundLibrary) {
      return;
    }

    // Check throttling for this impact type
    if (this.audioContext) {
      const now = this.audioContext.currentTime;
      const lastPlayTime = this.impactLastPlayTimes.get(impactType) ?? 0;
      const throttleLimit = this.impactThrottleLimits.get(impactType) ?? 0.05;

      if (now - lastPlayTime < throttleLimit) {
        return; // Skip this sound, playing too frequently
      }

      this.impactLastPlayTimes.set(impactType, now);
    }

    // Get the sound configuration from the manifest
    const soundEffect = getSoundById(impactType);
    if (!soundEffect || !soundEffect.config) {
      console.warn(`AudioManager: No sound configuration found for impact type "${impactType}"`);
      return;
    }

    // Clone the config and adjust volume based on intensity
    const config = {
      ...soundEffect.config,
      volume: soundEffect.config.volume * Math.max(0, Math.min(1, intensity)),
    };

    // Play the sound at the 3D position with spatial audio
    this.spatialAudioManager.playSoundAt(impactType, position, config);
  }

  /**
   * Play a unit voice line
   * Uses procedural placeholder sounds with distinct beep patterns for each voice type
   * @param voiceType - Type of voice line ('move_order', 'attack_order', 'under_fire', 'low_morale', 'retreating')
   * @param position - 3D world position where the sound should play
   */
  playVoiceLine(voiceType: UnitVoiceSound, _position: THREE.Vector3): void {
    if (!this.enabled || !this.audioContext) {
      return;
    }

    this.resumeContext();

    // Check throttling for this voice line type
    const now = this.audioContext.currentTime;
    const lastPlayTime = this.voiceLineLastPlayTimes.get(voiceType) ?? 0;
    const throttleLimit = this.voiceLineThrottleLimits.get(voiceType) ?? 2.0;

    if (now - lastPlayTime < throttleLimit) {
      return; // Skip this sound, playing too frequently
    }

    this.voiceLineLastPlayTimes.set(voiceType, now);

    // Play procedural voice line based on type
    switch (voiceType) {
      case 'move_order':
        this.playMoveOrderVoice(now);
        break;
      case 'attack_order':
        this.playAttackOrderVoice(now);
        break;
      case 'under_fire':
        this.playUnderFireVoice(now);
        break;
      case 'low_morale':
        this.playLowMoraleVoice(now);
        break;
      case 'retreating':
        this.playRetreatingVoice(now);
        break;
    }
  }

  private playWeaponFire(now: number): void {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    // Sharp noise burst
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);

    gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  private playExplosion(now: number): void {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    // Deep rumble
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);

    gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  private playUnitSelect(now: number): void {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    // Short beep
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);

    gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  private playUnitMove(now: number): void {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    // Acknowledgement beep
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);

    gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  private playUnitDeath(now: number): void {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    // Descending tone
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);

    gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  private playVictory(now: number): void {
    if (!this.audioContext) return;

    // Ascending major chord
    const frequencies = [523, 659, 784]; // C, E, G

    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.1, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.5);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.5);
    });
  }

  private playDefeat(now: number): void {
    if (!this.audioContext) return;

    // Descending minor chord
    const frequencies = [440, 349, 262]; // A, F, C

    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.1, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.6);

      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.6);
    });
  }

  private playButtonClick(now: number): void {
    if (!this.audioContext) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    // Quick click
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);

    gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Play zone capture sound: ascending major chord (C-E-G-C)
   */
  private playZoneCapture(now: number): void {
    if (!this.audioContext) return;

    // Ascending major chord: C, E, G, high C
    const frequencies = [523, 659, 784, 1046]; // C5, E5, G5, C6

    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.12, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.6);

      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.6);
    });
  }

  /**
   * Play income tick sound: bright 'ka-ching' two-tone beep
   */
  private playIncomeTick(now: number): void {
    if (!this.audioContext) return;

    // Two-tone ascending beep: 1200Hz -> 1600Hz
    const frequencies = [1200, 1600];

    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.08, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.15);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.15);
    });
  }

  /**
   * Play zone contested sound: alert tone with alternating frequencies
   */
  private playZoneContested(now: number): void {
    if (!this.audioContext) return;

    // Alternating alert tone: 900Hz <-> 1100Hz, 3 cycles (6 beeps total)
    const frequencies = [900, 1100, 900, 1100, 900, 1100];

    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.1, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.3);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    });
  }

  /**
   * Voice line: Move order acknowledgment (quick double beep)
   */
  private playMoveOrderVoice(now: number): void {
    if (!this.audioContext) return;

    // Two quick beeps: "Affirmative"
    [0, 0.1].forEach((offset) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, now + offset);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.08, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.08);

      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });
  }

  /**
   * Voice line: Attack order acknowledgment (triple ascending beep)
   */
  private playAttackOrderVoice(now: number): void {
    if (!this.audioContext) return;

    // Three ascending beeps: "Engaging!"
    const frequencies = [600, 750, 900];
    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.09, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.08);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.08);
    });
  }

  /**
   * Voice line: Under fire alert (rapid alarm beeps)
   */
  private playUnderFireVoice(now: number): void {
    if (!this.audioContext) return;

    // Rapid alternating alarm: "Taking fire!"
    const frequencies = [800, 950, 800, 950];
    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.1, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.06 + 0.05);

      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.05);
    });
  }

  /**
   * Voice line: Low morale warning (descending worried tone)
   */
  private playLowMoraleVoice(now: number): void {
    if (!this.audioContext) return;

    // Slow descending warble: "We can't take much more!"
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);

    gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Voice line: Retreating/routing (panicked rapid descending beeps)
   */
  private playRetreatingVoice(now: number): void {
    if (!this.audioContext) return;

    // Fast descending beeps: "Fall back! Fall back!"
    const frequencies = [900, 800, 700, 600, 500];
    frequencies.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext!.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);

      gain.gain.setValueAtTime(this.masterVolume * this.sfxVolume * 0.09, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.05);

      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.05);
    });
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set SFX volume (0-1)
   */
  setSFXVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Enable/disable audio
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get current enabled state
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
