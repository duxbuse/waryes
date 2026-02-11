/**
 * TerrainZoneShader - Injects zone/LOS coloring into the terrain fragment shader
 *
 * Uses material.onBeforeCompile to tint terrain fragments for:
 * - Deployment zones (solid team-colored rectangles with borders)
 * - Capture zone fills (atlas-sampled animated fills)
 * - LOS preview (circular vision preview with blocked shadows)
 *
 * This eliminates floating PlaneGeometry overlays that cause parallax artifacts
 * on hilly terrain, since the coloring becomes part of the terrain surface itself.
 */

import * as THREE from 'three';

const MAX_DEPLOYMENT_ZONES = 8;
const MAX_CAPTURE_ZONES = 8;
const CAPTURE_ATLAS_SLOT_SIZE = 128;
const LOS_TEXTURE_SIZE = 128;
const MAX_LOS_RINGS = 6;

export class TerrainZoneShader {
  // Textures
  private captureAtlas: THREE.DataTexture;
  private losTexture: THREE.DataTexture;

  // Uniform values stored for runtime updates
  private uniforms: {
    numDeploymentZones: { value: number };
    deploymentZoneBounds: { value: Float32Array };
    deploymentZoneColors: { value: Float32Array };
    deploymentZonesVisible: { value: number };

    numCaptureZones: { value: number };
    captureZoneBounds: { value: Float32Array };
    captureZoneBorderColors: { value: Float32Array };
    captureZoneContested: { value: Float32Array };
    captureZoneFillAtlas: { value: THREE.DataTexture };

    losActive: { value: number };
    losCenter: { value: Float32Array };
    losRadius: { value: number };
    losTexture: { value: THREE.DataTexture };
    numLosRings: { value: number };
    losRingRadii: { value: Float32Array };
    losRingColors: { value: Float32Array };

    zoneTime: { value: number };
  };

  constructor() {
    // Create capture zone fill atlas: MAX_CAPTURE_ZONES slots of 128x128, packed horizontally
    const atlasWidth = CAPTURE_ATLAS_SLOT_SIZE * MAX_CAPTURE_ZONES;
    const atlasHeight = CAPTURE_ATLAS_SLOT_SIZE;
    const atlasData = new Uint8Array(atlasWidth * atlasHeight * 4);
    this.captureAtlas = new THREE.DataTexture(
      atlasData, atlasWidth, atlasHeight,
      THREE.RGBAFormat, THREE.UnsignedByteType
    );
    this.captureAtlas.minFilter = THREE.LinearFilter;
    this.captureAtlas.magFilter = THREE.LinearFilter;
    this.captureAtlas.needsUpdate = true;

    // Create LOS texture: 128x128 Cartesian map
    const losData = new Uint8Array(LOS_TEXTURE_SIZE * LOS_TEXTURE_SIZE * 4);
    this.losTexture = new THREE.DataTexture(
      losData, LOS_TEXTURE_SIZE, LOS_TEXTURE_SIZE,
      THREE.RGBAFormat, THREE.UnsignedByteType
    );
    this.losTexture.minFilter = THREE.LinearFilter;
    this.losTexture.magFilter = THREE.LinearFilter;
    this.losTexture.needsUpdate = true;

    // Initialize uniforms
    this.uniforms = {
      numDeploymentZones: { value: 0 },
      deploymentZoneBounds: { value: new Float32Array(MAX_DEPLOYMENT_ZONES * 4) },
      deploymentZoneColors: { value: new Float32Array(MAX_DEPLOYMENT_ZONES * 3) },
      deploymentZonesVisible: { value: 0.0 },

      numCaptureZones: { value: 0 },
      captureZoneBounds: { value: new Float32Array(MAX_CAPTURE_ZONES * 4) },
      captureZoneBorderColors: { value: new Float32Array(MAX_CAPTURE_ZONES * 3) },
      captureZoneContested: { value: new Float32Array(MAX_CAPTURE_ZONES) },
      captureZoneFillAtlas: { value: this.captureAtlas },

      losActive: { value: 0.0 },
      losCenter: { value: new Float32Array(2) },
      losRadius: { value: 50.0 },
      losTexture: { value: this.losTexture },
      numLosRings: { value: 0 },
      losRingRadii: { value: new Float32Array(MAX_LOS_RINGS) },
      losRingColors: { value: new Float32Array(MAX_LOS_RINGS * 3) },

      zoneTime: { value: 0.0 },
    };
  }

  /**
   * Inject zone tinting into the terrain material's shader
   */
  applyToMaterial(material: THREE.MeshStandardMaterial): void {
    const self = this;

    material.onBeforeCompile = (shader) => {
      // Add all uniforms to the shader
      shader.uniforms['numDeploymentZones'] = self.uniforms.numDeploymentZones;
      shader.uniforms['deploymentZoneBounds'] = self.uniforms.deploymentZoneBounds;
      shader.uniforms['deploymentZoneColors'] = self.uniforms.deploymentZoneColors;
      shader.uniforms['deploymentZonesVisible'] = self.uniforms.deploymentZonesVisible;

      shader.uniforms['numCaptureZones'] = self.uniforms.numCaptureZones;
      shader.uniforms['captureZoneBounds'] = self.uniforms.captureZoneBounds;
      shader.uniforms['captureZoneBorderColors'] = self.uniforms.captureZoneBorderColors;
      shader.uniforms['captureZoneContested'] = self.uniforms.captureZoneContested;
      shader.uniforms['captureZoneFillAtlas'] = self.uniforms.captureZoneFillAtlas;

      shader.uniforms['losActive'] = self.uniforms.losActive;
      shader.uniforms['losCenter'] = self.uniforms.losCenter;
      shader.uniforms['losRadius'] = self.uniforms.losRadius;
      shader.uniforms['losTexture'] = self.uniforms.losTexture;
      shader.uniforms['numLosRings'] = self.uniforms.numLosRings;
      shader.uniforms['losRingRadii'] = self.uniforms.losRingRadii;
      shader.uniforms['losRingColors'] = self.uniforms.losRingColors;

      shader.uniforms['zoneTime'] = self.uniforms.zoneTime;

      // --- Vertex shader injection ---
      // Add varying for world position
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `varying vec3 vZoneWorldPos;
void main() {`
      );

      // Compute world position in vertex shader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vZoneWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

      // --- Fragment shader injection ---
      // Add uniforms and varying declarations
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying vec3 vZoneWorldPos;

// Deployment zone uniforms
uniform int numDeploymentZones;
uniform vec4 deploymentZoneBounds[${MAX_DEPLOYMENT_ZONES}];
uniform vec3 deploymentZoneColors[${MAX_DEPLOYMENT_ZONES}];
uniform float deploymentZonesVisible;

// Capture zone uniforms
uniform int numCaptureZones;
uniform vec4 captureZoneBounds[${MAX_CAPTURE_ZONES}];
uniform vec3 captureZoneBorderColors[${MAX_CAPTURE_ZONES}];
uniform float captureZoneContested[${MAX_CAPTURE_ZONES}];
uniform sampler2D captureZoneFillAtlas;

// LOS preview uniforms
uniform float losActive;
uniform vec2 losCenter;
uniform float losRadius;
uniform sampler2D losTexture;
uniform int numLosRings;
uniform float losRingRadii[${MAX_LOS_RINGS}];
uniform vec3 losRingColors[${MAX_LOS_RINGS}];

// Animation
uniform float zoneTime;

void main() {`
      );

      // Inject zone tinting after standard color computation
      // We insert before the final output_fragment include
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `// === Zone tinting ===
{
  vec2 fragXZ = vZoneWorldPos.xz;

  // 1. Deployment zones
  if (deploymentZonesVisible > 0.5) {
    for (int i = 0; i < ${MAX_DEPLOYMENT_ZONES}; i++) {
      if (i >= numDeploymentZones) break;
      vec4 bounds = deploymentZoneBounds[i]; // minX, minZ, maxX, maxZ
      if (fragXZ.x >= bounds.x && fragXZ.x <= bounds.z &&
          fragXZ.y >= bounds.y && fragXZ.y <= bounds.w) {
        // Inside deployment zone
        float edgeDistX = min(fragXZ.x - bounds.x, bounds.z - fragXZ.x);
        float edgeDistZ = min(fragXZ.y - bounds.y, bounds.w - fragXZ.y);
        float edgeDist = min(edgeDistX, edgeDistZ);

        vec3 zoneColor = deploymentZoneColors[i];

        if (edgeDist < 1.5) {
          // Border - stronger tint
          gl_FragColor.rgb = mix(gl_FragColor.rgb, zoneColor, 0.6);
        } else {
          // Fill - lighter tint
          gl_FragColor.rgb = mix(gl_FragColor.rgb, zoneColor, 0.3);
        }
      }
    }
  }

  // 2. Capture zones
  for (int i = 0; i < ${MAX_CAPTURE_ZONES}; i++) {
    if (i >= numCaptureZones) break;
    vec4 bounds = captureZoneBounds[i]; // centerX, centerZ, width, height
    float halfW = bounds.z * 0.5;
    float halfH = bounds.w * 0.5;
    float zMinX = bounds.x - halfW;
    float zMaxX = bounds.x + halfW;
    float zMinZ = bounds.y - halfH;
    float zMaxZ = bounds.y + halfH;

    if (fragXZ.x >= zMinX && fragXZ.x <= zMaxX &&
        fragXZ.y >= zMinZ && fragXZ.y <= zMaxZ) {
      // Compute UV into atlas slot
      float u = (fragXZ.x - zMinX) / bounds.z;
      float v = (fragXZ.y - zMinZ) / bounds.w;

      // Atlas UV: slot i occupies [i/N .. (i+1)/N] in x, full y
      float atlasU = (float(i) + u) / ${MAX_CAPTURE_ZONES}.0;
      vec4 fillSample = texture2D(captureZoneFillAtlas, vec2(atlasU, v));

      // Blend fill color onto terrain
      if (fillSample.a > 0.01) {
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fillSample.rgb, fillSample.a * 0.6);
      }

      // Border
      float edgeDistX = min(fragXZ.x - zMinX, zMaxX - fragXZ.x);
      float edgeDistZ = min(fragXZ.y - zMinZ, zMaxZ - fragXZ.y);
      float edgeDist = min(edgeDistX, edgeDistZ);
      vec3 borderColor = captureZoneBorderColors[i];

      if (edgeDist < 1.0) {
        float borderAlpha = 0.6;
        // Contested pulsing
        if (captureZoneContested[i] > 0.5) {
          borderAlpha = 0.5 + 0.5 * sin(zoneTime * 3.0 * 3.14159 * 2.0);
        }
        float borderBlend = (1.0 - edgeDist) * borderAlpha;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, borderColor, borderBlend);
      }
    }
  }

  // 3. LOS preview
  if (losActive > 0.5) {
    float dist = distance(fragXZ, losCenter);
    float ringMargin = 2.0;
    if (dist < losRadius + ringMargin) {
      // Compute UV into LOS texture (Cartesian mapping)
      vec2 offset = fragXZ - losCenter;
      vec2 losUV = offset / losRadius * 0.5 + 0.5;

      if (dist < losRadius) {
        vec4 losSample = texture2D(losTexture, losUV);
        if (losSample.a > 0.01) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, losSample.rgb, losSample.a * 0.5);
        }
      }

      // Smooth outer border ring
      float outerRingDist = abs(dist - losRadius);
      float outerRingAlpha = smoothstep(1.5, 0.0, outerRingDist) * 0.5;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.29, 0.62, 1.0), outerRingAlpha);

      // Smooth optics threshold rings (GPU-rendered for anti-aliasing)
      for (int i = 0; i < ${MAX_LOS_RINGS}; i++) {
        if (i >= numLosRings) break;
        float rDist = abs(dist - losRingRadii[i]);
        float rAlpha = smoothstep(1.5, 0.0, rDist) * 0.7;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, losRingColors[i], rAlpha);
      }
    }
  }
}
#include <dithering_fragment>`
      );
    };

    // Force material recompilation
    material.needsUpdate = true;
  }

  // --- Deployment zones ---

  setDeploymentZones(zones: { minX: number; minZ: number; maxX: number; maxZ: number; team: 'player' | 'enemy' }[]): void {
    const count = Math.min(zones.length, MAX_DEPLOYMENT_ZONES);
    this.uniforms.numDeploymentZones.value = count;

    const bounds = this.uniforms.deploymentZoneBounds.value;
    const colors = this.uniforms.deploymentZoneColors.value;

    for (let i = 0; i < count; i++) {
      const z = zones[i]!;
      const base4 = i * 4;
      bounds[base4] = z.minX;
      bounds[base4 + 1] = z.minZ;
      bounds[base4 + 2] = z.maxX;
      bounds[base4 + 3] = z.maxZ;

      const base3 = i * 3;
      if (z.team === 'player') {
        // Blue: #4a9eff
        colors[base3] = 0.29;
        colors[base3 + 1] = 0.62;
        colors[base3 + 2] = 1.0;
      } else {
        // Red: #ff4a4a
        colors[base3] = 1.0;
        colors[base3 + 1] = 0.29;
        colors[base3 + 2] = 0.29;
      }
    }

    this.uniforms.deploymentZonesVisible.value = 1.0;
  }

  setDeploymentVisible(visible: boolean): void {
    this.uniforms.deploymentZonesVisible.value = visible ? 1.0 : 0.0;
  }

  // --- Capture zones ---

  setCaptureZones(zones: { id: string; x: number; z: number; width: number; height: number }[]): void {
    const count = Math.min(zones.length, MAX_CAPTURE_ZONES);
    this.uniforms.numCaptureZones.value = count;

    const bounds = this.uniforms.captureZoneBounds.value;
    const borderColors = this.uniforms.captureZoneBorderColors.value;
    const contested = this.uniforms.captureZoneContested.value;

    for (let i = 0; i < count; i++) {
      const z = zones[i]!;
      const base4 = i * 4;
      bounds[base4] = z.x;      // centerX
      bounds[base4 + 1] = z.z;  // centerZ
      bounds[base4 + 2] = z.width;
      bounds[base4 + 3] = z.height;

      // Default border: white
      const base3 = i * 3;
      borderColors[base3] = 1.0;
      borderColors[base3 + 1] = 1.0;
      borderColors[base3 + 2] = 1.0;

      contested[i] = 0.0;
    }
  }

  updateCaptureBorderColor(index: number, color: THREE.Color): void {
    if (index < 0 || index >= MAX_CAPTURE_ZONES) return;
    const base3 = index * 3;
    const colors = this.uniforms.captureZoneBorderColors.value;
    colors[base3] = color.r;
    colors[base3 + 1] = color.g;
    colors[base3 + 2] = color.b;
  }

  updateCaptureContested(index: number, contested: boolean): void {
    if (index < 0 || index >= MAX_CAPTURE_ZONES) return;
    this.uniforms.captureZoneContested.value[index] = contested ? 1.0 : 0.0;
  }

  updateFillAtlasSlot(index: number, pixelData: Uint8Array): void {
    if (index < 0 || index >= MAX_CAPTURE_ZONES) return;

    const atlasData = this.captureAtlas.image.data as Uint8Array;
    const atlasWidth = CAPTURE_ATLAS_SLOT_SIZE * MAX_CAPTURE_ZONES;
    const slotOffsetX = index * CAPTURE_ATLAS_SLOT_SIZE;

    // Copy pixel rows into the atlas at the correct slot position
    for (let y = 0; y < CAPTURE_ATLAS_SLOT_SIZE; y++) {
      const srcOffset = y * CAPTURE_ATLAS_SLOT_SIZE * 4;
      const dstOffset = (y * atlasWidth + slotOffsetX) * 4;
      for (let x = 0; x < CAPTURE_ATLAS_SLOT_SIZE * 4; x++) {
        atlasData[dstOffset + x] = pixelData[srcOffset + x]!;
      }
    }

    this.captureAtlas.needsUpdate = true;
  }

  // --- LOS preview ---

  setLOS(active: boolean, centerX?: number, centerZ?: number, radius?: number, textureData?: Uint8Array): void {
    this.uniforms.losActive.value = active ? 1.0 : 0.0;

    if (active && centerX !== undefined && centerZ !== undefined) {
      this.uniforms.losCenter.value[0] = centerX;
      this.uniforms.losCenter.value[1] = centerZ;
    }

    if (radius !== undefined) {
      this.uniforms.losRadius.value = radius;
    }

    if (textureData) {
      const losData = this.losTexture.image.data as Uint8Array;
      losData.set(textureData);
      this.losTexture.needsUpdate = true;
    }

    if (!active) {
      this.uniforms.numLosRings.value = 0;
    }
  }

  /**
   * Set optics threshold rings (rendered smoothly by the GPU shader)
   * Each ring has a world-space radius and RGB color (0-1 range)
   */
  setLOSRings(rings: Array<{ radius: number; r: number; g: number; b: number }>): void {
    const count = Math.min(rings.length, MAX_LOS_RINGS);
    this.uniforms.numLosRings.value = count;

    const radii = this.uniforms.losRingRadii.value;
    const colors = this.uniforms.losRingColors.value;

    for (let i = 0; i < count; i++) {
      const ring = rings[i]!;
      radii[i] = ring.radius;
      const base3 = i * 3;
      colors[base3] = ring.r;
      colors[base3 + 1] = ring.g;
      colors[base3 + 2] = ring.b;
    }
  }

  // --- Animation ---

  setTime(t: number): void {
    this.uniforms.zoneTime.value = t;
  }

  // --- Capture zone index lookup ---

  getCaptureZoneIndex(zoneId: string, zoneIds: string[]): number {
    return zoneIds.indexOf(zoneId);
  }

  // --- Cleanup ---

  dispose(): void {
    this.captureAtlas.dispose();
    this.losTexture.dispose();
  }
}
