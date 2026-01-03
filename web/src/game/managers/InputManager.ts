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
  dragStartX: number;
  dragStartY: number;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
  };
}

export class InputManager {
  private readonly game: Game;
  private readonly state: InputState;

  // Selection box element
  private selectionBox: HTMLDivElement | null = null;
  private readonly DRAG_THRESHOLD = 5; // pixels before considered a drag

  constructor(game: Game) {
    this.game = game;
    this.state = {
      mouseX: 0,
      mouseY: 0,
      isLeftMouseDown: false,
      isRightMouseDown: false,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      modifiers: {
        shift: false,
        ctrl: false,
        alt: false,
      },
    };
  }

  initialize(): void {
    const canvas = this.game.renderer.domElement;

    // Mouse events
    canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));

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
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) {
      // Left mouse release
      if (this.state.isDragging) {
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
      // Right click - issue command
      this.handleRightClick(event);
      this.state.isRightMouseDown = false;
    }
  }

  private onMouseMove(event: MouseEvent): void {
    this.state.mouseX = event.clientX;
    this.state.mouseY = event.clientY;

    // Check for drag start
    if (this.state.isLeftMouseDown && !this.state.isDragging) {
      const dx = event.clientX - this.state.dragStartX;
      const dy = event.clientY - this.state.dragStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.DRAG_THRESHOLD) {
        this.state.isDragging = true;
      }
    }

    // Update selection box
    if (this.state.isDragging) {
      this.updateSelectionBox();
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
        this.game.selectionManager.clearSelection();
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
        // Select all player units
        if (event.ctrlKey) {
          event.preventDefault();
          this.game.selectionManager.selectAllPlayerUnits();
        }
        break;

      case 'Delete':
      case 'KeyL':
        // Sell/delete selected units (setup phase only)
        if (this.game.phase === GamePhase.Setup) {
          this.game.unitManager.sellSelected();
        }
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.state.modifiers.shift = event.shiftKey;
    this.state.modifiers.ctrl = event.ctrlKey;
    this.state.modifiers.alt = event.altKey;
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
    const selectedUnits = this.game.selectionManager.getSelectedUnits();
    if (selectedUnits.length === 0) return;

    // Check if clicked on an enemy
    const hits = this.game.getUnitsAtScreen(event.clientX, event.clientY);
    const targetUnit = hits.length > 0 ? this.findUnitFromMesh(hits[0]!) : null;

    if (targetUnit && targetUnit.team !== 'player') {
      // Attack command
      this.game.unitManager.issueAttackCommand(
        selectedUnits,
        targetUnit,
        this.state.modifiers.shift // queue command
      );
    } else {
      // Move command
      const worldPos = this.game.screenToWorld(event.clientX, event.clientY);
      if (worldPos) {
        this.game.unitManager.issueMoveCommand(
          selectedUnits,
          worldPos,
          this.state.modifiers.shift // queue command
        );
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
}
