# scwlkr Logo Light Trail Animation

> **Location**: `/brand/index.html` (inline script)  
> **Last Updated**: 2026-02-02

## Overview

The scwlkr brand page features a sophisticated Tron-style light trail animation on the logo. Light trails ("comets") travel along the letter paths of "scwlkr", creating a dynamic, futuristic effect.

---

## Animation Lifecycle

Each light trail follows a three-state lifecycle with **immediate respawn**:

```
GROWING → TRAVELING → FADING → (immediate respawn) → GROWING...
```

### States

| State | Description | Visual Effect |
|-------|-------------|---------------|
| **GROWING** | Trail starts as a tiny dot (2 units) and grows its tail behind it as the head moves forward | Dot expands into comet tail |
| **TRAVELING** | Full-length trail moves along the path (head and tail move together at same speed) | Comet cruising along letter |
| **FADING** | Head stops moving, tail catches up at 1.3× speed until trail disappears | Comet tail catches up and vanishes |

> **Note**: There is NO dormant/waiting state. Trails respawn immediately at a new random position after fading.

---

## Multiple Trails Per Letter

Each letter path can have multiple simultaneous light trails, determined by probability at page load:

| Trail # | Probability | Formula |
|---------|-------------|---------|
| 1st | **100%** | Always present |
| 2nd | **33%** | `additionalTrailChance` |
| 3rd | **16.5%** | 33% × 0.5 |
| 4th | **8.25%** | 33% × 0.5² |
| 5th | **4.125%** | 33% × 0.5³ |
| nth | ... | 33% × 0.5^(n-2) |

### Implementation

```javascript
function calculateTrailCount() {
  let count = 1; // Always at least 1 trail
  let chance = CONFIG.additionalTrailChance; // 0.33
  
  while (Math.random() < chance) {
    count++;
    chance *= CONFIG.trailChanceDecay; // 0.5
  }
  
  return count;
}
```

When a letter has multiple trails, each additional trail is rendered using a **cloned SVG path** element (since each needs its own `stroke-dasharray`).

---

## Configuration Parameters

```javascript
const CONFIG = Object.freeze({
  // Trail Appearance
  maxTrailLength: 0.18,      // Maximum trail length (18% of path)
  minTrailLength: 0.08,      // Minimum trail length (8% of path)
  
  // Speed Settings
  baseSpeed: 0.275,          // Base movement speed (path units/ms)
  speedVariance: 0.3,        // Speed can vary ±30%
  fadeSpeedMultiplier: 1.3,  // Tail catches up 30% faster during fade
  growSpeedMultiplier: 0.8,  // Tail grows at 80% of head speed during GROWING
  
  // Travel Distance
  minTravelRatio: 0.20,      // Minimum travel distance (20% of path)
  maxTravelRatio: 0.85,      // Maximum travel distance (85% of path)
  
  // Multi-trail Probability
  additionalTrailChance: 0.33,  // 33% chance for 2nd trail
  trailChanceDecay: 0.5,        // Each additional trail is half as likely
  
  // Visual
  fillOpacity: 0.12,         // Letter fill visibility (subtle background)
  frameSmoothing: 0.85       // Exponential smoothing for frame timing
});
```

---

## Technical Implementation

### SVG Structure

The animation uses existing SVG elements within the `#animatedLogo` container:

| Class | Purpose |
|-------|---------|
| `.letter-fill` | Solid letter shapes (shown at low opacity as background) |
| `.letter-stroke` | Animated trail paths (primary trails) |
| `.trail-clone` | Dynamically created clones for additional trails |

### Glow Effect

Trails have a soft glow using an SVG filter defined in the `<defs>` section:

```xml
<filter id="trailGlow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
  <feMerge>
    <feMergeNode in="blur" />
    <feMergeNode in="blur" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

The triple-merge (blur + blur + source) creates a vibrant glow while keeping the trail itself sharp.

### Trail Positioning with stroke-dasharray

Trails are positioned using SVG stroke properties:

```javascript
_updateVisuals() {
  // dasharray: [visible segment length, invisible gap]
  const visibleLength = Math.max(this.currentTrailLength, 1);
  path.style.strokeDasharray = `${visibleLength} ${pathLength}`;

  // dashoffset positions WHERE the visible segment appears
  const tailPosition = headPosition - visibleLength;
  path.style.strokeDashoffset = pathLength - tailPosition;
}
```

### Animation Loop

Uses `requestAnimationFrame` with exponential smoothing to prevent frame timing jitter:

```javascript
function animate(currentTime) {
  const rawDelta = currentTime - lastTime;
  
  // Exponential moving average smooths out frame timing variance
  smoothDelta = smoothDelta * 0.85 + rawDelta * 0.15;
  
  // Clamp to prevent huge jumps after tab switch
  const delta = Math.min(smoothDelta, 32);
  
  for (let i = 0; i < allTrails.length; i++) {
    allTrails[i].update(delta);
  }
  
  requestAnimationFrame(animate);
}
```

---

## CSS Styling

```css
.animated-logo .letter-stroke {
  fill: none;
  stroke: url(#tronTrailGradient);
  stroke-width: 18;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.7;
  filter: url(#trailGlow);
  will-change: stroke-dashoffset;
}
```

Key properties:
- `stroke: url(#tronTrailGradient)` - Green-to-white gradient
- `filter: url(#trailGlow)` - Soft glow effect
- `will-change: stroke-dashoffset` - GPU acceleration hint
- `opacity: 0.7` - Semi-transparent for glow visibility

---

## Accessibility

The animation respects the user's motion preferences:

```javascript
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  logo.classList.add('revealed');
  return; // Skip animation entirely
}
```

---

## Performance Optimizations

| Optimization | Description |
|--------------|-------------|
| **Exponential frame smoothing** | Prevents timing jitter between frames |
| **will-change CSS hint** | Enables GPU acceleration for stroke-dashoffset |
| **Visibility API** | Pauses animation when browser tab is hidden |
| **Pre-calculated path lengths** | Computed once per trail at initialization |
| **For loop vs forEach** | Uses optimized `for` loop for update cycle |
| **Immediate respawn** | No dormant state eliminates unnecessary checks |

---

## File Structure

```
/brand/index.html
├── <svg id="animatedLogo">
│   ├── <defs>
│   │   ├── <linearGradient id="tronTrailGradient">
│   │   └── <filter id="trailGlow">
│   ├── <g> (letter groups)
│   │   ├── <path class="letter-fill">
│   │   └── <path class="letter-stroke">
│   └── <path class="trail-clone"> (dynamically added)
└── <script>
    └── initTronAnimation() IIFE

/docs/scwlkr_logo_light_trail_animation.md (this file)
```

---

## Version History

| Date | Changes |
|------|---------|
| 2026-02-02 | Initial implementation with basic stroke animation |
| 2026-02-02 | Added glow filter, removed hover interactions |
| 2026-02-02 | Implemented lifecycle: TRAVELING → FADING → DORMANT |
| 2026-02-02 | Added GROWING state for graceful trail appearance |
| 2026-02-02 | Increased animation speed 5× (baseSpeed: 0.055 → 0.275) |
| 2026-02-02 | Removed DORMANT state - trails now respawn immediately |
| 2026-02-02 | Added multi-trail support with probability system |
| 2026-02-02 | Created this documentation file |

---

## Customization Guide

### Adjusting Speed
```javascript
baseSpeed: 0.275  // Increase for faster, decrease for slower
```

### Adjusting Trail Density
```javascript
additionalTrailChance: 0.33  // Increase for more multi-trails
trailChanceDecay: 0.5        // Decrease for even more trails
```

### Adjusting Trail Length
```javascript
minTrailLength: 0.08  // 8% of path minimum
maxTrailLength: 0.18  // 18% of path maximum
```

### Adjusting Travel Distance
```javascript
minTravelRatio: 0.20  // Trails travel at least 20% of path
maxTravelRatio: 0.85  // Trails travel at most 85% of path
```
