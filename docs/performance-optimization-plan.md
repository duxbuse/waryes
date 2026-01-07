# Performance Optimization Plan

## Executive Summary

This document outlines GPU and CPU performance optimization strategies for the Waryes RTS game. The goal is to improve frame rates and reduce draw calls while **maintaining visual quality** - shadows, antialiasing, and overall aesthetics remain priorities.

---

## Current Architecture Analysis

### Renderer Configuration
```typescript
// Current setup in Game.ts
WebGLRenderer({
  antialias: true,      // Hardware MSAA
  alpha: false,
  stencil: true         // For capture circle overlap
})
shadowMap.type = PCFSoftShadowMap  // Soft shadows
shadowMap.size = 2048x2048         // High quality
pixelRatio = min(devicePixelRatio, 2)
```

### Identified Bottlenecks (Priority Order)

| Issue | Severity | Draw Call Impact |
|-------|----------|------------------|
| Units not instanced | Critical | 3+ calls per unit |
| Frustum culling disabled | High | All units always rendered |
| Per-effect texture creation | Medium | Memory/GC pressure |
| No object pooling | Medium | Allocation overhead |
| Smoke uses sphere geometry | Medium | High poly count |
| Per-unit materials | Medium | No batching possible |

---

## Optimization Strategies

### 1. Unit Instancing

**Current:** Each unit is a separate `THREE.Group` with body mesh, wireframe, and selection ring (3+ draw calls per unit).

**Proposed:** Use `THREE.InstancedMesh` to render all units of the same type in a single draw call.

| Pros | Cons |
|------|------|
| Massive draw call reduction (100 units → 1 call) | More complex code architecture |
| GPU handles instance transforms efficiently | Per-instance colors require custom shaders or instanced attributes |
| Scales to thousands of units | Selection highlighting needs different approach |
| Industry standard for RTS games | Wireframe effect harder to achieve |

**Implementation Complexity:** High
**Performance Gain:** Very High (potentially 10-50x fewer draw calls for units)
**Visual Impact:** Neutral (can look identical)

**Technical Approach:**
```typescript
// Create instanced mesh for each unit category
const tankGeometry = new THREE.BoxGeometry(3, 1.5, 4);
const tankMaterial = new THREE.MeshStandardMaterial();
const tankInstances = new THREE.InstancedMesh(tankGeometry, tankMaterial, MAX_TANKS);

// Per-instance color via instanced attribute
tankInstances.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

// Update transforms per frame
units.forEach((unit, i) => {
  matrix.compose(unit.position, unit.quaternion, unit.scale);
  tankInstances.setMatrixAt(i, matrix);
});
tankInstances.instanceMatrix.needsUpdate = true;
```

---

### 2. Re-enable Frustum Culling

**Current:** `frustumCulled = false` on all units (Line 176, Unit.ts)

**Proposed:** Fix the underlying issue and re-enable frustum culling.

| Pros | Cons |
|------|------|
| Units off-screen skip rendering entirely | Need to investigate why it was disabled |
| No GPU cost for non-visible units | May cause visual glitches if not properly bounded |
| Built-in Three.js feature (free) | Bounding spheres must be accurate |
| Works with existing code | Edge cases with large units |

**Implementation Complexity:** Low-Medium
**Performance Gain:** Medium-High (depends on camera zoom/view)
**Visual Impact:** None if done correctly

**Investigation Needed:**
- Why was culling disabled originally?
- Are unit bounding boxes correct?
- Do any effects extend beyond unit bounds?

---

### 3. Level of Detail (LOD) System

**Current:** Full geometry detail at all distances.

**Proposed:** Implement `THREE.LOD` to swap geometry based on camera distance.

| Pros | Cons |
|------|------|
| Distant units use fewer polygons | Multiple geometries per unit type |
| Smooth transitions possible | More memory for LOD variants |
| Significant fill rate savings | Adds complexity to unit system |
| Can simplify/remove wireframes at distance | Pop-in may be noticeable |

**Implementation Complexity:** Medium
**Performance Gain:** Medium
**Visual Impact:** Slight (distant units simpler, usually unnoticeable)

**LOD Levels Recommendation:**
```
Level 0 (0-50m):   Full detail + wireframe
Level 1 (50-150m): Simplified geometry, no wireframe
Level 2 (150m+):   Billboard sprite or very simple box
```

---

### 4. Shadow Optimization (Quality Preserved)

**Current:** 2048x2048 PCFSoftShadowMap for all map sizes ≤1000.

**Proposed:** Cascaded Shadow Maps (CSM) or optimized single shadow map.

| Pros | Cons |
|------|------|
| Better shadow quality near camera | More complex setup |
| Efficient use of shadow resolution | Three.js CSM requires addon |
| Industry standard for large scenes | Multiple shadow passes |
| Keeps soft shadow aesthetic | Tuning required |

**Alternative - Shadow Map Tweaks (Simpler):**

| Option | Pros | Cons |
|--------|------|------|
| Reduce to 1024x1024 | 4x less shadow memory/bandwidth | Slightly softer shadows |
| Use PCFShadowMap | Faster than soft variant | Harder shadow edges |
| Tighter shadow camera | Better resolution usage | May clip distant shadows |
| Shadow camera follows player | Always sharp near action | Implementation complexity |

**Implementation Complexity:** Low (tweaks) to High (CSM)
**Performance Gain:** Low-Medium
**Visual Impact:** Minimal with proper tuning

**Recommended Shadow Settings:**
```typescript
// Balanced quality/performance
light.shadow.mapSize.set(1536, 1536);  // Compromise size
light.shadow.camera.near = 20;          // Tighter near plane
light.shadow.camera.far = 200;          // Tighter far plane
light.shadow.bias = -0.0005;            // Reduce shadow acne
renderer.shadowMap.type = THREE.PCFShadowMap; // Faster, still acceptable
```

---

### 5. Object Pooling for Effects

**Current:** Creates new Canvas + Texture for every damage number, explosion, muzzle flash.

**Proposed:** Pre-allocate pools of reusable sprites and textures.

| Pros | Cons |
|------|------|
| Eliminates GC spikes | Higher initial memory usage |
| Consistent frame times | Pool size must be estimated |
| Reuses GPU resources | More complex lifecycle management |
| Industry standard practice | Need to handle pool exhaustion |

**Implementation Complexity:** Medium
**Performance Gain:** Medium (smooths frame times)
**Visual Impact:** None

**Pool Architecture:**
```typescript
class EffectPool<T> {
  private available: T[] = [];
  private active: Set<T> = new Set();

  acquire(): T | null {
    const item = this.available.pop();
    if (item) this.active.add(item);
    return item ?? null;
  }

  release(item: T): void {
    this.active.delete(item);
    this.available.push(item);
  }
}

// Pre-create 50 damage number sprites
const damagePool = new EffectPool<THREE.Sprite>();
for (let i = 0; i < 50; i++) {
  damagePool.release(createDamageSprite());
}
```

---

### 6. Sprite-Based Smoke Replacement

**Current:** Smoke clouds use `SphereGeometry(radius, 16, 16)` - 512 triangles each.

**Proposed:** Replace with billboard sprites using gradient textures.

| Pros | Cons |
|------|------|
| 2 triangles vs 512 per smoke | Less volumetric look |
| Can animate texture | Always faces camera |
| Much faster to render | May look flat at certain angles |
| Multiple sprites can fake volume | Sorting issues with transparency |

**Implementation Complexity:** Low-Medium
**Performance Gain:** Medium (especially with many smoke clouds)
**Visual Impact:** Different aesthetic (can be improved with multiple layered sprites)

**Hybrid Approach (Best of Both):**
```typescript
// Use 3-4 intersecting planes instead of sphere
const smokeGroup = new THREE.Group();
for (let i = 0; i < 3; i++) {
  const plane = new THREE.Mesh(planeGeometry, smokeMaterial);
  plane.rotation.y = (i * Math.PI) / 3;
  smokeGroup.add(plane);
}
// Result: 6 triangles, looks volumetric from any angle
```

---

### 7. Material Sharing & Batching

**Current:** Each unit creates its own material instance.

**Proposed:** Share materials across units of the same team/type.

| Pros | Cons |
|------|------|
| Enables automatic batching | Can't change individual unit colors easily |
| Reduces memory usage | Requires instancing for per-unit variation |
| Faster material uploads | Need separate materials per team |
| Cleaner architecture | Selection highlighting needs different approach |

**Implementation Complexity:** Low
**Performance Gain:** Low-Medium
**Visual Impact:** None

**Implementation:**
```typescript
// Shared materials (create once)
const MATERIALS = {
  player: {
    tank: new THREE.MeshStandardMaterial({ color: 0x4488ff }),
    infantry: new THREE.MeshStandardMaterial({ color: 0x44ff88 }),
  },
  enemy: {
    tank: new THREE.MeshStandardMaterial({ color: 0xff4444 }),
    infantry: new THREE.MeshStandardMaterial({ color: 0xff8844 }),
  }
};

// Use shared material
const mesh = new THREE.Mesh(geometry, MATERIALS[team][type]);
```

---

### 8. Texture Atlas for UI Elements

**Current:** Separate canvas textures for health bars, morale bars, unit labels.

**Proposed:** Single texture atlas with UV mapping.

| Pros | Cons |
|------|------|
| Single texture bind for all UI | More complex UV management |
| Better GPU cache utilization | Dynamic text harder |
| Reduces texture state changes | Need to pack efficiently |
| Standard optimization technique | Regeneration affects all |

**Implementation Complexity:** Medium-High
**Performance Gain:** Low-Medium
**Visual Impact:** None

---

### 9. Compute Shader for Unit Updates (Advanced)

**Current:** CPU updates all unit positions, then uploads to GPU.

**Proposed:** Use WebGL2 transform feedback or WebGPU compute shaders.

| Pros | Cons |
|------|------|
| Massively parallel updates | WebGPU not widely supported yet |
| GPU stays busy | Complex architecture change |
| Scales to 10,000+ units | Harder to debug |
| Future-proof approach | Requires renderer rewrite |

**Implementation Complexity:** Very High
**Performance Gain:** Very High (for large unit counts)
**Visual Impact:** None

**Recommendation:** Defer until other optimizations exhausted or WebGPU matures.

---

### 10. Renderer Settings Fine-Tuning

**Options that preserve quality:**

| Setting | Current | Recommended | Impact |
|---------|---------|-------------|--------|
| pixelRatio | min(dpr, 2) | min(dpr, 1.5) | 30% fewer pixels on retina |
| powerPreference | default | "high-performance" | Request discrete GPU |
| stencil | true | true (needed) | Keep for zone overlaps |
| depth | true | true | Required |
| logarithmicDepthBuffer | false | false | Keep (adds overhead) |

```typescript
new THREE.WebGLRenderer({
  canvas,
  antialias: true,  // Keep for quality
  alpha: false,
  stencil: true,
  powerPreference: "high-performance",  // Add this
  precision: "highp",  // Explicit precision
})
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)
Low effort, immediate gains:

1. **Add `powerPreference: "high-performance"`** to renderer
2. **Reduce pixel ratio cap** from 2 to 1.5
3. **Investigate and fix frustum culling** issue
4. **Share materials** across same-team units
5. **Optimize shadow camera bounds** to fit actual play area

**Expected Gain:** 20-40% improvement

### Phase 2: Medium Effort (3-5 days)
Moderate refactoring:

1. **Implement object pooling** for damage numbers and effects
2. **Replace sphere smoke with sprite billboards**
3. **Add basic LOD** (wireframe removal at distance)
4. **Optimize shadow map size** based on camera zoom

**Expected Gain:** Additional 20-30% improvement

### Phase 3: Major Refactoring (1-2 weeks)
Significant architecture changes:

1. **Implement unit instancing** system
2. **Full LOD system** with geometry swapping
3. **Texture atlasing** for UI elements
4. **Cascaded shadow maps** (optional)

**Expected Gain:** 50-200% improvement (especially with many units)

---

## Benchmarking Strategy

### Metrics to Track
```typescript
// Add to FPS overlay
renderer.info.render.calls      // Draw calls
renderer.info.render.triangles  // Triangle count
renderer.info.memory.geometries // Geometry count
renderer.info.memory.textures   // Texture count
```

### Test Scenarios
1. **Idle:** 50 units, camera stationary
2. **Combat:** 100 units fighting, effects active
3. **Stress:** 200+ units, smoke clouds, all effects
4. **Zoom out:** Maximum camera distance, all units visible

### Target Metrics
| Scenario | Current (est.) | Target |
|----------|----------------|--------|
| Draw calls (50 units) | ~200 | <50 |
| Draw calls (200 units) | ~800 | <100 |
| Frame time | Variable | <16ms (60fps) |
| Memory (textures) | Growing | Stable |

---

## Recommendations Summary

### Must Do (High Impact, Preserves Quality)
1. Fix frustum culling
2. Object pooling for effects
3. Material sharing
4. Shadow camera optimization

### Should Do (Good ROI)
1. Unit instancing (biggest single gain)
2. Sprite-based smoke
3. Basic LOD for wireframes

### Consider (Diminishing Returns)
1. Texture atlasing
2. Cascaded shadows
3. Compute shaders

### Avoid (Hurts Quality)
1. ~~Disabling shadows~~
2. ~~Disabling antialiasing~~
3. ~~Reducing shadow map below 1024~~

---

## Appendix: Three.js Performance Tips

### Do
- Use `BufferGeometry` (already doing this)
- Merge static geometries where possible
- Use `InstancedMesh` for repeated objects
- Dispose of unused geometries/materials/textures
- Use `Object3D.visible = false` instead of removing

### Don't
- Create geometries/materials in render loop
- Use `Geometry` (deprecated, use `BufferGeometry`)
- Forget to call `.dispose()` on removed objects
- Update `instanceMatrix.needsUpdate` without changes
- Use transparency without `depthWrite: false` on overlapping

---

*Document created: Performance optimization planning for Waryes RTS*
*Last updated: Initial version*
