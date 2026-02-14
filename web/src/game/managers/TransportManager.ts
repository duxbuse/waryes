/**
 * TransportManager - Client adapter wrapping SimTransportManager
 *
 * Handles mesh visibility, position syncing, and console logging.
 * All transport logic (passenger tracking, mount/dismount) lives in SimTransportManager.
 */

import type { Game } from '../../core/Game';
import type { Unit } from '../units/Unit';
import * as THREE from 'three';
import { SimTransportManager } from '@shared/simulation/SimTransportManager';

export class TransportManager {
  private readonly game: Game;
  public readonly sim: SimTransportManager;

  constructor(game: Game) {
    this.game = game;
    this.sim = new SimTransportManager();
  }

  /** Check if a unit can transport other units */
  isTransport(unit: Unit): boolean {
    return this.sim.isTransport(unit.sim);
  }

  /** Get available capacity for a transport */
  getAvailableCapacity(transport: Unit): number {
    return this.sim.getAvailableCapacity(transport.sim);
  }

  /** Get passengers of a transport */
  getPassengers(transport: Unit): Unit[] {
    // Map SimUnits back to Units via the game's unit manager
    const simPassengers = this.sim.getPassengers(transport.sim);
    const result: Unit[] = [];
    for (const simUnit of simPassengers) {
      const unit = this.game.unitManager.findUnitBySim(simUnit);
      if (unit) result.push(unit);
    }
    return result;
  }

  /** Try to mount a unit into a transport */
  tryMount(passenger: Unit, transport: Unit): boolean {
    const success = this.sim.tryMount(passenger.sim, transport.sim);
    if (!success) {
      if (this.sim.getAvailableCapacity(transport.sim) <= 0) {
        console.log(`${transport.name} is full`);
      } else if (passenger.mountedIn) {
        console.log(`${passenger.name} is already mounted`);
      }
      return false;
    }

    // Hide passenger mesh
    passenger.mesh.visible = false;

    // Sync mesh position to transport
    passenger.mesh.position.copy(transport.position);

    const passengers = this.sim.getPassengers(transport.sim);
    console.log(`${passenger.name} mounted into ${transport.name}. Passengers: ${passengers.length}/${transport.sim.transportCapacity}`);
    return true;
  }

  /** Dismount a specific passenger from a transport */
  dismount(passenger: Unit, transport: Unit): THREE.Vector3 | null {
    const exitPos = this.sim.dismount(passenger.sim, transport.sim);
    if (!exitPos) return null;

    // Show passenger mesh
    passenger.mesh.visible = true;

    console.log(`${passenger.name} dismounted from ${transport.name}`);
    return exitPos;
  }

  /** Unload all passengers from a transport */
  unloadAll(transport: Unit): Unit[] {
    const passengers = this.getPassengers(transport);
    if (passengers.length === 0) return [];

    const unloaded: Unit[] = [];

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

  /** Check if a unit is mounted in a transport */
  isMounted(unit: Unit): boolean {
    return this.sim.isMounted(unit.sim);
  }

  /** Get the transport a unit is mounted in */
  getTransport(passenger: Unit): Unit | null {
    const simTransport = this.sim.getTransport(passenger.sim);
    if (!simTransport) return null;
    return this.game.unitManager.findUnitBySim(simTransport) ?? null;
  }

  /** Handle transport destruction - unload passengers */
  onTransportDestroyed(transport: Unit): void {
    const passengers = this.getPassengers(transport);
    if (passengers.length === 0) return;

    console.log(`${transport.name} destroyed with ${passengers.length} passengers!`);

    // Unload all (sim does the logic, we sync meshes)
    for (const passenger of passengers) {
      const exitPos = this.dismount(passenger, transport);
      if (exitPos) {
        passenger.position.copy(exitPos);
        passenger.mesh.position.copy(exitPos);
      }
    }

    // Clean up sim state
    this.sim.onTransportDestroyed(transport.sim);
  }

  /** Update - synchronize passenger positions with transports */
  update(dt: number): void {
    this.sim.update(dt);

    // Sync mesh positions for mounted passengers
    for (const evt of this.sim.getPendingEvents()) {
      if (evt.type === 'mounted' && evt.passenger) {
        const unit = this.game.unitManager.findUnitBySim(evt.passenger);
        const transport = this.game.unitManager.findUnitBySim(evt.transport);
        if (unit && transport) {
          unit.mesh.position.copy(transport.position);
        }
      }
    }
  }

  /** Clear all transports */
  clear(): void {
    this.sim.clear();
  }
}
