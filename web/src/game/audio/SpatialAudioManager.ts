/**
 * SpatialAudioManager - Manages 3D positional audio with distance attenuation
 *
 * Uses Three.js AudioListener and PositionalAudio for spatial sound effects
 * Provides directional audio cues and distance-based volume attenuation
 */

import * as THREE from 'three';
import type { SoundLibrary } from './SoundLibrary';
import type { AudioConfig } from '../../data/types';

interface ActiveSound {
  audio: THREE.PositionalAudio | THREE.Audio;
  startTime: number;
  duration: number;
}

export class SpatialAudioManager {
  private listener: THREE.AudioListener;
  private soundLibrary: SoundLibrary;
  private camera: THREE.PerspectiveCamera;
  private activeSounds: ActiveSound[] = [];
  private masterVolume: number = 0.15;
  private enabled: boolean = true;

  // Default spatial audio settings
  private defaultSpatialSettings = {
    refDistance: 50, // Volume starts reducing at 50m
    maxDistance: 500, // Inaudible beyond 500m
    rolloffFactor: 1.0, // Linear distance model
  };

  // Frustum for off-screen detection
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projectionMatrix: THREE.Matrix4 = new THREE.Matrix4();

  // Off-screen cue throttling
  private lastOffScreenCueTime: number = 0;
  private offScreenCueCooldown: number = 2000; // 2 seconds between cues

  constructor(listener: THREE.AudioListener, soundLibrary: SoundLibrary, camera: THREE.PerspectiveCamera) {
    this.listener = listener;
    this.soundLibrary = soundLibrary;
    this.camera = camera;
  }

  /**
   * Play a sound at a specific 3D position
   * @param soundId - Sound identifier from the sound library
   * @param position - THREE.Vector3 world position
   * @param config - Optional audio configuration override
   * @returns The created PositionalAudio instance, or null if failed
   */
  playSoundAt(
    soundId: string,
    position: THREE.Vector3,
    config?: AudioConfig
  ): THREE.PositionalAudio | null {
    if (!this.enabled) return null;

    const audioBuffer = this.soundLibrary.getAudioBuffer(soundId);
    if (!audioBuffer) {
      console.warn(`SpatialAudioManager: Sound "${soundId}" not found in library`);
      return null;
    }

    try {
      // Create positional audio
      const sound = new THREE.PositionalAudio(this.listener);
      sound.setBuffer(audioBuffer);

      // Apply volume
      const volume = config?.volume ?? 1.0;
      sound.setVolume(volume * this.masterVolume);

      // Apply pitch variation if specified
      if (config?.pitchVariation) {
        const pitchVariation = config.pitchVariation;
        const randomPitch = 1.0 + (Math.random() * 2 - 1) * pitchVariation;
        sound.setPlaybackRate(randomPitch);
      }

      // Apply spatial settings
      const spatialSettings = config?.spatialSettings ?? this.defaultSpatialSettings;
      sound.setRefDistance(spatialSettings.refDistance);
      sound.setMaxDistance(spatialSettings.maxDistance);
      sound.setRolloffFactor(spatialSettings.rolloffFactor);
      sound.setDistanceModel('linear');

      // Apply cone settings if specified (directional sounds)
      if (spatialSettings.coneInnerAngle !== undefined) {
        sound.setDirectionalCone(
          spatialSettings.coneInnerAngle,
          spatialSettings.coneOuterAngle ?? 360,
          spatialSettings.coneOuterGain ?? 0
        );
      }

      // Position the sound
      sound.position.copy(position);

      // Play the sound
      sound.play();

      // Track active sound for cleanup
      this.activeSounds.push({
        audio: sound,
        startTime: performance.now(),
        duration: audioBuffer.duration * 1000, // Convert to milliseconds
      });

      return sound;
    } catch (error) {
      console.error(`SpatialAudioManager: Failed to play sound "${soundId}"`, error);
      return null;
    }
  }

  /**
   * Check if a world position is outside the camera's view frustum
   * @param position - World position to check
   * @returns true if position is off-screen
   */
  private isPositionOffScreen(position: THREE.Vector3): boolean {
    // Update frustum from camera's current state
    this.projectionMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projectionMatrix);

    // Check if position is inside frustum
    return !this.frustum.containsPoint(position);
  }

  /**
   * Calculate normalized screen-space direction from camera to position
   * Used for panning off-screen audio cues
   * @param position - World position
   * @returns Object with x (-1 to 1, left to right) and y (-1 to 1, bottom to top)
   */
  private getScreenDirection(position: THREE.Vector3): { x: number; y: number } {
    // Clone position and project to screen space
    const screenPos = position.clone().project(this.camera);

    // screenPos is now in normalized device coordinates (-1 to 1)
    // Clamp to ensure we have a valid direction even if very far off screen
    const x = Math.max(-1, Math.min(1, screenPos.x));
    const y = Math.max(-1, Math.min(1, screenPos.y));

    return { x, y };
  }

  /**
   * Play a directional audio cue for off-screen combat
   * Uses 2D panned audio to indicate the direction of combat
   * @param position - World position of the combat event
   * @param intensity - Intensity of the combat (0-1), affects volume
   * @returns true if cue was played, false if on cooldown or disabled
   */
  playOffScreenCue(position: THREE.Vector3, intensity: number = 0.5): boolean {
    if (!this.enabled) return false;

    // Check cooldown to prevent audio spam
    const now = performance.now();
    if (now - this.lastOffScreenCueTime < this.offScreenCueCooldown) {
      return false;
    }

    // Only play cue if position is actually off-screen
    if (!this.isPositionOffScreen(position)) {
      return false;
    }

    // Get the off-screen combat sound
    const audioBuffer = this.soundLibrary.getAudioBuffer('off_screen_combat');
    if (!audioBuffer) {
      console.warn('SpatialAudioManager: off_screen_combat sound not found');
      return false;
    }

    try {
      // Create 2D audio (not positional)
      const sound = new THREE.Audio(this.listener);
      sound.setBuffer(audioBuffer);

      // Set volume based on intensity
      const volume = Math.max(0, Math.min(1, intensity)) * this.masterVolume * 0.4;
      sound.setVolume(volume);

      // Get screen direction for panning
      const direction = this.getScreenDirection(position);

      // Create and configure panner for directional audio
      const context = this.listener.context;
      const panner = context.createStereoPanner();
      panner.pan.value = direction.x; // -1 (left) to 1 (right)

      // Connect audio graph: source -> panner -> destination
      const source = (sound as any).source;
      if (source) {
        source.disconnect();
        source.connect(panner);
        panner.connect(context.destination);
      }

      // Play the sound
      sound.play();

      // Track active sound for cleanup
      this.activeSounds.push({
        audio: sound,
        startTime: now,
        duration: audioBuffer.duration * 1000,
      });

      // Update cooldown
      this.lastOffScreenCueTime = now;

      return true;
    } catch (error) {
      console.error('SpatialAudioManager: Failed to play off-screen cue', error);
      return false;
    }
  }

  /**
   * Update method - cleans up finished sounds
   * Should be called every frame
   */
  update(): void {
    if (this.activeSounds.length === 0) return;

    const now = performance.now();
    const soundsToRemove: number[] = [];

    // Find sounds that have finished playing
    for (let i = 0; i < this.activeSounds.length; i++) {
      const activeSound = this.activeSounds[i];
      const elapsed = now - activeSound.startTime;

      // Check if sound has finished or is no longer playing
      if (elapsed >= activeSound.duration || !activeSound.audio.isPlaying) {
        // Stop and disconnect the audio
        if (activeSound.audio.isPlaying) {
          activeSound.audio.stop();
        }
        activeSound.audio.disconnect();

        soundsToRemove.push(i);
      }
    }

    // Remove finished sounds (iterate in reverse to avoid index issues)
    for (let i = soundsToRemove.length - 1; i >= 0; i--) {
      this.activeSounds.splice(soundsToRemove[i], 1);
    }
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));

    // Update volume of currently playing sounds
    for (const activeSound of this.activeSounds) {
      const currentVolume = activeSound.audio.getVolume();
      activeSound.audio.setVolume(currentVolume * this.masterVolume);
    }
  }

  /**
   * Enable or disable spatial audio
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      // Stop all active sounds
      this.stopAllSounds();
    }
  }

  /**
   * Check if spatial audio is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Stop all currently playing sounds
   */
  stopAllSounds(): void {
    for (const activeSound of this.activeSounds) {
      if (activeSound.audio.isPlaying) {
        activeSound.audio.stop();
      }
      activeSound.audio.disconnect();
    }
    this.activeSounds = [];
  }

  /**
   * Get the number of currently active sounds
   */
  getActiveSoundCount(): number {
    return this.activeSounds.length;
  }

  /**
   * Get the audio listener
   */
  getListener(): THREE.AudioListener {
    return this.listener;
  }
}
