/**
 * SimTransportManager - Pure simulation logic for unit transport/mounting.
 *
 * Tracks passenger state, validates mount/dismount, calculates exit positions.
 * No rendering, mesh, or DOM dependencies.
 */

import * as THREE from 'three';
import type { SimUnit } from './SimUnit';

/** Events emitted for the rendering layer */
export interface TransportEvent {
  type: 'mounted' | 'dismounted' | 'unloaded_all' | 'transport_destroyed';
  passenger?: SimUnit;
  transport: SimUnit;
  exitPosition?: THREE.Vector3;
}

export class SimTransportManager {
  private readonly transports: Map<SimUnit, SimUnit[]> = new Map();
  private readonly pendingEvents: TransportEvent[] = [];

  /** Provide RNG function for deterministic exit positions */
  private rng: () => number = Math.random;

  setRNG(rng: () => number): void {
    this.rng = rng;
  }

  /** Check if a unit can transport other units */
  isTransport(unit: SimUnit): boolean {
    return unit.transportCapacity > 0;
  }

  /** Get available capacity for a transport */
  getAvailableCapacity(transport: SimUnit): number {
    const passengers = this.transports.get(transport) || [];
    return transport.transportCapacity - passengers.length;
  }

  /** Get passengers of a transport */
  getPassengers(transport: SimUnit): SimUnit[] {
    return this.transports.get(transport) || [];
  }

  /** Try to mount a unit into a transport. Returns true on success. */
  tryMount(passenger: SimUnit, transport: SimUnit): boolean {
    if (passenger === transport) return false;
    if (!this.isTransport(transport)) return false;
    if (this.getAvailableCapacity(transport) <= 0) return false;
    if (passenger.mountedIn) return false;

    let passengers = this.transports.get(transport);
    if (!passengers) {
      passengers = [];
      this.transports.set(transport, passengers);
    }
    passengers.push(passenger);

    // Set mounted state on SimUnit
    passenger.setMountedIn(transport);

    // Move passenger sim position to transport position
    passenger.simPosition.copy(transport.simPosition);

    this.pendingEvents.push({ type: 'mounted', passenger, transport });
    return true;
  }

  /** Dismount a specific passenger. Returns exit position or null. */
  dismount(passenger: SimUnit, transport: SimUnit): THREE.Vector3 | null {
    const passengers = this.transports.get(transport);
    if (!passengers) return null;

    const index = passengers.indexOf(passenger);
    if (index === -1) return null;

    passengers.splice(index, 1);
    passenger.setMountedIn(null);

    const exitPos = this.getExitPosition(transport.simPosition);

    this.pendingEvents.push({ type: 'dismounted', passenger, transport, exitPosition: exitPos });
    return exitPos;
  }

  /** Unload all passengers from a transport. Returns list of unloaded units. */
  unloadAll(transport: SimUnit): SimUnit[] {
    const passengers = this.transports.get(transport);
    if (!passengers || passengers.length === 0) return [];

    const unloaded: SimUnit[] = [];

    for (let i = passengers.length - 1; i >= 0; i--) {
      const passenger = passengers[i];
      if (passenger) {
        const exitPos = this.dismount(passenger, transport);
        if (exitPos) {
          passenger.simPosition.copy(exitPos);
          unloaded.push(passenger);
        }
      }
    }

    this.pendingEvents.push({ type: 'unloaded_all', transport });
    return unloaded;
  }

  /** Handle transport destruction - unload all passengers */
  onTransportDestroyed(transport: SimUnit): void {
    const passengers = this.transports.get(transport);
    if (!passengers) return;

    this.unloadAll(transport);
    this.transports.delete(transport);

    this.pendingEvents.push({ type: 'transport_destroyed', transport });
  }

  /** Update - synchronize passenger positions with transports */
  update(_dt: number): void {
    this.pendingEvents.length = 0;

    for (const [transport, passengers] of this.transports) {
      for (const passenger of passengers) {
        passenger.simPosition.copy(transport.simPosition);
      }
    }
  }

  /** Check if a unit is mounted */
  isMounted(unit: SimUnit): boolean {
    return unit.mountedIn !== null;
  }

  /** Get the transport a unit is mounted in */
  getTransport(passenger: SimUnit): SimUnit | null {
    return passenger.mountedIn;
  }

  /** Calculate exit position (deterministic with injected RNG) */
  private getExitPosition(transportPos: THREE.Vector3): THREE.Vector3 {
    const angle = this.rng() * Math.PI * 2;
    const distance = 3 + this.rng() * 2; // 3-5m from transport

    return new THREE.Vector3(
      transportPos.x + Math.cos(angle) * distance,
      transportPos.y,
      transportPos.z + Math.sin(angle) * distance,
    );
  }

  /** Get pending events this frame */
  getPendingEvents(): readonly TransportEvent[] {
    return this.pendingEvents;
  }

  /** Clear all transport state */
  clear(): void {
    for (const [transport] of this.transports) {
      this.unloadAll(transport);
    }
    this.transports.clear();
  }
}
