/**
 * SoundLibrary - Manages audio file loading, caching, and retrieval
 *
 * Uses Web Audio API to load and decode audio files into AudioBuffers
 * for use by AudioManager and SpatialAudioManager
 */

export interface SoundManifestEntry {
  id: string;
  path: string;
}

export type SoundManifest = Record<string, string>; // id -> file path

export class SoundLibrary {
  private audioContext: AudioContext | null = null;
  private soundCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer>> = new Map();
  private enabled: boolean = true;

  constructor(audioContext?: AudioContext) {
    if (audioContext) {
      this.audioContext = audioContext;
    } else {
      this.initAudioContext();
    }
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
   * Load a single sound file and cache it
   * @param id - Unique identifier for the sound
   * @param url - Path to the audio file
   * @returns Promise that resolves to the loaded AudioBuffer
   */
  async loadSound(id: string, url: string): Promise<AudioBuffer | null> {
    if (!this.enabled || !this.audioContext) {
      console.warn('SoundLibrary: Audio context not available');
      return null;
    }

    // Return cached buffer if already loaded
    if (this.soundCache.has(id)) {
      return this.soundCache.get(id)!;
    }

    // Return existing loading promise if already in progress
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id)!;
    }

    // Start loading
    const loadPromise = this.loadAudioFile(url);
    this.loadingPromises.set(id, loadPromise);

    try {
      const buffer = await loadPromise;
      this.soundCache.set(id, buffer);
      this.loadingPromises.delete(id);
      return buffer;
    } catch (error) {
      console.error(`SoundLibrary: Failed to load sound "${id}" from "${url}"`, error);
      this.loadingPromises.delete(id);
      return null;
    }
  }

  /**
   * Load an audio file from URL and decode it
   * @param url - Path to the audio file
   * @returns Promise that resolves to the decoded AudioBuffer
   */
  private async loadAudioFile(url: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('Audio context not available');
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      return audioBuffer;
    } catch (error) {
      throw new Error(`Failed to load audio from "${url}": ${error}`);
    }
  }

  /**
   * Preload multiple sounds from a manifest
   * @param manifest - Object mapping sound IDs to file paths
   * @returns Promise that resolves when all sounds are loaded (or attempted)
   */
  async preloadSounds(manifest: SoundManifest): Promise<void> {
    if (!this.enabled || !this.audioContext) {
      console.warn('SoundLibrary: Audio context not available, skipping preload');
      return;
    }

    const loadPromises = Object.entries(manifest).map(([id, path]) => {
      return this.loadSound(id, path).catch((error) => {
        console.warn(`SoundLibrary: Failed to preload sound "${id}"`, error);
        return null;
      });
    });

    await Promise.all(loadPromises);
  }

  /**
   * Get a cached audio buffer by ID
   * @param id - Sound identifier
   * @returns AudioBuffer if loaded, null otherwise
   */
  getAudioBuffer(id: string): AudioBuffer | null {
    return this.soundCache.get(id) ?? null;
  }

  /**
   * Check if a sound is loaded and cached
   * @param id - Sound identifier
   * @returns true if the sound is in cache
   */
  hasSound(id: string): boolean {
    return this.soundCache.has(id);
  }

  /**
   * Check if a sound is currently being loaded
   * @param id - Sound identifier
   * @returns true if the sound is being loaded
   */
  isLoading(id: string): boolean {
    return this.loadingPromises.has(id);
  }

  /**
   * Get the number of cached sounds
   * @returns Number of sounds in cache
   */
  getCachedSoundCount(): number {
    return this.soundCache.size;
  }

  /**
   * Clear all cached sounds
   */
  clearCache(): void {
    this.soundCache.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get the audio context used by this library
   * @returns AudioContext or null if not available
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Get enabled state
   * @returns true if audio is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
