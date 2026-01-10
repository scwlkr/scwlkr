# scwlkr — Link Page

A unique "hovering bricks" link-in-bio page for **scwlkr** (Shane Walker). Features a minimal, spatial design with 3D floating animations inspired by Apple, Nike, Stripe, and BAUHAUS.

## Design Concept

**"Blank Wall with Hovering Bricks"**
- Solid black background (#000000) with zero gradients
- Business cards gently float in 3D space (perpetual 2-3px animation)
- Hover makes cards slide forward 10px like bricks from a wall
- Fixed dark theme with strict 5-color palette
- Timeless, minimal aesthetic - no AI-generated look

## Featured Businesses
- **The Media Hangar** - Real estate media & production
- **DFFW Daily** - Dallas-Fort Worth news & local stories
- **Dink Boys** - Pickleball brand

## Dynamic Content
- **Random X Post** - Displays a random post from @scwlkr with 3-tier fallback system (Vercel API → oEmbed API → placeholder)

## Features

### Visual Design
- **3D floating animation** - Gentle perpetual motion on all elements
- **Hover extrusion effect** - Cards slide forward with green glow
- **Responsive grid layout** - Desktop sidebar, mobile stack
- **GPU-accelerated** - Smooth 60fps animations
- **Zero gradients** - Pure minimalist black background

### Technical
- **Single-file architecture** - No build process, zero dependencies
- **Performance first** - ~15KB HTML, inline CSS/JS
- **Fully accessible** - WCAG AAA color contrast, keyboard navigation
- **Touch optimized** - 44px minimum targets, press feedback
- **Reduced motion support** - Respects OS accessibility preferences

### Color Palette
```
#000000 - Pure black (background)
#888888 - Gray (cards, borders)
#FFFFFF - White (text)
#23CE6B - Brand green (accents, hover)
#2541B2 - Blue (reserved for future use)
```

## Quick Start

### Option 1: Direct Use
Open `index.html` in a browser. No server required.

### Option 2: GitHub Pages
1. Push to `master` branch
2. Settings → Pages → Deploy from branch → master/root
3. Optional: Add `CNAME` file with custom domain

### Option 3: Hostinger/FTP
Upload all files to your web root (`public_html/`). That's it.

## Customization

### Update Profile
Replace `assets/img/pfp-square.jpeg` with your photo (square recommended).

### Add/Edit Businesses
Edit `.business-cards` section in `index.html`:
```html
<a href="https://url.com" target="_blank" rel="noopener" class="business-card">
  <img src="logo.png" alt="Business name" class="business-logo" />
  <h2>Business Name</h2>
  <p class="description">Brief description</p>
  <span class="cta">Visit site →</span>
</a>
```

### Add Social Links
Edit `.personal-links` section in `index.html`:
```html
<a href="https://url.com" target="_blank" rel="noopener" class="personal-link">
  <img src="https://cdn.simpleicons.org/platform/23ce6b" alt="" class="link-icon" />
  <span>Platform Name</span>
</a>
```
Find icons at [simpleicons.org](https://simpleicons.org) - add `?color=%2323ce6b` for green.

### Update Random X Posts
Edit the `fallbackTweetURLs` array in `index.html` (line ~772):
```javascript
const fallbackTweetURLs = [
  'https://x.com/scwlkr/status/1993304027962937453',
  // Add more tweet URLs from your account
];
```
The system automatically:
1. Tries Vercel API first (when quota available)
2. Falls back to oEmbed API (free, no quota)
3. Displays with custom site styling

**Setup Vercel API (optional, for automatic updates):**
- See `api/tweets.js` for serverless function
- Requires X API credentials in Vercel environment variables
- See CLAUDE.md for full setup instructions

### Adjust Colors
Edit CSS variables in `index.html` (lines ~26-31):
```css
:root {
  --wall-black: #000000;    /* Background (keep pure black) */
  --card-gray: #888888;     /* Card backgrounds */
  --text-white: #FFFFFF;    /* Text */
  --accent-green: #23CE6B;  /* Brand color */
  --accent-blue: #2541B2;   /* Secondary */
}
```

### Modify Animations
**Floating intensity:**
- Edit `@keyframes float-gentle` (line ~169)
- Default: 3px movement, reduce for subtler effect

**Hover depth:**
- Edit `.business-card:hover` transform (line ~179)
- Change `10px` z-axis value for more/less extrusion

**Disable animations:**
```css
* { animation: none !important; }
```

## Responsive Breakpoints

- **Desktop (>960px):** Sidebar right, cards in grid
- **Tablet (560-960px):** Sidebar below, 2-column cards, reduced floating
- **Mobile (<560px):** Single column stack, minimal floating

## Browser Support

Modern browsers (Chrome, Firefox, Safari, Edge - last 2 versions):
- CSS Grid & Flexbox
- 3D Transforms (99%+ coverage)
- Custom Properties
- ES6 JavaScript

## Performance

- ⚡ No build process
- ⚡ Zero npm dependencies
- ⚡ ~15KB HTML (gzipped)
- ⚡ GPU-accelerated animations
- ⚡ Inline CSS/JS (no extra requests)
- ⚡ Fast First Contentful Paint (<1.5s)

## Accessibility

- ✅ Semantic HTML5
- ✅ ARIA labels on all interactive elements
- ✅ Keyboard navigation (Tab key)
- ✅ Green focus indicators (#23CE6B)
- ✅ WCAG AAA color contrast (21:1 white on black)
- ✅ Reduced motion support
- ✅ 44px minimum touch targets
- ✅ Screen reader compatible

## File Structure

```
scwlkr/
├── index.html              # Entire site (production-ready)
├── README.md               # This file
├── CLAUDE.md               # Developer documentation
├── CHANGELOG.md            # Version history
├── vercel.json             # Vercel configuration
├── api/
│   └── tweets.js           # Serverless function for X API
├── assets/
│   ├── img/
│   │   ├── pfp-square.jpeg     # Profile photo
│   │   └── dink-boys-logo.png  # Business logo
│   ├── css/styles.css          # (unused - old design)
│   └── js/main.js              # (unused - old utilities)
└── logo/
    ├── scwlkr-logo_144px.png   # Favicon
    └── scwlkr-logo_V1.png      # Full brand logo
```

## Design Philosophy

Inspired by:
- **Apple** - Minimal UI, generous whitespace, product focus
- **Nike** - Bold typography, high contrast, asymmetric layouts
- **Stripe** - Precise geometry, 3D depth, smooth transitions
- **BAUHAUS** - Form follows function, geometric purity, limited palette

Principles:
1. No gradients - solid black background only
2. Strict color palette - 5 colors with semantic meaning
3. Perpetual motion - floating animation creates life
4. 3D depth - spatial architecture, not flat design
5. Minimal aesthetic - no decorative elements
6. Performance first - GPU-accelerated, inline everything
7. Accessibility - WCAG AAA, keyboard nav, reduced motion

## What's Different?

Unlike typical link-in-bio sites:
- **3D spatial design** - Elements float off black wall surface
- **Perpetual animation** - Constant gentle motion (not hover-only)
- **Hover extrusion** - Cards slide forward on z-axis (unique interaction)
- **Zero gradients** - Pure minimalist black (anti-trend)
- **Fixed dark theme** - No toggle clutter
- **BAUHAUS geometry** - Clean rectangles, strict alignment

## Technical Details

**3D Transform System:**
- `perspective: 1200px` on body enables 3D space
- `transform-style: preserve-3d` on cards
- `translate3d()` for GPU acceleration
- `will-change: transform` optimization

**Animations:**
- Business cards: 5s infinite floating (3px vertical)
- Personal links: 4s infinite floating (1px vertical)
- Staggered delays: 0s, 0.6s, 1.2s for organic feel
- Hover: `translate3d(0, -3px, 10px)` with bounce easing

**Responsive:**
- CSS Grid with `auto-fit, minmax(280px, 1fr)`
- Breakpoints: 960px (desktop sidebar), 560px (mobile stack)
- Reduced animations on tablet/mobile (battery-friendly)
- Touch detection: `(hover: none) and (pointer: coarse)`

## Version

**Current:** 2.1.0 (Added random X post feature - 2026-01-02)
**Previous:** 2.0.0 (Complete redesign - 2026-01-01)

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Documentation

- **README.md** (this file) - Quick start & overview
- **CLAUDE.md** - Complete developer documentation with all implementation details
- **CHANGELOG.md** - Version history and release notes

## License

Personal project - all rights reserved.

---

**Built with:** Pure HTML, CSS, JavaScript (no frameworks)
**Font:** JetBrains Mono via Google Fonts
**Icons:** Simple Icons CDN + Iconify
**API:** Vercel Serverless Functions + X API v2 + oEmbed
**Inspired by:** Apple • Nike • Stripe • BAUHAUS
