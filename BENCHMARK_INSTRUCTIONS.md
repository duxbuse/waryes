# Performance Benchmark Instructions

## Task: subtask-3-3 - Run Performance Benchmark

This document provides step-by-step instructions for running the performance benchmark to verify the pooled sprite optimization maintains 60 FPS.

---

## Prerequisites

✅ All implementation complete (Phases 1 & 2)
✅ Visual effects refactored to use sprite pooling
✅ Dev server compiles successfully
✅ BenchmarkManager exists at: `web/src/game/debug/BenchmarkManager.ts`

---

## Quick Start (5 minutes)

### Step 1: Start Development Server
```bash
cd web
bun run dev
```

**Expected Output:**
```
  VITE v5.x.x  ready in XXXms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 2: Open Browser
1. Navigate to: **http://localhost:5173**
2. Wait for game to load to main menu
3. Press **F12** to open Developer Console

### Step 3: Run Benchmark
In the browser console, type:
```javascript
game.benchmarkManager.startBenchmark()
```

Press **Enter**

### Step 4: Wait (DO NOT INTERACT)
- **Duration:** 30 seconds
- **Do NOT:** Click, move camera, or interact with the game
- **Watch:** On-screen overlay will show benchmark progress
- The benchmark will:
  - Spawn 100 units (50 per team)
  - Simulate combat for 30 seconds
  - Measure FPS every 0.5 seconds

### Step 5: Review Results
After 30 seconds, results will appear on screen showing:
- **Minimum FPS**
- **Average FPS**
- **Maximum FPS**
- **Frame count**

---

## Acceptance Criteria

The benchmark **PASSES** if:

✅ **Minimum FPS:** > 55 FPS
✅ **Average FPS:** ≈ 60 FPS (within 58-60 range)
✅ **Maximum Variance:** < 10 FPS difference between min and max
✅ **No Console Errors:** No JavaScript errors during benchmark
✅ **Smooth Playback:** No visible stuttering or frame drops

---

## Expected Results

### Before Optimization (Baseline)
- Per-frame texture allocation causes GC pauses
- FPS may dip to 50-55 during heavy combat
- Memory allocation spikes visible in profiler
- Inconsistent frame times

### After Optimization (Current Implementation)
- Sprite pooling eliminates per-frame allocation
- Consistent 60 FPS maintained
- Smoother frame times (no GC pauses)
- Reduced memory pressure
- Better performance with 100+ units

---

## Troubleshooting

### Problem: "game.benchmarkManager is undefined"
**Solution:** Wait for game to fully initialize. The `game` object is available globally after main menu loads.

### Problem: FPS below 55
**Possible Causes:**
1. Browser DevTools open (performance tab causes overhead)
2. Other tabs/applications consuming resources
3. Integrated GPU (switch to dedicated GPU if available)
4. Browser hardware acceleration disabled

**Actions:**
1. Close unnecessary tabs
2. Close DevTools Performance tab (keep Console open only)
3. Re-run benchmark
4. If still failing, investigate with Chrome DevTools Performance profiler

### Problem: Benchmark doesn't start
**Solution:** Check browser console for errors. Ensure game loaded successfully to main menu.

---

## Recording Results

After benchmark completes, record in `build-progress.txt`:

```markdown
#### subtask-3-3: Run performance benchmark ✅ COMPLETED
- **Status:** COMPLETED
- **Benchmark Results:**
  - Minimum FPS: XX.X
  - Average FPS: XX.X
  - Maximum FPS: XX.X
  - Variance: XX.X FPS
- **Acceptance Criteria:** ✅ PASS / ❌ FAIL
- **Console Errors:** None / [list any errors]
- **Visual Performance:** Smooth, no stuttering
- **Comparison to Baseline:** [Improved / Same / Degraded]
- **Commit:** [commit hash]
```

---

## Next Steps After PASS

1. **Update Implementation Plan:**
   ```bash
   # Edit: .auto-claude/specs/020-pool-visual-effect-sprite-textures/implementation_plan.json
   # Set subtask-3-3 status to "completed"
   # Add benchmark results to notes field
   ```

2. **Update Build Progress:**
   ```bash
   # Edit: .auto-claude/specs/020-pool-visual-effect-sprite-textures/build-progress.txt
   # Add benchmark results under subtask-3-3
   ```

3. **Commit Results:**
   ```bash
   git add .
   git commit -m "auto-claude: subtask-3-3 - Performance benchmark PASS (min: XX, avg: XX, max: XX FPS)"
   ```

4. **Proceed to QA Sign-off:**
   - All subtasks complete
   - Ready for final QA acceptance

---

## Next Steps After FAIL

1. **Capture Performance Profile:**
   - Open Chrome DevTools > Performance tab
   - Record 5 seconds of gameplay with combat
   - Identify bottlenecks in flame graph

2. **Investigate:**
   - Check for O(n²) operations in update loops
   - Verify VectorPool is being used
   - Check for excessive draw calls
   - Look for memory allocation spikes

3. **Document Issues:**
   ```bash
   # In build-progress.txt:
   #### subtask-3-3: Run performance benchmark ❌ FAILED
   - Benchmark Results: [results]
   - Issues Found: [describe bottlenecks]
   - Next Actions: [optimization plan]
   ```

4. **Fix and Re-test:**
   - Implement performance fixes
   - Re-run benchmark
   - Repeat until acceptance criteria met

---

## Performance Context

### Frame Budget (60 FPS = 16.67ms per frame)
- Game logic: ~10ms
- Rendering: ~6ms
- Buffer: ~0.67ms

### Critical Systems
- **VectorPool:** Reuses Vector3 objects (saves 10-20ms/frame)
- **Instanced Rendering:** Batches unit rendering (90% draw call reduction)
- **Spatial Hashing:** Fast proximity queries in UnitManager
- **Sprite Pooling:** (NEW) Eliminates per-effect texture allocation

### This Optimization Impact
- **Before:** Each effect created new canvas, context, texture, material
- **After:** Reuses pre-created textures from pool
- **Expected Improvement:** 2-5ms saved per frame with heavy effects
- **Memory Benefit:** No allocation spikes, reduced GC pressure

---

## Success Criteria Summary

This subtask is **COMPLETE** when:
1. ✅ Benchmark executed successfully (30 seconds, 100 units)
2. ✅ Results meet acceptance criteria (min >55, avg ≈60 FPS)
3. ✅ No console errors during benchmark
4. ✅ Results documented in build-progress.txt
5. ✅ implementation_plan.json updated to "completed"
6. ✅ Changes committed with benchmark results

---

## Reference

- **BenchmarkManager:** `web/src/game/debug/BenchmarkManager.ts`
- **PooledSprite:** `web/src/game/effects/PooledSprite.ts`
- **VisualEffects:** `web/src/game/effects/VisualEffects.ts`
- **CLAUDE.md:** Performance guidelines and requirements

**Estimated Time:** 5 minutes
**Required:** Yes (blocking for QA sign-off)
**Type:** Manual browser verification
