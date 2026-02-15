/**
 * CreditTickTimer - Sacred Machine Reactor visual for income tick countdown
 *
 * A rotating mechanical gauge with Gothic industrial aesthetics
 * that shows progress toward the next credit income tick.
 */

export class CreditTickTimer {
  private container: HTMLElement;
  private progressCircle: SVGCircleElement;
  private innerGear: HTMLElement;
  private outerGear: HTMLElement;
  private energyCore: HTMLElement;
  private particles: HTMLElement[] = [];

  private readonly CIRCLE_RADIUS = 16;
  private readonly CIRCLE_CIRCUMFERENCE = 2 * Math.PI * this.CIRCLE_RADIUS;

  constructor(parentElement: HTMLElement) {
    this.container = this.createTimerElement();
    parentElement.appendChild(this.container);

    // Cache element references
    this.progressCircle = this.container.querySelector('.tick-timer-progress')!;
    this.innerGear = this.container.querySelector('.tick-timer-inner-gear')!;
    this.outerGear = this.container.querySelector('.tick-timer-outer-gear')!;
    this.energyCore = this.container.querySelector('.tick-timer-core')!;

    // Setup initial state
    this.progressCircle.style.strokeDasharray = `${this.CIRCLE_CIRCUMFERENCE}`;
    this.progressCircle.style.strokeDashoffset = `${this.CIRCLE_CIRCUMFERENCE}`;
  }

  /**
   * Update timer progress (0.0 to 1.0)
   */
  update(progress: number): void {
    // Update circular progress
    const offset = this.CIRCLE_CIRCUMFERENCE * (1 - progress);
    this.progressCircle.style.strokeDashoffset = `${offset}`;

    // Rotate gears (opposite directions for mechanical feel)
    const rotation = progress * 360;
    this.outerGear.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    this.innerGear.style.transform = `translate(-50%, -50%) rotate(${-rotation * 1.5}deg)`;

    // Pulse energy core intensity based on progress
    const intensity = 0.4 + (progress * 0.6);
    this.energyCore.style.opacity = `${intensity}`;
    this.energyCore.style.transform = `translate(-50%, -50%) scale(${0.7 + progress * 0.3})`;

    // Trigger completion animation at 100%
    if (progress >= 1.0) {
      this.playCompletionAnimation();
    }
  }

  /**
   * Satisfying energy discharge animation when tick completes
   */
  private playCompletionAnimation(): void {
    this.container.classList.add('tick-complete');

    // Create energy burst particles
    for (let i = 0; i < 8; i++) {
      this.createBurstParticle(i);
    }

    // Remove animation class after completion
    setTimeout(() => {
      this.container.classList.remove('tick-complete');
      this.clearParticles();
    }, 600);
  }

  private createBurstParticle(index: number): void {
    const particle = document.createElement('div');
    particle.className = 'tick-timer-burst-particle';

    const angle = (index / 8) * 360;
    particle.style.setProperty('--burst-angle', `${angle}deg`);
    particle.style.animationDelay = `${index * 15}ms`;

    this.container.appendChild(particle);
    this.particles.push(particle);
  }

  private clearParticles(): void {
    this.particles.forEach(p => p.remove());
    this.particles = [];
  }

  destroy(): void {
    this.container.remove();
  }

  private createTimerElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'tick-timer-container';
    container.innerHTML = `
      <svg class="tick-timer-svg" viewBox="0 0 40 40">
        <!-- Background circle -->
        <circle
          class="tick-timer-bg"
          cx="20"
          cy="20"
          r="${this.CIRCLE_RADIUS}"
          fill="none"
          stroke="rgba(196, 164, 74, 0.15)"
          stroke-width="2"
        />
        <!-- Progress circle -->
        <circle
          class="tick-timer-progress"
          cx="20"
          cy="20"
          r="${this.CIRCLE_RADIUS}"
          fill="none"
          stroke="url(#tick-gradient)"
          stroke-width="2"
          stroke-linecap="round"
          transform="rotate(-90 20 20)"
        />
        <!-- Gradient definition -->
        <defs>
          <linearGradient id="tick-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffd666" />
            <stop offset="50%" stop-color="#ff8800" />
            <stop offset="100%" stop-color="#c4a44a" />
          </linearGradient>
          <filter id="tick-glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>

      <!-- Outer gear (8 cogs) -->
      <div class="tick-timer-outer-gear">
        ${Array.from({ length: 8 }, (_, i) => `
          <div class="tick-timer-cog" style="transform: rotate(${i * 45}deg) translateY(-17px)"></div>
        `).join('')}
      </div>

      <!-- Inner gear (6 cogs) -->
      <div class="tick-timer-inner-gear">
        ${Array.from({ length: 6 }, (_, i) => `
          <div class="tick-timer-cog-inner" style="transform: rotate(${i * 60}deg) translateY(-12px)"></div>
        `).join('')}
      </div>

      <!-- Central energy core -->
      <div class="tick-timer-core"></div>

      <!-- Energy arcs (decorative) -->
      <div class="tick-timer-arcs">
        <div class="tick-timer-arc tick-timer-arc-1"></div>
        <div class="tick-timer-arc tick-timer-arc-2"></div>
        <div class="tick-timer-arc tick-timer-arc-3"></div>
      </div>
    `;

    // Add styles
    this.injectStyles();

    return container;
  }

  private injectStyles(): void {
    if (document.getElementById('tick-timer-styles')) return;

    const style = document.createElement('style');
    style.id = 'tick-timer-styles';
    style.textContent = `
      .tick-timer-container {
        position: relative;
        width: 40px;
        height: 40px;
        display: inline-block;
        vertical-align: middle;
        margin-left: 6px;
      }

      .tick-timer-svg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        filter: url(#tick-glow);
        z-index: 2;
      }

      .tick-timer-progress {
        transition: stroke-dashoffset 0.1s linear;
        filter: drop-shadow(0 0 3px rgba(255, 136, 0, 0.8));
      }

      /* Outer gear */
      .tick-timer-outer-gear {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 100%;
        height: 100%;
        transform: translate(-50%, -50%);
        transition: transform 0.1s linear;
        z-index: 1;
      }

      .tick-timer-cog {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 3px;
        height: 6px;
        background: linear-gradient(180deg, #c4a44a 0%, #8b7335 100%);
        transform-origin: center center;
        box-shadow: 0 0 2px rgba(196, 164, 74, 0.6);
      }

      /* Inner gear */
      .tick-timer-inner-gear {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 70%;
        height: 70%;
        transform: translate(-50%, -50%);
        transition: transform 0.1s linear;
        z-index: 3;
      }

      .tick-timer-cog-inner {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 2px;
        height: 4px;
        background: linear-gradient(180deg, #ffd666 0%, #c4a44a 100%);
        transform-origin: center center;
        box-shadow: 0 0 2px rgba(255, 214, 102, 0.8);
      }

      /* Energy core */
      .tick-timer-core {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 8px;
        height: 8px;
        transform: translate(-50%, -50%);
        background: radial-gradient(circle, #fff 0%, #ffd666 30%, #ff8800 70%, transparent 100%);
        border-radius: 50%;
        box-shadow:
          0 0 4px rgba(255, 214, 102, 1),
          0 0 8px rgba(255, 136, 0, 0.8),
          0 0 12px rgba(255, 136, 0, 0.4);
        z-index: 4;
        transition: opacity 0.1s linear, transform 0.1s linear;
        animation: core-pulse 2s ease-in-out infinite;
      }

      @keyframes core-pulse {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.3); }
      }

      /* Energy arcs (subtle ambient animation) */
      .tick-timer-arcs {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
        opacity: 0.3;
      }

      .tick-timer-arc {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 2px;
        height: 14px;
        background: linear-gradient(180deg, transparent 0%, #ff8800 50%, transparent 100%);
        transform-origin: center center;
        animation: arc-flicker 1.5s ease-in-out infinite;
      }

      .tick-timer-arc-1 {
        transform: translate(-50%, -50%) rotate(30deg) translateY(-10px);
        animation-delay: 0s;
      }

      .tick-timer-arc-2 {
        transform: translate(-50%, -50%) rotate(150deg) translateY(-10px);
        animation-delay: 0.5s;
      }

      .tick-timer-arc-3 {
        transform: translate(-50%, -50%) rotate(270deg) translateY(-10px);
        animation-delay: 1s;
      }

      @keyframes arc-flicker {
        0%, 100% { opacity: 0.2; }
        50% { opacity: 0.6; }
      }

      /* Completion animation */
      .tick-timer-container.tick-complete .tick-timer-core {
        animation: core-burst 0.6s ease-out;
      }

      .tick-timer-container.tick-complete .tick-timer-svg {
        animation: ring-flash 0.4s ease-out;
      }

      @keyframes core-burst {
        0% {
          transform: translate(-50%, -50%) scale(1);
          box-shadow:
            0 0 4px rgba(255, 214, 102, 1),
            0 0 8px rgba(255, 136, 0, 0.8),
            0 0 12px rgba(255, 136, 0, 0.4);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.8);
          box-shadow:
            0 0 12px rgba(255, 214, 102, 1),
            0 0 24px rgba(255, 136, 0, 1),
            0 0 36px rgba(255, 136, 0, 0.8);
        }
        100% {
          transform: translate(-50%, -50%) scale(0.7);
          opacity: 0.4;
        }
      }

      @keyframes ring-flash {
        0% { opacity: 1; }
        50% { opacity: 1; filter: brightness(2) url(#tick-glow); }
        100% { opacity: 1; }
      }

      /* Burst particles */
      .tick-timer-burst-particle {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 2px;
        height: 8px;
        background: linear-gradient(180deg, #fff 0%, #ff8800 100%);
        transform: translate(-50%, -50%) rotate(var(--burst-angle)) translateY(0);
        animation: particle-burst 0.5s ease-out forwards;
        box-shadow: 0 0 4px rgba(255, 136, 0, 1);
        z-index: 5;
      }

      @keyframes particle-burst {
        0% {
          transform: translate(-50%, -50%) rotate(var(--burst-angle)) translateY(0);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -50%) rotate(var(--burst-angle)) translateY(-16px);
          opacity: 0;
        }
      }
    `;

    document.head.appendChild(style);
  }
}
