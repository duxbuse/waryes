/**
 * AudioManager - Manages game audio and sound effects
 *
 * Currently uses Web Audio API for procedural sounds
 * Can be extended to load audio files in the future
 */

import * as THREE from 'three';
import type { WeaponData, AudioCategory } from '../../data/types';
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
  | 'button_click';

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
