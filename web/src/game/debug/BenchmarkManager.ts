import { Game } from '../../core/Game';
import * as THREE from 'three';
import { GamePhase } from '../../core/Game';
import { ScreenType } from '../../core/ScreenManager';

interface BenchmarkStats {
    minFps: number;
    maxFps: number;
    avgFps: number;
    totalFrames: number;
    duration: number;
    samples: number[];
}

export class BenchmarkManager {
    private game: Game;
    private isRunning = false;
    private timeElapsed = 0;
    private maxDuration = 30; // 30 seconds test
    private stats: BenchmarkStats = {
        minFps: Infinity,
        maxFps: 0,
        avgFps: 0,
        totalFrames: 0,
        duration: 0,
        samples: []
    };

    // FPS sampling
    private lastFpsSampleTime = 0;
    private frameCount = 0;

    constructor(game: Game) {
        this.game = game;
    }

    /**
     * Start the benchmark scenario
     */
    public async startBenchmark(): Promise<void> {
        if (this.isRunning) return;

        console.log('BENCHMARK: Starting performance benchmark...');
        this.isRunning = true;
        this.timeElapsed = 0;
        this.frameCount = 0;
        this.lastFpsSampleTime = 0;
        this.stats = {
            minFps: Infinity,
            maxFps: 0,
            avgFps: 0,
            totalFrames: 0,
            duration: 0,
            samples: []
        };

        // 1. Setup map
        // Use a fixed seed for reproducibility
        const seed = 12345;
        const size = 'medium';

        // Start skirmish (this generates map and switches screens)
        this.game.startSkirmish(
            { id: 'benchmark', name: 'Benchmark', divisionId: 'test', units: [], activationPoints: 0 }, // Dummy deck
            size,
            seed,
            [{ type: 'YOU', difficulty: 'Medium' }],
            [{ type: 'CPU', difficulty: 'Medium' }]
        );

        // Wait for map generation and scene setup
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Setup camera
        // Position camera to see the action
        if (this.game.currentMap) {
            this.game.cameraController.setPosition(0, 0); // Center
            this.game.camera.position.y = 100;
            this.game.camera.lookAt(0, 0, 0);
        }

        // 3. Spawn Units
        this.spawnBenchmarkUnits();

        // 4. Force Battle Phase
        this.game.setPhase(GamePhase.Battle);
        this.game.screenManager.switchTo(ScreenType.Battle);
        this.game.deploymentManager.hide();
        this.game.unitManager.unfreezeAll();

        // 5. Issue Attack Commands
        this.engageArmies();

        console.log('BENCHMARK: Scenario loaded. Measuring...');
    }

    /**
     * Update benchmark logic (called from Game loop)
     */
    public update(dt: number): void {
        if (!this.isRunning) return;

        this.timeElapsed += dt;
        this.frameCount++;

        // Sample FPS every 0.5s
        if (this.timeElapsed - this.lastFpsSampleTime >= 0.5) {
            const fps = this.frameCount / (this.timeElapsed - this.lastFpsSampleTime);
            this.stats.samples.push(fps);
            this.stats.minFps = Math.min(this.stats.minFps, fps);
            this.stats.maxFps = Math.max(this.stats.maxFps, fps);

            this.frameCount = 0;
            this.lastFpsSampleTime = this.timeElapsed;

            console.log(`BENCHMARK: ${this.timeElapsed.toFixed(1)}s - FPS: ${Math.round(fps)}`);
        }

        // End benchmark
        if (this.timeElapsed >= this.maxDuration) {
            this.stopBenchmark();
        }
    }

    /**
     * Stop benchmark and report
     */
    public stopBenchmark(): void {
        this.isRunning = false;

        // Calculate average
        const sum = this.stats.samples.reduce((a, b) => a + b, 0);
        this.stats.avgFps = sum / this.stats.samples.length;
        this.stats.duration = this.timeElapsed;

        console.log('----------------------------------------');
        console.log('BENCHMARK COMPLETE');
        console.log('----------------------------------------');
        console.log(`Duration: ${this.stats.duration.toFixed(1)}s`);
        console.log(`Min FPS:  ${this.stats.minFps.toFixed(1)}`);
        console.log(`Max FPS:  ${this.stats.maxFps.toFixed(1)}`);
        console.log(`Avg FPS:  ${this.stats.avgFps.toFixed(1)}`);
        console.log('----------------------------------------');

        // Display on screen
        this.showResults();
    }

    private spawnBenchmarkUnits(): void {
        const unitCount = 50; // Per team
        const spread = 80;

        // Spawn Blue Team (Player) - Left side
        for (let i = 0; i < unitCount; i++) {
            const x = -100 + (Math.random() - 0.5) * spread;
            const z = (Math.random() - 0.5) * spread;
            const type = Math.random() > 0.7 ? 'tank' : 'riflemen'; // Mix of tanks and infantry

            this.game.unitManager.spawnUnit({
                position: new THREE.Vector3(x, 0, z),
                team: 'player',
                ownerId: 'player',
                unitType: type === 'tank' ? 'vanguard_tank' : 'vanguard_infantry',
            });
        }

        // Spawn Red Team (Enemy) - Right side
        for (let i = 0; i < unitCount; i++) {
            const x = 100 + (Math.random() - 0.5) * spread;
            const z = (Math.random() - 0.5) * spread;
            const type = Math.random() > 0.7 ? 'tank' : 'riflemen';

            this.game.unitManager.spawnUnit({
                position: new THREE.Vector3(x, 0, z),
                team: 'enemy',
                ownerId: 'enemy',
                unitType: type === 'tank' ? 'vanguard_tank' : 'vanguard_infantry',
            });
        }
    }

    private engageArmies(): void {
        const playerUnits = this.game.unitManager.getAllUnits('player');
        const enemyUnits = this.game.unitManager.getAllUnits('enemy');

        // All player units attack move to center right
        this.game.unitManager.issueAttackMoveCommand(playerUnits, new THREE.Vector3(100, 0, 0), false);

        // All enemy units attack move to center left
        this.game.unitManager.issueAttackMoveCommand(enemyUnits, new THREE.Vector3(-100, 0, 0), false);
    }

    private showResults(): void {
        const div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.top = '50%';
        div.style.left = '50%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.backgroundColor = 'rgba(0,0,0,0.9)';
        div.style.color = '#00ff00';
        div.style.padding = '20px';
        div.style.fontFamily = 'monospace';
        div.style.fontSize = '20px';
        div.style.zIndex = '10000';
        div.style.border = '2px solid #00ff00';

        div.innerHTML = `
      <h1>BENCHMARK RESULTS</h1>
      <p>Min FPS: ${this.stats.minFps.toFixed(1)}</p>
      <p>Avg FPS: ${this.stats.avgFps.toFixed(1)}</p>
      <p>Max FPS: ${this.stats.maxFps.toFixed(1)}</p>
      <button onclick="this.parentElement.remove()">Close</button>
    `;

        document.body.appendChild(div);
    }
}
