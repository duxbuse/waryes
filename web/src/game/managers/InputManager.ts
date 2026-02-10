/**
 * InputManager - Handles all game input (mouse, keyboard)
 *
 * Responsibilities:
 * - Unit selection (click, box select)
 * - Movement commands (right click)
 * - Keyboard shortcuts
 * - Drag operations
 */

import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { GamePhase } from '../../core/Game';

export interface InputState {
  mouseX: number;
  mouseY: number;
  isLeftMouseDown: boolean;
  isRightMouseDown: boolean;
  isDragging: boolean;
  isRightDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  rightDragStartX: number;
  rightDragStartY: number;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
  };
  // Movement mode modifiers (Key + Right Click)
  movementModifiers: {
    reverse: boolean;    // R key - reverse/back up
    fast: boolean;       // F key - fast move
    attackMove: boolean; // A key - attack move
    unload: boolean;     // E key - unload at position
  };
  // LOS preview mode (hold C to show line of sight from mouse position)
  losPreviewActive: boolean;
}

export class InputManager {
  private readonly game: Game;
  private readonly state: InputState;

  // Selection box element
  private selectionBox: HTMLDivElement | null = null;
  private readonly DRAG_THRESHOLD = 5; // pixels before considered a drag

  // Formation preview ghosts
  private formationGhosts: THREE.Mesh[] = [];

  // Formation path tracking for curved lines
  private formationPath: THREE.Vector3[] = [];

  // Double-press tracking for control groups
  private lastControlGroupKey: number = 0;
  private lastControlGroupTime: number = 0;
  private readonly DOUBLE_PRESS_THRESHOLD = 300; // ms

  constructor(game: Game) {
    this.game = game;
    this.state = {
      mouseX: 0,
      mouseY: 0,
      isLeftMouseDown: false,
      isRightMouseDown: false,
      isDragging: false,
      isRightDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      rightDragStartX: 0,
      rightDragStartY: 0,
      modifiers: {
        shift: false,
        ctrl: false,
        alt: false,
      },
      movementModifiers: {
        reverse: false,
        fast: false,
        attackMove: false,
        unload: false,
      },
      losPreviewActive: false,
    };
  }

  initialize(): void {
    const canvas = this.game.renderer.domElement;

    // Mouse events
    canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard events
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));

    // Create selection box element
    this.createSelectionBox();

    // Start battle button
    const startButton = document.getElementById('start-battle-btn');
    if (startButton) {
      startButton.addEventListener('click', () => this.game.startBattle());
    }
  }

  private createSelectionBox(): void {
    this.selectionBox = document.createElement('div');
    this.selectionBox.style.cssText = `
      position: absolute;
      border: 1px solid #4a9eff;
      background: rgba(74, 158, 255, 0.1);
      pointer-events: none;
      display: none;
      z-index: 100;
    `;
    document.getElementById('ui-overlay')?.appendChild(this.selectionBox);
  }

  private onMouseDown(event: MouseEvent): void {
    this.state.mouseX = event.clientX;
    this.state.mouseY = event.clientY;

    if (event.button === 0) {
      // Left click
      this.state.isLeftMouseDown = true;
      this.state.dragStartX = event.clientX;
      this.state.dragStartY = event.clientY;
    } else if (event.button === 2) {
      // Right click
      this.state.isRightMouseDown = true;
      this.state.rightDragStartX = event.clientX;
      this.state.rightDragStartY = event.clientY;
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) {
      // Left mouse release

      // Check if waiting for reinforcement destination (takes priority)
      if (this.game.deploymentManager.isWaitingForReinforcementDestination()) {
        const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
        if (worldPos) {
          this.game.deploymentManager.handleReinforcementDestinationClick(worldPos);
        }
      } else if (this.state.isDragging) {
        // Finish box selection
        this.finishBoxSelection();
      } else {
        // Click selection
        this.handleClickSelection(event);
      }

      this.state.isLeftMouseDown = false;
      this.state.isDragging = false;
      this.hideSelectionBox();
    } else if (event.button === 2) {
      // Right click - check if it was a drag (formation) or click (command)

      // Check if waiting for reinforcement destination - right-click cancels
      if (this.game.deploymentManager.isWaitingForReinforcementDestination()) {
        this.game.deploymentManager.cancelReinforcementWait();
        this.state.isRightMouseDown = false;
        this.state.isRightDragging = false;
        return;
      }

      if (this.state.isRightDragging) {
        this.handleFormationDrag(event);
        this.clearFormationPreview(); // Clear ghosts after formation is set
      } else {
        this.handleRightClick(event);
      }
      this.state.isRightMouseDown = false;
      this.state.isRightDragging = false;
    }
  }

  private onMouseMove(event: MouseEvent): void {
    this.state.mouseX = event.clientX;
    this.state.mouseY = event.clientY;

    // Update reinforcement path preview if waiting for destination
    if (this.game.deploymentManager.isWaitingForReinforcementDestination()) {
      const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
      if (worldPos) {
        this.game.deploymentManager.updateReinforcementPreviewPath(worldPos);
      }
    } else if (this.game.reinforcementManager.isWaitingForDestination()) {
      const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
      if (worldPos) {
        this.game.reinforcementManager.updatePreviewPath(worldPos);
      }
    }

    // Check for left drag start
    if (this.state.isLeftMouseDown && !this.state.isDragging) {
      const dx = event.clientX - this.state.dragStartX;
      const dy = event.clientY - this.state.dragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.DRAG_THRESHOLD) {
        this.state.isDragging = true;
      }
    }

    // Check for right drag start (formation drawing)
    if (this.state.isRightMouseDown && !this.state.isRightDragging) {
      const dx = event.clientX - this.state.rightDragStartX;
      const dy = event.clientY - this.state.rightDragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.DRAG_THRESHOLD) {
        this.state.isRightDragging = true;
        // Initialize path with starting point
        const startWorld = this.game.screenToWorld(this.state.rightDragStartX, this.state.rightDragStartY);
        if (startWorld) {
          this.formationPath = [startWorld.clone()];
        }
      }
    }

    // Update selection box
    if (this.state.isDragging) {
      this.updateSelectionBox();
    }

    // Show formation preview ghosts while right dragging
    if (this.state.isRightDragging) {
      // Add point to path if far enough from last point
      this.addPointToFormationPath(event.clientX, event.clientY);
      this.updateFormationPreview(event.clientX, event.clientY);
    }
  }

  /**
   * Add a point to the formation path if it's far enough from the last point
   */
  private addPointToFormationPath(screenX: number, screenY: number): void {
    const worldPos = this.game.screenToWorld(screenX, screenY);
    if (!worldPos) return;

    if (this.formationPath.length === 0) {
      this.formationPath.push(worldPos.clone());
      return;
    }

    const lastPoint = this.formationPath[this.formationPath.length - 1]!;
    const distance = lastPoint.distanceTo(worldPos);

    // Only add point if it's far enough from the last one (in world units)
    if (distance >= 3) { // 3 world units minimum
      this.formationPath.push(worldPos.clone());
    }
  }

  private onDoubleClick(event: MouseEvent): void {
    // Double click to select all units of same type
    const hits = this.game.getUnitsAtScreen(event.clientX, event.clientY);
    if (hits.length > 0) {
      const clickedUnit = this.findUnitFromMesh(hits[0]!);
      if (clickedUnit) {
        this.game.selectionManager.selectAllOfType(clickedUnit.unitType);
      }
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Update modifiers
    this.state.modifiers.shift = event.shiftKey;
    this.state.modifiers.ctrl = event.ctrlKey;
    this.state.modifiers.alt = event.altKey;

    // Handle specific keys
    switch (event.code) {
      case 'Escape':
        // Cancel reinforcement destination wait first (new workflow)
        if (this.game.deploymentManager.isWaitingForReinforcementDestination()) {
          this.game.deploymentManager.cancelReinforcementWait();
          break;
        }
        // Cancel reinforcement destination wait first (old workflow)
        if (this.game.reinforcementManager.isWaitingForDestination()) {
          this.game.reinforcementManager.cancelDestinationWait();
          break;
        }
        // During battle phases, ESC toggles pause menu
        if (this.game.phase === GamePhase.Setup || this.game.phase === GamePhase.Battle) {
          this.game.togglePause();
        } else {
          this.game.selectionManager.clearSelection();
        }
        break;

      case 'Enter':
        if (this.game.phase === GamePhase.Setup) {
          this.game.startBattle();
        }
        break;

      case 'Tab':
        event.preventDefault();
        this.game.selectionManager.cycleSelectionType();
        break;

      case 'KeyA':
        // Select all player units (Ctrl+A) or attack-move modifier
        if (event.ctrlKey) {
          event.preventDefault();
          this.game.selectionManager.selectAllPlayerUnits();
        } else {
          this.state.movementModifiers.attackMove = true;
        }
        break;

      case 'KeyR':
        // Reverse movement modifier
        this.state.movementModifiers.reverse = true;
        break;

      case 'KeyF':
        // Fast move modifier
        this.state.movementModifiers.fast = true;
        break;

      case 'KeyE':
        // Unload at position modifier
        this.state.movementModifiers.unload = true;
        break;

      case 'KeyZ':
        // Toggle return-fire-only mode for selected units
        this.toggleReturnFireOnly();
        break;

      case 'KeyC':
        // LOS preview mode - hold C to preview line of sight from mouse position
        this.state.losPreviewActive = true;
        break;

      case 'Delete':
      case 'KeyL':
        // Sell/delete selected units (setup phase only)
        if (this.game.phase === GamePhase.Setup) {
          this.game.unitManager.sellSelected();
        }
        break;

      // Control groups 1-9
      case 'Digit1': case 'Digit2': case 'Digit3':
      case 'Digit4': case 'Digit5': case 'Digit6':
      case 'Digit7': case 'Digit8': case 'Digit9':
        {
          const groupNumber = parseInt(event.code.replace('Digit', ''));
          if (event.ctrlKey) {
            // Ctrl+Number: Assign control group
            event.preventDefault();
            this.game.selectionManager.assignControlGroup(groupNumber);
          } else {
            // Number: Recall control group
            event.preventDefault();

            const now = Date.now();
            const isDoublePress =
              this.lastControlGroupKey === groupNumber &&
              (now - this.lastControlGroupTime) < this.DOUBLE_PRESS_THRESHOLD;

            // Recall the group
            this.game.selectionManager.recallControlGroup(groupNumber);

            // If double-press, focus camera on the group
            if (isDoublePress) {
              this.focusCameraOnSelection();
            }

            // Track for double-press detection
            this.lastControlGroupKey = groupNumber;
            this.lastControlGroupTime = now;
          }
        }
        break;
    }
  }

  /**
   * Focus camera on currently selected units
   */
  private focusCameraOnSelection(): void {
    const selectedUnits = this.game.selectionManager.getSelectedUnits();
    if (selectedUnits.length === 0) return;

    // Calculate center of all selected units
    const center = new THREE.Vector3();
    for (const unit of selectedUnits) {
      center.add(unit.position);
    }
    center.divideScalar(selectedUnits.length);

    // Move camera to center on units
    this.game.cameraController.focusOnPosition(center);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.state.modifiers.shift = event.shiftKey;
    this.state.modifiers.ctrl = event.ctrlKey;
    this.state.modifiers.alt = event.altKey;

    // Reset movement modifiers on key release
    switch (event.code) {
      case 'KeyA':
        this.state.movementModifiers.attackMove = false;
        break;
      case 'KeyR':
        this.state.movementModifiers.reverse = false;
        break;
      case 'KeyF':
        this.state.movementModifiers.fast = false;
        break;
      case 'KeyE':
        this.state.movementModifiers.unload = false;
        break;
      case 'KeyC':
        this.state.losPreviewActive = false;
        break;
    }
  }

  private toggleReturnFireOnly(): void {
    const selectedUnits = this.game.selectionManager.getSelectedUnits();
    for (const unit of selectedUnits) {
      unit.setReturnFireOnly(!unit.returnFireOnly);
    }
  }

  private handleClickSelection(event: MouseEvent): void {
    const hits = this.game.getUnitsAtScreen(event.clientX, event.clientY);

    if (hits.length > 0) {
      const clickedUnit = this.findUnitFromMesh(hits[0]!);
      if (clickedUnit) {
        if (this.state.modifiers.shift) {
          // Add/remove from selection
          this.game.selectionManager.toggleSelection(clickedUnit);
        } else {
          // Replace selection
          this.game.selectionManager.setSelection([clickedUnit]);
        }
        return;
      }
    }

    // Clicked on nothing - clear selection (unless shift held)
    if (!this.state.modifiers.shift) {
      this.game.selectionManager.clearSelection();
    }
  }

  private handleRightClick(event: MouseEvent): void {
    // Check if waiting for reinforcement destination (old workflow) - right-click cancels
    if (this.game.reinforcementManager.isWaitingForDestination()) {
      this.game.reinforcementManager.cancelDestinationWait();
      return;
    }

    const selectedUnits = this.game.selectionManager.getSelectedUnits();
    if (selectedUnits.length === 0) return;

    const queue = this.state.modifiers.shift;
    const isSetupPhase = this.game.phase === GamePhase.Setup;

    // Check if clicked on a unit
    const hits = this.game.getUnitsAtScreen(event.clientX, event.clientY);
    const targetUnit = hits.length > 0 ? this.findUnitFromMesh(hits[0]!) : null;

    // Check if clicked on a friendly transport - mount command
    if (targetUnit && targetUnit.team === 'player' && this.game.transportManager.isTransport(targetUnit)) {
      // Issue mount commands to selected units
      selectedUnits.forEach(unit => {
        // Only infantry can mount into transports
        if (unit.category === 'INF' && !this.game.transportManager.isMounted(unit)) {
          if (this.game.transportManager.getAvailableCapacity(targetUnit) > 0) {
            // Set move command to transport, will mount on arrival
            unit.setMountCommand(targetUnit);
          } else {
            console.log(`${targetUnit.name} is full`);
          }
        }
      });
      return;
    }

    // Check if clicked on a building - garrison command
    const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
    if (worldPos) {
      const building = this.game.buildingManager.getBuildingAt(worldPos);
      if (building) {
        // Issue garrison commands to selected infantry units
        selectedUnits.forEach(unit => {
          if (unit.category === 'INF' && !unit.isGarrisoned) {
            unit.setGarrisonCommand(building);
          }
        });
        return;
      }
    }

    if (targetUnit && targetUnit.team !== 'player') {
      // Attack command
      if (isSetupPhase) {
        // Queue as pre-order during setup
        selectedUnits.forEach(unit => {
          this.game.queuePreOrder(unit.id, 'attack', targetUnit.position.clone(), targetUnit);
        });
      } else {
        this.game.unitManager.issueAttackCommand(selectedUnits, targetUnit, queue);
      }
    } else {
      // Movement command - check for movement modifiers
      const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
      if (!worldPos) return;

      const { reverse, fast, attackMove } = this.state.movementModifiers;

      if (isSetupPhase) {
        // Queue as pre-order during setup
        let orderType = 'move';
        if (attackMove) orderType = 'attackMove';
        else if (reverse) orderType = 'reverse';
        else if (fast) orderType = 'fast';

        selectedUnits.forEach(unit => {
          this.game.queuePreOrder(unit.id, orderType, worldPos.clone());
        });
      } else {
        // Execute immediately during battle
        if (attackMove) {
          this.game.unitManager.issueAttackMoveCommand(selectedUnits, worldPos, queue);
        } else if (reverse) {
          this.game.unitManager.issueReverseCommand(selectedUnits, worldPos, queue);
        } else if (fast) {
          this.game.unitManager.issueFastMoveCommand(selectedUnits, worldPos, queue);
        } else {
          this.game.unitManager.issueMoveCommand(selectedUnits, worldPos, queue);
        }
      }
    }
  }

  private findUnitFromMesh(mesh: THREE.Object3D): ReturnType<typeof this.game.unitManager.getUnitById> {
    // Traverse up to find the unit root object
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (current.userData['unitId']) {
        return this.game.unitManager.getUnitById(current.userData['unitId'] as string);
      }
      current = current.parent;
    }
    return null;
  }

  private updateSelectionBox(): void {
    if (!this.selectionBox) return;

    const left = Math.min(this.state.dragStartX, this.state.mouseX);
    const top = Math.min(this.state.dragStartY, this.state.mouseY);
    const width = Math.abs(this.state.mouseX - this.state.dragStartX);
    const height = Math.abs(this.state.mouseY - this.state.dragStartY);

    this.selectionBox.style.display = 'block';
    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }

  private hideSelectionBox(): void {
    if (this.selectionBox) {
      this.selectionBox.style.display = 'none';
    }
  }

  private finishBoxSelection(): void {
    const left = Math.min(this.state.dragStartX, this.state.mouseX);
    const top = Math.min(this.state.dragStartY, this.state.mouseY);
    const right = Math.max(this.state.dragStartX, this.state.mouseX);
    const bottom = Math.max(this.state.dragStartY, this.state.mouseY);

    // Get all units within the box
    const unitsInBox = this.game.unitManager.getUnitsInScreenRect(
      left, top, right, bottom,
      this.game.camera
    );

    // Filter to only player units
    const playerUnits = unitsInBox.filter(u => u.team === 'player');

    if (playerUnits.length > 0) {
      if (this.state.modifiers.shift) {
        // Add to existing selection
        this.game.selectionManager.addToSelection(playerUnits);
      } else {
        // Replace selection
        this.game.selectionManager.setSelection(playerUnits);
      }
    }
  }

  /**
   * Handle formation drawing via right-click drag
   */
  private handleFormationDrag(event: MouseEvent): void {
    const selectedUnits = this.game.selectionManager.getSelectedUnits();
    if (selectedUnits.length === 0) return;

    // Add final point to path
    this.addPointToFormationPath(event.clientX, event.clientY);

    // Calculate total path length
    const pathLength = this.getPathLength();

    // If path is very short (< 5m), treat as single point (auto-spread)
    if (pathLength < 5 || this.formationPath.length < 2) {
      const endWorld = this.game.screenToWorld(event.clientX, event.clientY);
      if (endWorld) {
        this.distributeUnitsAtPoint(selectedUnits, endWorld);
      }
      this.formationPath = [];
      return;
    }

    // Distribute units along the curved path
    this.distributeUnitsAlongPath(selectedUnits);
    this.formationPath = [];
  }

  /**
   * Calculate total length of the formation path
   */
  private getPathLength(): number {
    let length = 0;
    for (let i = 1; i < this.formationPath.length; i++) {
      length += this.formationPath[i - 1]!.distanceTo(this.formationPath[i]!);
    }
    return length;
  }

  /**
   * Distribute units at a single point with auto-spread
   */
  private distributeUnitsAtPoint(units: any[], center: THREE.Vector3): void {
    const spacing = 4; // 4m between units
    const columns = Math.ceil(Math.sqrt(units.length));

    units.forEach((unit, i) => {
      const row = Math.floor(i / columns);
      const col = i % columns;

      const offsetX = (col - columns / 2) * spacing;
      const offsetZ = (row - Math.floor(units.length / columns) / 2) * spacing;

      const target = new THREE.Vector3(
        center.x + offsetX,
        0,
        center.z + offsetZ
      );

      // Issue move command based on modifiers
      this.issueFormationCommand(unit, target);
    });
  }

  /**
   * Distribute units evenly along the curved formation path
   */
  private distributeUnitsAlongPath(units: any[]): void {
    const count = units.length;
    const totalLength = this.getPathLength();

    units.forEach((unit, i) => {
      // Calculate target distance along path (evenly spaced)
      const targetDist = count === 1 ? totalLength / 2 : (i / (count - 1)) * totalLength;
      const target = this.getPointAlongPath(targetDist);

      if (target) {
        this.issueFormationCommand(unit, target);
      }
    });
  }

  /**
   * Get a point at a specific distance along the path
   */
  private getPointAlongPath(targetDistance: number): THREE.Vector3 | null {
    if (this.formationPath.length === 0) return null;
    if (this.formationPath.length === 1) return this.formationPath[0]!.clone();

    let accumulated = 0;

    for (let i = 1; i < this.formationPath.length; i++) {
      const segmentStart = this.formationPath[i - 1]!;
      const segmentEnd = this.formationPath[i]!;
      const segmentLength = segmentStart.distanceTo(segmentEnd);

      if (accumulated + segmentLength >= targetDistance) {
        // Target is on this segment
        const remainingDist = targetDistance - accumulated;
        const t = segmentLength > 0 ? remainingDist / segmentLength : 0;
        return new THREE.Vector3().lerpVectors(segmentStart, segmentEnd, t);
      }

      accumulated += segmentLength;
    }

    // If we've gone past the end, return the last point
    return this.formationPath[this.formationPath.length - 1]!.clone();
  }

  /**
   * Issue movement command based on current modifiers
   */
  private issueFormationCommand(unit: any, target: THREE.Vector3): void {
    const isSetupPhase = this.game.phase === GamePhase.Setup;

    if (isSetupPhase) {
      // Queue as pre-order during setup
      let orderType = 'move';
      if (this.state.movementModifiers.fast) orderType = 'fast';
      else if (this.state.movementModifiers.reverse) orderType = 'reverse';
      else if (this.state.movementModifiers.attackMove) orderType = 'attackMove';

      this.game.queuePreOrder(unit.id, orderType, target.clone());
    } else {
      // Execute immediately during battle
      if (this.state.movementModifiers.fast) {
        unit.setFastMoveCommand(target);
      } else if (this.state.movementModifiers.reverse) {
        unit.setReverseCommand(target);
      } else if (this.state.movementModifiers.attackMove) {
        unit.setMoveCommand(target); // Attack move doesn't have target position variant
      } else {
        unit.setMoveCommand(target);
      }
    }
  }

  /**
   * Update formation preview ghosts while right-dragging
   */
  private updateFormationPreview(mouseX: number, mouseY: number): void {
    const selectedUnits = this.game.selectionManager.getSelectedUnits();
    if (selectedUnits.length === 0) {
      this.clearFormationPreview();
      return;
    }

    const endWorld = this.game.screenToWorld(mouseX, mouseY);
    if (!endWorld) {
      this.clearFormationPreview();
      return;
    }

    // Calculate formation positions using the path
    const positions = this.calculateFormationPositions(selectedUnits, endWorld);

    // Update or create ghost meshes
    this.updateGhostMeshes(positions);
  }

  /**
   * Calculate formation positions for units along the curved path
   */
  private calculateFormationPositions(units: any[], endWorld: THREE.Vector3): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const pathLength = this.getPathLength();

    // If path is very short or has few points, auto-spread at end point
    if (pathLength < 5 || this.formationPath.length < 2) {
      const spacing = 3;
      const perRow = Math.ceil(Math.sqrt(units.length));

      units.forEach((_, index) => {
        const row = Math.floor(index / perRow);
        const col = index % perRow;
        const offsetX = (col - (perRow - 1) / 2) * spacing;
        const offsetZ = row * spacing;
        positions.push(new THREE.Vector3(
          endWorld.x + offsetX,
          endWorld.y,
          endWorld.z + offsetZ
        ));
      });
    } else {
      // Distribute units evenly along the curved path
      const count = units.length;
      units.forEach((_, i) => {
        const targetDist = count === 1 ? pathLength / 2 : (i / (count - 1)) * pathLength;
        const pos = this.getPointAlongPath(targetDist);
        if (pos) {
          positions.push(pos);
        }
      });
    }

    return positions;
  }

  /**
   * Update ghost meshes to match formation positions
   */
  private updateGhostMeshes(positions: THREE.Vector3[]): void {
    // Remove excess ghosts
    while (this.formationGhosts.length > positions.length) {
      const ghost = this.formationGhosts.pop();
      if (ghost) {
        this.game.scene.remove(ghost);
        ghost.geometry.dispose();
        (ghost.material as THREE.Material).dispose();
      }
    }

    // Create or update ghosts
    positions.forEach((pos, i) => {
      if (i < this.formationGhosts.length) {
        // Update existing ghost
        this.formationGhosts[i]!.position.copy(pos);
      } else {
        // Create new ghost
        const geometry = new THREE.CylinderGeometry(1, 1, 0.2, 16);
        const material = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.3,
          depthTest: false,
        });
        const ghost = new THREE.Mesh(geometry, material);
        ghost.position.copy(pos);
        ghost.position.y = 0.1; // Slightly above ground
        ghost.renderOrder = 1000;
        this.formationGhosts.push(ghost);
        this.game.scene.add(ghost);
      }
    });
  }

  /**
   * Clear all formation preview ghosts
   */
  private clearFormationPreview(): void {
    this.formationGhosts.forEach(ghost => {
      this.game.scene.remove(ghost);
      ghost.geometry.dispose();
      (ghost.material as THREE.Material).dispose();
    });
    this.formationGhosts = [];
  }

  update(_dt: number): void {
    // Input manager doesn't need frame updates currently
  }

  // Public getters
  get mousePosition(): { x: number; y: number } {
    return { x: this.state.mouseX, y: this.state.mouseY };
  }

  get modifiers(): InputState['modifiers'] {
    return { ...this.state.modifiers };
  }

  get movementModifiers(): InputState['movementModifiers'] {
    return { ...this.state.movementModifiers };
  }

  get isLOSPreviewActive(): boolean {
    return this.state.losPreviewActive;
  }
}
