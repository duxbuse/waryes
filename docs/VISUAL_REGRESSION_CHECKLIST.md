# Visual Regression Testing Checklist
## Subtask 6-2: Full Visual Regression Testing

**Goal:** Verify all visual improvements are present, working correctly, and the game looks noticeably better.

---

## Quick Start

```bash
cd web
bun run dev
```

Then open `http://localhost:5173` in your browser.

---

## 🎯 Visual Improvements to Verify

### ✅ Phase 1: Terrain Rendering

#### 1. Terrain Normal Maps
- [ ] Terrain surface has subtle depth and texture detail
- [ ] Lighting on terrain looks more realistic (not flat)
- [ ] Shadows on terrain show surface detail
- [ ] **Visual test:** Look at hillsides in angled light - should see subtle bumps

#### 2. Water Animation & Rendering
- [ ] Water surfaces have visible wave animation
- [ ] Waves move smoothly and continuously (no stuttering)
- [ ] Water has Fresnel reflections (view-dependent brightness)
- [ ] Shimmer and specular highlights visible on water
- [ ] **Visual test:** Rotate camera around water - reflections should change

---

### ✅ Phase 2: Enhanced Visual Effects

#### 3. Enhanced Explosions
- [ ] Explosions have multiple visual components:
  - [ ] Bright flash (white/yellow)
  - [ ] Fireball (orange/red expanding sphere)
  - [ ] 3-5 smoke plumes rising and rotating
  - [ ] Debris particles (for large explosions)
- [ ] Particles have realistic physics (rising, fading, rotating)
- [ ] **Visual test:** Watch a tank battle - explosions should look dramatic

#### 4. Enhanced Smoke Effects
- [ ] Smoke puffs use 2-3 particles with varied colors
- [ ] Smoke rises and expands naturally
- [ ] Smoke particles rotate as they fade
- [ ] **Visual test:** Smoke should look like real smoke clouds, not flat sprites

#### 5. Projectile Tracers
- [ ] Bullets/shells show visible trailing lines
- [ ] Tracers are color-coded: Blue (player), Red (enemy)
- [ ] Tracers trail 15 meters behind projectiles
- [ ] Tracers disappear when projectile hits/misses
- [ ] **Visual test:** Order infantry to fire - should see blue tracer lines

#### 6. Muzzle Flash Lights
- [ ] Brief orange point light appears when units fire
- [ ] Light illuminates nearby terrain and units
- [ ] Light fades out quickly (~120ms)
- [ ] Max 15 lights active at once (performance limit)
- [ ] **Visual test:** Heavy combat at night should show flash lights

---

### ✅ Phase 3: Path Visualization

#### 7. Waypoint Path Lines
- [ ] Selected units show movement path as terrain-following ribbon
- [ ] Waypoints marked with 3D spheres (not flat circles)
- [ ] Paths update immediately when new orders given
- [ ] Multi-waypoint paths work (Shift+Right-Click)
- [ ] Path fades out after unit reaches destination
- [ ] **Visual test:** Right-click to move - should see green path ribbon

#### 8. Attack Range Indicators
- [ ] Selected units show weapon range circles on ground
- [ ] Circles are color-coded:
  - [ ] Red = ground attack weapons
  - [ ] Blue = anti-air weapons
  - [ ] Purple = dual-purpose weapons
- [ ] Range circles visible but subtle (50% opacity)
- [ ] Multiple range circles for units with multiple weapons
- [ ] **Visual test:** Select a tank - should see red circle showing gun range

---

### ✅ Phase 4: Enhanced Lighting & Shadows

#### 9. Enhanced Scene Lighting
- [ ] Scene has better contrast (deeper shadows, brighter highlights)
- [ ] Units have subtle ambient occlusion effect (darker recesses)
- [ ] Three-point lighting visible:
  - [ ] Main sun light (warm, bright, casts shadows)
  - [ ] Fill light (cool, softer, no shadows)
  - [ ] Rim/back light (highlights edges, no shadows)
- [ ] Sky/ground gradient creates natural light falloff
- [ ] **Visual test:** Units should have depth and definition, not flat

#### 10. Improved Shadow Quality
- [ ] Shadows have smooth, soft edges (no jagged pixelation)
- [ ] PCF soft shadows enabled
- [ ] Shadow coverage extends appropriately across terrain
- [ ] No shadow acne (dark spots on surfaces)
- [ ] No peter-panning (units floating above shadows)
- [ ] **Visual test:** Look at unit shadows - edges should be slightly blurred

---

### ✅ Phase 5: Enhanced Unit Visual Feedback

#### 11. Glowing Selection Rings
- [ ] Selected units have glowing selection rings
- [ ] Rings pulse smoothly (emissive intensity oscillates)
- [ ] Units pulse at different rates (not in perfect sync)
- [ ] Glow effect is visible and attractive
- [ ] **Visual test:** Select multiple units - rings should pulse independently

#### 12. Health/Morale Bar Color Gradients
- [ ] Health bars show smooth gradients:
  - [ ] 100% = bright green
  - [ ] 50% = yellow
  - [ ] 0% = red
  - [ ] No harsh color jumps at thresholds
- [ ] Morale bars show smooth gradients:
  - [ ] 100% = bright blue
  - [ ] 50% = cyan
  - [ ] 0% = orange/amber
- [ ] Bars always visible and readable
- [ ] **Visual test:** Damage a unit - health bar should smoothly change color

---

## 🎮 Full Match Cycle Test

Complete a full game cycle to test all improvements together:

### 1. Main Menu Screen
- [ ] Main menu renders correctly
- [ ] No console errors on startup
- [ ] UI is responsive

### 2. Deck Builder
- [ ] Deck builder loads without errors
- [ ] Can select division and build deck
- [ ] Unit cards display correctly

### 3. Skirmish Setup
- [ ] Can configure match settings
- [ ] Map preview works
- [ ] Start game button functional

### 4. Deployment Phase
- [ ] Units can be deployed
- [ ] **Check:** Selection rings glow when selected
- [ ] **Check:** Attack range indicators show weapon ranges
- [ ] **Check:** Path visualization works when moving units
- [ ] FPS overlay shows 60 FPS

### 5. Battle Phase (Main Testing Area)

**Camera Movement:**
- [ ] Fly around map - terrain normal maps visible
- [ ] Find water - wave animation working
- [ ] Check lighting from different angles

**Unit Combat:**
- [ ] Select units - glowing rings pulse smoothly
- [ ] Give move orders - path ribbons with sphere waypoints
- [ ] Engage enemy - observe:
  - [ ] Projectile tracers (blue for your units)
  - [ ] Muzzle flash lights illuminate units
  - [ ] Explosions with particles (flash, fireball, smoke, debris)
  - [ ] Smoke effects rising and rotating
- [ ] Take damage - health bars change color smoothly
- [ ] Units lose morale - morale bars transition through gradient

**Performance:**
- [ ] FPS overlay stays at 60 throughout battle
- [ ] No stuttering or frame drops
- [ ] Smooth animation of all effects

### 6. Extended Play (5+ Minutes)
- [ ] Play for 5+ minutes continuously
- [ ] FPS remains at 60
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] No console errors accumulate
- [ ] All effects continue working correctly

---

## 🐛 Visual Glitch Checklist

Check for common rendering issues:

- [ ] **No Z-fighting:** Overlapping surfaces don't flicker
- [ ] **No flickering:** Effects appear/disappear cleanly
- [ ] **No visual artifacts:** No strange shapes or colors
- [ ] **No texture issues:** All materials load correctly
- [ ] **No performance degradation:** FPS stable over time
- [ ] **No memory leaks:** Memory usage stabilizes
- [ ] **No console errors:** Developer console clean

---

## 📊 Performance Monitoring

While testing, monitor these metrics:

### FPS Overlay (Top-Right Corner)
- [ ] Shows 60 FPS consistently
- [ ] Minor drops to 58-59 acceptable during heavy combat
- [ ] Should never drop below 55 FPS

### Browser DevTools Console (F12)
- [ ] No errors (red messages)
- [ ] No warnings about performance
- [ ] No WebGL context loss

### Browser DevTools Performance Tab (Optional)
- [ ] Frame times ≤16.67ms (60 FPS)
- [ ] No long frames (>30ms = yellow/red)
- [ ] No excessive garbage collection

---

## ✅ Final Verification

Before marking complete, confirm:

- [ ] **All 11 visual improvements verified and working**
- [ ] **Game looks noticeably better than before**
- [ ] **No visual glitches or rendering artifacts**
- [ ] **FPS stays at 60 throughout gameplay**
- [ ] **No console errors during testing**
- [ ] **Completed full match cycle (menu → deck → deployment → battle)**
- [ ] **Played for 5+ minutes without issues**

---

## 📝 Test Results Template

```
VISUAL REGRESSION TEST RESULTS
===============================
Date: [TODAY'S DATE]
Browser: [Chrome/Firefox + Version]
Hardware: [CPU/GPU if known]

VISUAL IMPROVEMENTS:
✅/❌ Terrain normal maps
✅/❌ Water wave animation
✅/❌ Enhanced explosions
✅/❌ Enhanced smoke effects
✅/❌ Projectile tracers
✅/❌ Muzzle flash lights
✅/❌ Waypoint path visualization
✅/❌ Attack range indicators
✅/❌ Enhanced lighting (3-point)
✅/❌ Improved shadow quality
✅/❌ Glowing selection rings
✅/❌ Health/morale bar gradients

PERFORMANCE:
- FPS: [Consistent 60 / Occasional drops / Poor]
- Stuttering: [None / Rare / Frequent]
- Memory: [Stable / Growing / Leak detected]

VISUAL GLITCHES:
- [List any issues found, or "None"]

CONSOLE ERRORS:
- [List any errors, or "None"]

OVERALL IMPRESSION:
- Game looks: [Much better / Slightly better / Same / Worse]
- Visual quality: [Professional / Good / Acceptable / Poor]
- Ready to ship: [YES / NO - needs fixes]

OVERALL RESULT: ✅ PASS / ❌ FAIL

Notes:
[Any additional observations]
```

---

## 🚀 Next Steps After Verification

### If ALL Tests Pass ✅
1. Record test results in this document
2. Update `implementation_plan.json` - mark subtask-6-2 as "completed"
3. Update `build-progress.txt` with "Visual regression testing: PASS"
4. Commit changes:
   ```bash
   git add .
   git commit -m "auto-claude: subtask-6-2 - Full visual regression testing - verify game looks better"
   ```
5. Feature complete! 🎉

### If ANY Tests Fail ❌
1. Document specific failures in test results
2. Identify which visual improvement is broken
3. Check relevant subtask implementation
4. Fix the issue
5. Re-run visual regression testing
6. Do NOT proceed until all checks pass

---

## 🔍 Troubleshooting

### Issue: Can't see visual improvements
- Check if you're on the correct git branch
- Verify all previous subtasks marked "completed"
- Clear browser cache (Ctrl+Shift+R)
- Check console for loading errors

### Issue: FPS below 60
- See PERFORMANCE_VERIFICATION_GUIDE.md for detailed troubleshooting
- Run `game.benchmarkManager.startBenchmark()` for metrics
- Check Chrome DevTools Performance tab

### Issue: Visual glitches
- Take screenshot of issue
- Check console for errors
- Note when glitch occurs (specific action/timing)
- Document in test results

---

## 📚 Reference Documents

- **Performance Guide:** `./.auto-claude/specs/018-improved-visuals/PERFORMANCE_VERIFICATION_GUIDE.md`
- **Implementation Plan:** `./.auto-claude/specs/018-improved-visuals/implementation_plan.json`
- **Project Guidelines:** `web/CLAUDE.md`
- **Spec:** `./.auto-claude/specs/018-improved-visuals/spec.md`

---

**Remember:** This is the final visual quality check. Take your time and thoroughly test each improvement. The goal is to ship visually impressive, performant gameplay! 🎯
