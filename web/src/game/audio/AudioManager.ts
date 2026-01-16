/**
 * AudioManager - Manages game audio and sound effects
 *
 * Currently uses Web Audio API for procedural sounds
 * Can be extended to load audio files in the future
 */

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

  constructor() {
    // Create audio context on first user interaction (browser policy)
    this.initAudioContext();
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
