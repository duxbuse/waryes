/**
 * BackgroundCanvas - Animated starfield, planet, and particle effects
 * Renders on two fixed canvases behind the game UI.
 * CRITICAL: hideBackground() cancels all RAF loops to protect 60 FPS during battle.
 */

// --- Types ---
interface Star {
  /** Angle around the rotation center (radians) */
  angle: number;
  /** Distance from the rotation center (pixels, based on 3000x3000 init grid) */
  dist: number;
  sz: number;
  spd: number;
  a: number;
  tw: number;
  to: number;
  col: string;
}

interface Particle {
  angle: number;
  dist: number;
  sz: number;
  spd: number;
  a: number;
  c: readonly [number, number, number];
  tw: number;
  to: number;
}

// --- State ---
let starfieldCanvas: HTMLCanvasElement | null = null;
let particleCanvas: HTMLCanvasElement | null = null;
let starfieldCtx: CanvasRenderingContext2D | null = null;
let particleCtx: CanvasRenderingContext2D | null = null;

let starfieldRafId = 0;
let particleRafId = 0;
let running = false;

let W = 0;
let H = 0;
const stars: Star[] = [];
const particles: Particle[] = [];

// Orbit center (fraction of viewport) — 30% closer to center from bottom-left
const STAR_POS = { cx: 0.255, cy: 0.675 };
// Planet params — orbitFrac is fraction of window diagonal for orbit radius
const PLANET = { rFrac: 0.12, orbitFrac: 0.176, orbitSpeed: 0.000075 };

const PARTICLE_COLORS: readonly (readonly [number, number, number])[] = [
  [0, 170, 255],
  [0, 170, 255],
  [255, 136, 0],
  [196, 164, 74],
  [0, 255, 204],
] as const;

// --- Initialization ---
function createStars(): void {
  stars.length = 0;
  const layers = [
    { count: 260, speed: 0.000006, szMin: 0.3, szMax: 0.9, alpha: 0.35 },
    { count: 130, speed: 0.000015, szMin: 0.5, szMax: 1.4, alpha: 0.55 },
    { count: 55,  speed: 0.000035, szMin: 0.8, szMax: 2.2, alpha: 0.85 },
  ];
  for (const L of layers) {
    for (let i = 0; i < L.count; i++) {
      const hue = Math.random();
      let col = '#fff';
      if (hue > 0.92) col = '#aaccff';
      else if (hue > 0.84) col = '#ffccaa';
      else if (hue > 0.80) col = '#ffdddd';
      // Store in polar coords: random angle, random distance from center
      // Distance uses sqrt for uniform area distribution
      const maxDist = Math.max(3000, 3000) * 0.85;
      stars.push({
        angle: Math.random() * Math.PI * 2,
        dist: Math.sqrt(Math.random()) * maxDist,
        sz: L.szMin + Math.random() * (L.szMax - L.szMin),
        spd: L.speed,
        a: L.alpha * (0.4 + Math.random() * 0.6),
        tw: 0.4 + Math.random() * 2.5,
        to: Math.random() * 6.28,
        col,
      });
    }
  }
}

function createParticles(): void {
  particles.length = 0;
  const maxDist = Math.max(3000, 3000) * 0.85;
  for (let i = 0; i < 35; i++) {
    const c = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]!;
    particles.push({
      angle: Math.random() * Math.PI * 2,
      dist: Math.sqrt(Math.random()) * maxDist,
      sz: 0.4 + Math.random() * 1.8,
      spd: 0.000008 + Math.random() * 0.000020,
      a: 0.08 + Math.random() * 0.25,
      c,
      tw: 0.3 + Math.random() * 2.0,
      to: Math.random() * 6.28,
    });
  }
}

function resize(): void {
  W = window.innerWidth;
  H = window.innerHeight;
  if (starfieldCanvas) {
    starfieldCanvas.width = W;
    starfieldCanvas.height = H;
  }
  if (particleCanvas) {
    particleCanvas.width = W;
    particleCanvas.height = H;
  }
}

// --- Rendering ---
function drawRingHalf(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, r: number, tilt: number,
  startAngle: number, endAngle: number, isFront: boolean
): void {
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(1, tilt);
  const ringInner = r * 1.3;
  const ringOuter = r * 2.0;
  for (let band = 0; band < 5; band++) {
    const ri = ringInner + (ringOuter - ringInner) * (band / 5);
    const ro = ringInner + (ringOuter - ringInner) * ((band + 1) / 5);
    const alphas = isFront ? [0.08, 0.14, 0.06, 0.12, 0.07] : [0.06, 0.1, 0.04, 0.09, 0.05];
    const hues = [210, 220, 200, 215, 225];
    const lightness = isFront ? 60 : 55;
    ctx.beginPath();
    ctx.arc(0, 0, (ri + ro) / 2, startAngle, endAngle);
    ctx.strokeStyle = `hsla(${hues[band]}, 40%, ${lightness}%, ${alphas[band]})`;
    ctx.lineWidth = (ro - ri) * 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

/** Planet orbiting an invisible center point */
function drawPlanet(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number): void {
  const diag = Math.sqrt(W * W + H * H);
  const orbitR = diag * PLANET.orbitFrac;
  const orbitAngle = -t * PLANET.orbitSpeed; // clockwise

  // Orbit as a tilted ellipse: top-right ↔ bottom-left flow
  // Rotate the circular orbit -45° so major axis runs TR↔BL, compress minor axis for tilt
  const K = 0.7071; // cos/sin 45°
  const circX = Math.cos(orbitAngle) * orbitR;
  const circY = Math.sin(orbitAngle) * orbitR * 0.5; // 60° tilt from screen plane
  // Rotate -45° into screen space
  const px = sx + circX * K + circY * K;
  const py = sy - circX * K + circY * K;

  const r = Math.min(W, H) * PLANET.rFrac;
  const ringTilt = 0.3;

  // Back ring
  drawRingHalf(ctx, px, py, r, ringTilt, Math.PI, Math.PI * 2, false);

  // Atmosphere glow
  const g1 = ctx.createRadialGradient(px, py, r * 0.85, px, py, r * 1.7);
  g1.addColorStop(0, 'rgba(40,100,255,0.07)');
  g1.addColorStop(0.6, 'rgba(20,60,180,0.02)');
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1;
  ctx.fillRect(px - r * 2, py - r * 2, r * 4, r * 4);

  // Planet body
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.clip();

  // Shade the planet based on direction to the star (illumination)
  const toStarX = sx - px;
  const toStarY = sy - py;
  const toStarDist = Math.sqrt(toStarX * toStarX + toStarY * toStarY) || 1;
  const lightDirX = toStarX / toStarDist;
  const lightDirY = toStarY / toStarDist;

  const bg = ctx.createLinearGradient(
    px + lightDirX * r, py + lightDirY * r,
    px - lightDirX * r, py - lightDirY * r
  );
  bg.addColorStop(0, '#1a2a48');
  bg.addColorStop(0.35, '#0e1c38');
  bg.addColorStop(0.65, '#14284a');
  bg.addColorStop(1, '#091428');
  ctx.fillStyle = bg;
  ctx.fillRect(px - r, py - r, r * 2, r * 2);

  // Cloud bands — drawn on the ring tilt plane so spin matches rings
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(1, ringTilt);
  const spinAngle = t * 0.00015; // planet spin speed
  for (let i = 0; i < 9; i++) {
    const bandAngle = spinAngle + (i / 9) * Math.PI * 2;
    // Band is a short arc segment that wraps around the equator
    const bandR = r * (0.5 + i * 0.055);
    const alpha = 0.04 + Math.sin(t * 0.0006 + i * 1.3) * 0.02;
    ctx.beginPath();
    ctx.arc(0, 0, bandR, bandAngle, bandAngle + 0.6 + i * 0.08);
    ctx.strokeStyle = `rgba(90,130,200,${alpha.toFixed(3)})`;
    ctx.lineWidth = r * 0.06;
    ctx.stroke();
  }
  ctx.restore();

  // Terminator shadow — dark side faces away from star
  const tg = ctx.createLinearGradient(
    px + lightDirX * r * 0.2, py + lightDirY * r * 0.2,
    px - lightDirX * r, py - lightDirY * r
  );
  tg.addColorStop(0, 'transparent');
  tg.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  tg.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = tg;
  ctx.fillRect(px - r, py - r, r * 2, r * 2);

  // Ring shadow on planet
  const shadowY = py - r * ringTilt * 0.3;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(px - r, shadowY - r * 0.08, r * 2, r * 0.16);

  ctx.restore();

  // Rim highlight toward star
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,100,50,0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Front ring
  drawRingHalf(ctx, px, py, r, ringTilt, 0, Math.PI, true);
}

function starfieldFrame(t: number): void {
  if (!running || !starfieldCtx) return;
  const ctx = starfieldCtx;
  ctx.clearRect(0, 0, W, H);

  // Deep space BG
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.max(W, H));
  bg.addColorStop(0, '#090914');
  bg.addColorStop(0.5, '#050510');
  bg.addColorStop(1, '#020208');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Red dwarf position — center of the system
  const sx = W * STAR_POS.cx;
  const sy = H * STAR_POS.cy;

  // Stars — orbit clockwise around red dwarf, tilted 45°, flow top-right → bottom-left
  const viewScale = Math.max(W, H) / 3000;
  const K = 0.7071; // cos(45°) = sin(45°)
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]!;
    const tw = 0.5 + 0.5 * Math.sin(t * 0.001 * s.tw + s.to);
    const a = s.angle - t * s.spd; // clockwise
    const d = s.dist * viewScale;
    const ex = Math.cos(a) * d;
    const ey = Math.sin(a) * d * K;
    const x = sx + ex * K - ey * (-K);
    const y = sy + ex * (-K) + ey * K;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    ctx.globalAlpha = s.a * tw;
    ctx.beginPath();
    ctx.arc(x, y, s.sz * tw, 0, Math.PI * 2);
    ctx.fillStyle = s.col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Draw planet orbiting the (invisible) center point
  drawPlanet(ctx, sx, sy, t);

  starfieldRafId = requestAnimationFrame(starfieldFrame);
}

function particleFrame(t: number): void {
  if (!running || !particleCtx) return;
  const ctx = particleCtx;
  ctx.clearRect(0, 0, W, H);

  const cx = W * STAR_POS.cx;
  const cy = H * STAR_POS.cy;
  const viewScale = Math.max(W, H) / 3000;
  const K = 0.7071;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!;
    const tw = 0.5 + 0.5 * Math.sin(t * 0.001 * p.tw + p.to);
    const a = p.angle - t * p.spd; // clockwise, same as stars
    const d = p.dist * viewScale;
    const ex = Math.cos(a) * d;
    const ey = Math.sin(a) * d * K;
    const x = cx + ex * K - ey * (-K);
    const y = cy + ex * (-K) + ey * K;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const al = p.a * tw;
    // Core
    ctx.beginPath();
    ctx.arc(x, y, p.sz, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${al.toFixed(3)})`;
    ctx.fill();
    // Glow
    ctx.beginPath();
    ctx.arc(x, y, p.sz * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${(al * 0.12).toFixed(4)})`;
    ctx.fill();
  }

  particleRafId = requestAnimationFrame(particleFrame);
}

// --- Public API ---
export function initBackground(): void {
  starfieldCanvas = document.getElementById('starfield-canvas') as HTMLCanvasElement | null;
  particleCanvas = document.getElementById('particle-canvas') as HTMLCanvasElement | null;

  if (starfieldCanvas) {
    starfieldCtx = starfieldCanvas.getContext('2d');
  }
  if (particleCanvas) {
    particleCtx = particleCanvas.getContext('2d');
  }

  createStars();
  createParticles();
  resize();
  window.addEventListener('resize', resize);
}

export function showBackground(): void {
  if (running) return;
  running = true;

  if (starfieldCanvas) starfieldCanvas.style.display = '';
  if (particleCanvas) particleCanvas.style.display = '';

  starfieldRafId = requestAnimationFrame(starfieldFrame);
  particleRafId = requestAnimationFrame(particleFrame);
}

export function hideBackground(): void {
  if (!running) return;
  running = false;

  cancelAnimationFrame(starfieldRafId);
  cancelAnimationFrame(particleRafId);
  starfieldRafId = 0;
  particleRafId = 0;

  if (starfieldCanvas) starfieldCanvas.style.display = 'none';
  if (particleCanvas) particleCanvas.style.display = 'none';
}
