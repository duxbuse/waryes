/**
 * TransportManager - Manages unit transport/mounting system
 *
 * Features:
 * - Infantry can mount into transport vehicles (APC, IFV, trucks, helicopters)
 * - Transports hide their passengers
 * - Transports can unload passengers
 * - Passengers are protected while mounted
 */

import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import * as THREE from 'three';

export class TransportManager {
  // private readonly _game: Game; // Reserved for future use
  private readonly transports: Map<Unit, Unit[]> = new Map(); // transport -> passengers

  constructor(_game: Game) {
    // this._game = game; // Reserved for future use
  }

  /**
   * Check if a unit can transport other units
   */
  isTransport(unit: Unit): boolean {
    return unit.transportCapacity > 0;
  }

  /**
   * Get available capacity for a transport
   */
  getAvailableCapacity(transport: Unit): number {
    const passengers = this.transports.get(transport) || [];
    return transport.transportCapacity - passengers.length;
  }

  /**
   * Get passengers of a transport
   */
  getPassengers(transport: Unit): Unit[] {
    return this.transports.get(transport) || [];
  }

  /**
   * Try to mount a unit into a transport
   */
  tryMount(passenger: Unit, transport: Unit): boolean {
    // Validate
    if (passenger === transport) return false;
    if (!this.isTransport(transport)) return false;
    if (this.getAvailableCapacity(transport) <= 0) {
      console.log(`${transport.name} is full`);
      return false;
    }

    // Check if already mounted somewhere
    if (passenger.mountedIn) {
      console.log(`${passenger.name} is already mounted`);
      return false;
    }

    // Add to passengers
    let passengers = this.transports.get(transport);
    if (!passengers) {
      passengers = [];
      this.transports.set(transport, passengers);
    }
    passengers.push(passenger);

    // Set mounted state
    passenger.setMountedIn(transport);

    // Hide passenger
    passenger.mesh.visible = false;

    // Move passenger to transport position (hidden but tracked)
    passenger.position.copy(transport.position);
    passenger.mesh.position.copy(transport.position);

    console.log(`${passenger.name} mounted into ${transport.name}. Passengers: ${passengers.length}/${transport.transportCapacity}`);
    return true;
  }

  /**
   * Dismount a specific passenger from a transport
   */
  dismount(passenger: Unit, transport: Unit): THREE.Vector3 | null {
    const passengers = this.transports.get(transport);
    if (!passengers) return null;

    const index = passengers.indexOf(passenger);
    if (index === -1) return null;

    // Remove from passengers
    passengers.splice(index, 1);

    // Clear mounted state
    passenger.setMountedIn(null);

    // Show passenger
    passenger.mesh.visible = true;

    // Calculate exit position (offset from transport)
    const exitPos = this.getExitPosition(transport.position);

    console.log(`${passenger.name} dismounted from ${transport.name}`);
    return exitPos;
  }

  /**
   * Unload all passengers from a transport
   */
  unloadAll(transport: Unit): Unit[] {
    const passengers = this.transports.get(transport);
    if (!passengers || passengers.length === 0) return [];

    const unloaded: Unit[] = [];

    // Iterate backwards to avoid index issues
    for (let i = passengers.length - 1; i >= 0; i--) {
      const passenger = passengers[i];
      if (passenger) {
        const exitPos = this.dismount(passenger, transport);
        if (exitPos) {
          passenger.position.copy(exitPos);
          passenger.mesh.position.copy(exitPos);
          unloaded.push(passenger);
        }
      }
    }

    console.log(`${transport.name} unloaded ${unloaded.length} passengers`);
    return unloaded;
  }

  /**
   * Get exit position for dismounting (offset from transport)
   */
  private getExitPosition(transportPos: THREE.Vector3): THREE.Vector3 {
    // Random offset around transport
    const angle = Math.random() * Math.PI * 2;
    const distance = 3 + Math.random() * 2; // 3-5m from transport

    return new THREE.Vector3(
      transportPos.x + Math.cos(angle) * distance,
      transportPos.y,
      transportPos.z + Math.sin(angle) * distance
    );
  }

  /**
   * Check if a unit is mounted in a transport
   */
  isMounted(unit: Unit): boolean {
    return unit.mountedIn !== null;
  }

  /**
   * Get the transport a unit is mounted in
   */
  getTransport(passenger: Unit): Unit | null {
    return passenger.mountedIn;
  }

  /**
   * Handle transport destruction - unload passengers
   */
  onTransportDestroyed(transport: Unit): void {
    const passengers = this.transports.get(transport);
    if (!passengers) return;

    console.log(`${transport.name} destroyed with ${passengers.length} passengers!`);

    // Unload all passengers (they survive but need to exit)
    this.unloadAll(transport);

    // Clean up
    this.transports.delete(transport);
  }

  /**
   * Update - synchronize passenger positions with transports
   */
  update(_dt: number): void {
    // Keep passengers synchronized with transport positions (while hidden)
    for (const [transport, passengers] of this.transports) {
      for (const passenger of passengers) {
        passenger.position.copy(transport.position);
        passenger.mesh.position.copy(transport.position);
      }
    }
  }

  /**
   * Clear all transports (for map change, game end)
   */
  clear(): void {
    // Unload everyone
    for (const [transport, _passengers] of this.transports) {
      this.unloadAll(transport);
    }

    this.transports.clear();
  }
}
