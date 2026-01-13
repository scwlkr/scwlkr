# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static link-in-bio website for scwlkr (Shane Walker) featuring a unique "hovering bricks" design concept. It's a fully self-contained single-page site with no build process, no dependencies, and no runtime requirements beyond a web browser. All functionality is embedded directly in `index.html`.

## Design Philosophy

**"Blank Wall with Hovering Bricks"**
- Solid black background (#000000) with zero gradients - elements appear to float off the surface
- Perpetual gentle floating animation creates organic, living quality
- 3D hover extrusion makes cards slide forward like bricks from a wall
- Minimal, timeless aesthetic inspired by Apple, Nike, Stripe, and BAUHAUS
- Strict 5-color palette to avoid AI-generated look

## Architecture

### Core File
- **index.html** - Self-contained HTML page with embedded CSS and JavaScript. This is the entire production site.

### Images
- **assets/img/pfp-square.jpeg** (139KB) - Profile photo in header
- **assets/img/dink-boys-logo.png** (105KB) - Dink Boys business logo
- **logo/scwlkr-logo_144px.png** (2.2KB) - Favicon
- **assets/img/scwlkr_colors.png** (40KB) - Brand color palette reference
- **Unused images**: pfp.jpeg (156KB), favicon.png, favicon.svg, profile.svg, instagram_logo.png

### Brand Assets
- **logo/scwlkr-logo_V1.png** - Full-size brand logo (35KB)
- **logo/scwlkr-logo_V1.ai** - Adobe Illustrator source file (245KB PDF format)

### Alternative/Unused Assets
- **assets/css/styles.css** - Old stylesheet with different theme approach (NOT linked in index.html)
- **assets/js/main.js** - Utility functions for copy-to-clipboard and reduced motion (NOT linked in index.html)

### Vercel Serverless API
- **api/tweets.js** - Serverless function that fetches tweets from X API v2
- **vercel.json** - Vercel configuration with caching and CORS headers
- Requires environment variables: `TWITTER_BEARER_TOKEN`, `TWITTER_USER_ID`

### Deployment
- **public_html/** - Empty directory for Hostinger/FTP deployment staging
- **Vercel** - Primary deployment at scwlkr.vercel.app

## index.html - Complete Feature Reference

### HTML Structure
- Semantic HTML5 with proper ARIA labels and accessibility attributes
- Meta tags for SEO, Open Graph, and Twitter Cards
- Multiple favicon sizes (16x16, 32x32, 180x180)
- Google Fonts: JetBrains Mono (weights: 400, 500, 600, 700) with preconnect optimization
- External icon resources from cdn.simpleicons.org and api.iconify.design

### Layout Architecture

**Grid-based structure:**
```
<body> (solid black wall, perspective: 1200px)
├── <header> - Minimal profile (50px photo + name + bio)
├── <div class="main-layout"> (grid: main + sidebar on desktop)
│   ├── <main> - Business cards section
│   │   ├── .business-cards (3 floating cards in responsive grid)
│   │   └── .random-tweet-section (1 dynamic X post, full width)
│   └── <aside> - Personal links sidebar (7 compact links)
└── <footer> - Copyright with dynamic year
```

### Content Sections

1. **Header** - Minimal top section
   - Profile photo (50px square with 4px border-radius)
   - Name: "Shane Walker"
   - Bio: "Entrepreneur • Dallas, TX"

2. **Business Cards** (3 large floating cards):
   - The Media Hangar (themediahangar.com) - Real estate media & production
   - Dink Boys (dinkboys.com) - Pickleball brand
   - DFFW Daily (dffwdaily.com) - Dallas-Fort Worth news

3. **Personal Links Sidebar** (7 compact icon + label links):
   - Instagram (@scwlkr_)
   - TikTok (@scwlkr)
   - X/Twitter (@scwlkr)
   - LinkedIn (shane-walker-384a671a3)
   - Letterboxd (movieswitboat)
   - Discord (@scwlkr)
   - Email (scwlkr8@gmail.com)

4. **Random X Post Section** (dynamic content):
   - Displays one random post from @scwlkr X account
   - Styled to match personal links (compact, minimal design)
   - 3-tier fallback system for reliability
   - Full width spanning business cards area

5. **Footer** - Simple copyright with dynamic year

### CSS Features (Embedded)

**Color System (Strict 5-color palette):**
```css
--wall-black: #000000;    /* Background only - no gradients */
--card-gray: #888888;     /* Card backgrounds, borders, muted text */
--text-white: #FFFFFF;    /* Primary text */
--accent-green: #23CE6B;  /* Hover states, primary actions, icons */
--accent-blue: #2541B2;   /* Secondary highlights (reserved for future use) */
```

**3D Transform System:**
- Body has `perspective: 1200px` to enable 3D space
- Cards use `transform-style: preserve-3d` for depth
- GPU acceleration via `will-change: transform` and `translate3d()`

**Floating Animation:**
- Business cards: 5s infinite ease-in-out, 3px vertical movement
- Personal links: 4s infinite ease-in-out, 1px vertical movement
- Staggered animation delays (0s, 0.6s, 1.2s for business cards)
- Keyframe: `translate3d(0, 0, 0)` → `translate3d(0, -3px, 0)` → back

**3D Hover Extrusion Effect:**
- On hover: `transform: translate3d(0, -3px, 10px)` (10px forward on z-axis)
- Shadow deepens: `0 20px 40px rgba(0,0,0,0.6)`
- Green glow border: `0 0 0 2px rgba(35,206,107,0.4)`
- Green outer glow: `0 0 20px rgba(35,206,107,0.2)`
- Bounce easing: `cubic-bezier(0.34, 1.56, 0.64, 1)`
- Hover overrides floating animation with `!important`

**Typography:**
- Font: JetBrains Mono (400, 500, 600, 700)
- Header: `clamp(20px, 2.5vw, 28px)` with -0.02em letter-spacing
- Business cards: 20px titles, 14px descriptions
- Personal links: 14px labels
- Footer: 12px gray text

**Visual Design:**
- Zero gradients - solid black background only
- Card backgrounds: `rgba(136, 136, 136, 0.12)` (semi-transparent gray)
- Borders: `rgba(136, 136, 136, 0.2)` (subtle gray)
- Layered box shadows for depth perception
- Minimal border-radius (4px on profile photo only)

**Responsive Design:**
- **Desktop (>960px)**: Sidebar right (240px), business cards in auto-fit grid
- **Tablet (560-960px)**: Sidebar below, cards 2-column, reduced floating (2px)
- **Mobile (<560px)**: Single column stack, minimal floating (1px), centered layout

**Touch Optimizations:**
- Detects `(hover: none) and (pointer: coarse)`
- Disables hover extrusion on touch devices
- Adds press feedback: `scale(0.98)` on `:active`
- Ensures 44px minimum touch targets on personal links

**Reduced Motion Support:**
- Respects `prefers-reduced-motion: reduce`
- Disables all animations and transitions
- Sets duration to `0.01ms` with single iteration

### JavaScript Features (Embedded)

1. **Dynamic Copyright Year:**
   - Auto-updates footer year using `new Date().getFullYear()`
   - Eliminates need for annual manual updates

2. **UTM Parameter Forwarding:**
   - Captures all URL query parameters on page load
   - Automatically appends them to all outbound HTTP links (not mailto)
   - Enables analytics tracking of traffic sources (e.g., ?utm_source=instagram)
   - Error-safe with try/catch around URL parsing
   - Preserves original link behavior if parameter addition fails

3. **Reduced Motion Detection:**
   - Detects `prefers-reduced-motion: reduce` media query
   - Adds `.no-motion` class to document element (for potential future use)
   - CSS handles actual animation disabling via media query

4. **Random X Post Fetching (3-tier fallback system):**
   - **Tier 1:** Tries Vercel API (`/api/tweets`) which fetches from X API v2
   - **Tier 2:** Falls back to X's public oEmbed API with curated tweet list
   - **Tier 3:** Shows placeholder if all services fail
   - Tweet IDs extracted from `fallbackTweetURLs` array using regex
   - Random selection from available tweets on each page load
   - Custom rendering with site styling (not official X embed widget)
   - XSS protection via `escapeHtml()` helper function
   - Browser caching for 24 hours via Vercel headers

**Removed Features (from previous version):**
- Theme toggle system (fixed dark theme only)
- Light theme support and localStorage persistence
- Keyboard navigation (1-9 keys to focus links)

## Development Workflow

### Making Changes
1. Edit `index.html` directly - it's the entire site
2. Open in browser to test (no server required for local testing)
3. Test floating animations and hover extrusion effects
4. Test responsive design at 960px and 560px breakpoints
5. Verify reduced motion support in browser settings
6. Test keyboard navigation (Tab key)

### Adding Business Cards
Edit the `.business-cards` section in index.html:
```html
<a href="https://url.com" target="_blank" rel="noopener" class="business-card">
  <img src="logo.png" alt="Business name" class="business-logo" />
  <h2>Business Name</h2>
  <p class="description">Brief description</p>
  <span class="cta">Visit site →</span>
</a>
```
- Maintain `rel="noopener"` on external links for security
- Logo should be 48x48px (will scale to fit)
- Keep descriptions concise (1-2 lines)

### Adding Personal Links
Edit the `.personal-links` section in index.html:
```html
<a href="https://url.com" target="_blank" rel="noopener" class="personal-link">
  <img src="https://cdn.simpleicons.org/platform/23ce6b" alt="" class="link-icon" />
  <span>Platform Name</span>
</a>
```
- Use Simple Icons CDN with green color: `?color=%2323ce6b` (URL-encoded #23CE6B)
- Icons are 20x20px
- Ensure minimum 44px touch target (handled by CSS)

### Updating Random X Posts
Edit the `fallbackTweetURLs` array in `index.html` (around line 772):
```javascript
const fallbackTweetURLs = [
  'https://x.com/scwlkr/status/1993304027962937453',
  'https://x.com/scwlkr/status/2005709805550530834',
  // Add 5-10 of your favorite tweet URLs
];
```

**How it works:**
1. **Primary:** Tries Vercel serverless API (`/api/tweets`) which fetches from X API v2
2. **Fallback:** Uses X's public oEmbed API to fetch tweet data from your curated list
3. **Final fallback:** Shows placeholder if all services fail
4. **Styling:** Always uses custom site styling (compact, minimal like personal links)
5. **Random selection:** Picks a random tweet on each page load

**The tweet displays:**
- Profile photo (28px avatar)
- Name and handle
- Tweet text (with XSS protection via `escapeHtml()`)
- Link to view on X

### Modifying Colors
Edit CSS custom properties in `index.html` `:root` selector (lines ~26-31):
```css
--wall-black: #000000;    /* Do not change - pure black required */
--card-gray: #888888;     /* Card backgrounds, borders */
--text-white: #FFFFFF;    /* Primary text */
--accent-green: #23CE6B;  /* Primary brand color */
--accent-blue: #2541B2;   /* Secondary (currently unused) */
```
**Important:** Maintain pure black background (#000000) - no gradients

### Adjusting Floating Animation
Edit `@keyframes float-gentle` in `<style>` section (around line 169):
- Default: 3px vertical movement over 5s
- Tablet: 2px movement (defined in media query)
- Mobile: 1px movement (defined in media query)
- To disable: Set `animation: none` on `.business-card`

### Adjusting Hover Extrusion
Edit `.business-card:hover` styles (around line 179):
- Z-axis extrusion: `translate3d(0, -3px, 10px)` - change `10px` for more/less depth
- Shadow depth: `0 20px 40px` - adjust spread
- Green glow: `0 0 0 2px rgba(35,206,107,0.4)` - adjust opacity

## Deployment

### GitHub Pages
1. Push to master branch
2. Enable Pages in repository settings
3. Set source to master branch root
4. Access at `https://username.github.io/repo-name/`
5. Add CNAME file to root for custom domain

### Hostinger/FTP
1. Upload all files to web root (typically `public_html/`)
2. Ensure `index.html` is in the root
3. Upload `assets/` and `logo/` directories with their contents
4. Set file permissions (644 for files, 755 for directories)

### Vercel (with Serverless API for X Posts)
**Prerequisites:**
- X API credentials (Bearer token + User ID)
- Vercel account

**Setup:**
1. Install Vercel CLI: `npm install -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel --prod`
4. Add environment variables:
   ```bash
   vercel env add TWITTER_BEARER_TOKEN
   vercel env add TWITTER_USER_ID
   ```
5. Redeploy: `vercel --prod`

**File structure for Vercel:**
- `api/tweets.js` - Serverless function (already created)
- `vercel.json` - Configuration with caching headers (already configured)
- Environment variables stored securely in Vercel dashboard

**How it works:**
- Vercel automatically detects `/api/*.js` files as serverless functions
- Functions run on-demand with edge caching (24 hours configured)
- X API credentials stored as encrypted environment variables
- Frontend calls `/api/tweets` which proxies to X API v2

**API Endpoint:**
- Production: `https://scwlkr.vercel.app/api/tweets`
- Returns JSON: `{ success: true, tweets: [...], count: 100 }`
- Cached for 24 hours (`s-maxage=86400`)

### Deployment Checklist
- Verify all image paths are correct
- Test floating animations in production
- Check all external links
- Validate HTML (validator.w3.org)
- Test on mobile devices
- Verify favicon appears correctly
- Check Open Graph preview (opengraph.xyz)
- Test keyboard navigation (Tab key)
- Verify reduced motion works

## Technical Notes

### Dependencies
- **Zero npm packages** - No package.json or node_modules
- **No build process** - No webpack, vite, gulp, or bundlers
- **External resources:**
  - Google Fonts API (fonts.googleapis.com, fonts.gstatic.com)
  - Simple Icons CDN (cdn.simpleicons.org)
  - Iconify API (api.iconify.design)
  - X oEmbed API (publish.twitter.com/oembed) - public, no auth
  - Vercel Serverless Functions (optional, requires X API credentials)

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge - last 2 versions)
- Requires JavaScript for UTM forwarding and dynamic year
- CSS Grid and Flexbox for layout
- CSS Custom Properties for theming
- 3D transforms (supported since 2012, 99%+ coverage)
- No cutting-edge CSS features

### Performance
- Minimal external requests (Google Fonts + icons only)
- No JavaScript frameworks or libraries
- Inline CSS/JS eliminates round trips
- Small page weight: ~15KB HTML + ~220KB images
- Fast First Contentful Paint (no render-blocking resources)
- GPU-accelerated animations for 60fps performance

### Security
- All external links use `rel="noopener"` to prevent reverse tabnabbing
- No user input or forms (no XSS risk)
- No server-side code (static HTML only)
- No cookies or tracking (privacy-friendly)

### Accessibility
- Semantic HTML5 elements
- ARIA labels on all interactive elements
- Keyboard navigation support (Tab, Enter)
- Focus indicators on all focusable elements (green outline)
- Reduced motion support for animations
- Excellent color contrast:
  - White on Black: 21:1 (AAA)
  - Green on Black: 8.4:1 (AAA)
  - White on Gray: 4.6:1 (AA)
- Alt text on images (empty alt on decorative icons)
- Minimum 44px touch targets on mobile

## File Structure Reference

```
/Users/shanewalker/Desktop/dev/scwlkr/
├── index.html                    # Main site (production-ready)
├── brand/
│   └── index.html               # Brand resources page (semi-hidden)
├── README.md                     # Project documentation
├── CLAUDE.md                     # This file (Claude Code instructions)
├── CHANGELOG.md                  # Version history
├── .gitignore                    # Git ignore rules (macOS files)
├── public_html/                  # Empty (FTP deployment staging)
├── assets/
│   ├── css/
│   │   └── styles.css           # Old stylesheet (unused)
│   ├── js/
│   │   └── main.js              # Old utility functions (unused)
│   └── img/
│       ├── pfp-square.jpeg      # Profile photo (USED)
│       ├── dink-boys-logo.png   # Dink Boys logo (USED)
│       ├── scwlkr_colors.png    # Brand color palette reference
│       ├── scwlkr_logo.svg      # Vector logo with animated letters (USED)
│       ├── scwlkr_icon.png      # Brand mark - green L icon (USED)
│       ├── scwlkr_full_screen.png   # Desktop wallpaper (USED)
│       ├── scwlkr_full-square.png   # Square format wallpaper (USED)
│       ├── scwlkr_iphone.png    # iPhone wallpaper (USED)
│       ├── scwlkr_full_1000px.png   # Logo 1000px (USED)
│       ├── scwlkr_full_400px.png    # Logo 400px (USED)
│       ├── scwlkr_full_180px.png    # Logo 180px (USED)
│       ├── favicon.png          # Favicon 180px (USED)
│       ├── pfp.jpeg             # Alternative photo (unused)
│       └── instagram_logo.png   # Local icon (unused)
└── logo/
    ├── scwlkr_full_1000px.png   # Logo 1000px copy
    ├── scwlkr_full_400px.png    # Logo 400px copy
    └── scwlkr_full_180px.png    # Logo 180px copy
```

## Common Tasks

### Change Profile Photo
Replace `/assets/img/pfp-square.jpeg` with new image (square aspect ratio recommended, displayed at 50px on desktop, 60px on mobile).

### Add New Business
1. Add new `<a class="business-card">` to `.business-cards` section
2. Include logo (48x48px), title, description, CTA
3. Maintain consistent structure for animations to work
4. Test floating animation with staggered delay

### Add New Social Platform
1. Find icon on Simple Icons (simpleicons.org)
2. Add new `<a class="personal-link">` to `.personal-links` section
3. Use green color in URL: `?color=%2323ce6b`
4. Add appropriate `aria-label` for accessibility

### Modify Floating Intensity
1. Edit `@keyframes float-gentle` - adjust from `-3px` to desired value
2. Edit media queries for tablet/mobile - keep proportional reduction
3. Test performance on lower-end devices

### Disable Animations Entirely
Add this to the `<style>` section:
```css
* {
  animation: none !important;
  transition: none !important;
}
```

### Change Grid Layout
Edit `.business-cards` grid (line ~131):
- Current: `repeat(auto-fit, minmax(280px, 1fr))` (responsive)
- Fixed 3-column: `repeat(3, 1fr)`
- Fixed 2-column: `repeat(2, 1fr)`

## Design Principles to Maintain

1. **No Gradients** - Keep solid black background, avoid radial/linear gradients
2. **Strict Color Palette** - Only use the 5 defined colors
3. **Perpetual Motion** - Floating animation should always be active (unless reduced motion)
4. **3D Depth** - Maintain perspective and extrusion effects
5. **Minimal Aesthetic** - No unnecessary decorations or effects
6. **Performance First** - Keep animations GPU-accelerated, avoid heavy JS
7. **Accessibility** - Maintain keyboard navigation and reduced motion support

## Version Control

This project uses Git with GitHub remote. The `.gitignore` excludes macOS system files (.DS_Store, etc.).

### Git Workflow
- **Branch:** `master` (main branch)
- **No specific branch strategy** - direct commits to master acceptable for solo project
- **Commit style:** Concise messages describing changes

## Maintenance

### Regular Updates
- Update social media links/handles as needed
- Add/remove business cards based on current projects
- Update bio text in header if needed
- Refresh profile photo if desired

### Periodic Tasks
- No manual year updates needed (JavaScript handles copyright year)
- Monitor external CDN uptime (Google Fonts, Simple Icons)
- Check for broken links periodically
- Validate HTML after changes: https://validator.w3.org/
- Test accessibility: https://wave.webaim.org/
- Check performance: https://pagespeed.web.dev/

## Troubleshooting

### Animations Not Working
- Check browser DevTools console for errors
- Verify `perspective` is set on body
- Ensure `transform-style: preserve-3d` is on cards
- Check if reduced motion is enabled in OS settings

### Hover Effect Not Appearing
- Verify `:hover` styles are present
- Check if on touch device (hover disabled intentionally)
- Ensure `!important` is on transform to override animation

### Layout Breaking on Mobile
- Test at exact breakpoints (960px, 560px)
- Check for media query conflicts
- Verify grid template columns in responsive sections

### Icons Not Loading
- Check CDN URLs (Simple Icons, Iconify)
- Verify green color parameter: `?color=%2323ce6b`
- Test network connectivity
- Check browser console for 404 errors
