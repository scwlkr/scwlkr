# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [2.2.0] - 2026-03-16

### Added
- **PaletteWow** - Added new business card for the color palette generator.

### Cleaned
- **Vercel Config** - Removed outdated `bubba-dashboard` rewrite rules from `vercel.json`.

## [2.1.0] - 2026-01-02

### Added - Random X Post Feature
- **Random X post display** - Shows one random post from @scwlkr beneath business cards
- **3-tier fallback system** for reliability:
  1. Vercel serverless API calling X API v2 (when quota available)
  2. X's public oEmbed API with curated tweet list (no auth required)
  3. Placeholder with link to X profile (final fallback)
- **Serverless API infrastructure** - `api/tweets.js` Vercel function
- **Vercel configuration** - `vercel.json` with 24-hour edge caching
- **Custom tweet styling** - Matches personal links aesthetic (compact, minimal)
- **XSS protection** - `escapeHtml()` helper function for tweet text
- **Tweet URL curation system** - Array of 7 fallback tweet URLs
- **Automatic ID extraction** - Regex parsing of tweet IDs from full URLs
- **Random selection** - Different tweet on each page load
- **Floating animation** - Uses `float-gentle-light` (4s, 1px movement)
- **Hover effect** - Subtle extrusion matching personal links style
- **Full-width layout** - Spans entire business cards area width

### Changed
- **Layout architecture** - Added `.random-tweet-section` to main after business cards
- **Section title styling** - "FROM X" with uppercase, letter-spacing matching "CONNECT"
- **Tweet display design** - Semi-transparent background `rgba(136, 136, 136, 0.06)`, subtle border
- **Avatar size** - 28px (smaller than business cards, matching link icon size)
- **Spacing** - Compact padding (16px) matching personal links
- **Animation** - Lighter floating (1px vs 3px for business cards)

### Technical
- **Vercel deployment** - Primary hosting at scwlkr.vercel.app
- **Environment variables** - `TWITTER_BEARER_TOKEN`, `TWITTER_USER_ID` stored securely
- **API endpoint** - `https://scwlkr.vercel.app/api/tweets`
- **Caching strategy** - 24-hour edge cache (`s-maxage=86400`)
- **CORS headers** - Configured for cross-origin requests
- **X API v2** - Fetches 100 recent tweets (excluding retweets/replies)
- **oEmbed API** - Public fallback at `publish.twitter.com/oembed`
- **Regex pattern** - `/status\/(\d+)/` extracts tweet IDs from URLs

### Files Added
- `api/tweets.js` - Node.js serverless function (49 lines)
- `vercel.json` - Vercel configuration with caching headers

### Files Modified
- `index.html` - Added random tweet section HTML, CSS (~140 lines), JavaScript (~130 lines)
- `.gitignore` - Added `.vercel` directory
- `README.md` - Documented X post feature and Vercel setup
- `CLAUDE.md` - Added comprehensive implementation documentation
- `CHANGELOG.md` - This file

### Dependencies Added
- **Vercel Serverless Functions** - For X API proxy (optional)
- **X API v2** - Primary tweet data source (requires credentials)
- **X oEmbed API** - Public fallback (no auth required)

### Content
- **Curated tweets** - 7 manually selected tweet URLs from @scwlkr:
  - Tweet IDs: 1993304027962937453, 2005709805550530834, 2003579198590582812, 2003157248756133977, 1998403606349787148, 1996329016417010170, 1995835784738603243
- **Section title** - "FROM X" (uppercase, gray, letter-spaced)

## [2.0.0] - 2026-01-01

### Added - Complete Website Redesign
- **"Hovering Bricks" design concept** - Unique spatial layout with floating elements
- **3D animation system** - Perpetual gentle floating (2-3px) on all cards
- **3D hover extrusion effect** - Cards slide forward 10px on z-axis with green glow
- **Strict 5-color palette** - #000000, #888888, #FFFFFF, #23CE6B, #2541B2
- **Grid-based layout** - Header → Main content + Sidebar → Footer architecture
- **Business cards prominence** - 3 large floating cards (The Media Hangar, Dink Boys, DFFW Daily)
- **Compact personal links sidebar** - 7 icon + label links in vertical list
- **GPU-accelerated animations** - `will-change: transform` and `translate3d()` for 60fps
- **Staggered animation delays** - Each card floats with offset timing for organic feel
- **Touch device optimizations** - Press feedback, disabled hover on mobile, 44px touch targets
- **Enhanced accessibility** - Green focus indicators, improved keyboard navigation
- **Reduced motion detection** - JavaScript detection with CSS media query support

### Changed - Major Breaking Changes
- **Complete HTML restructure** - From centered card to full-viewport grid layout
- **Fixed dark theme** - Removed theme toggle button and light mode entirely
- **Solid black background** - Zero gradients (was radial gradient backgrounds)
- **Minimal header design** - 50px profile photo + name + one-line bio only
- **Responsive breakpoints** - Now 960px (desktop sidebar) and 560px (mobile stack)
- **Typography updates** - Added font-weight 500, updated sizing with clamp()
- **Shadow system** - Layered shadows for depth perception (sm/md/lg/glow)
- **Card styling** - Semi-transparent gray backgrounds instead of solid cards
- **Animation approach** - Constant floating vs. hover-only shimmer effect
- **Footer position** - Right-aligned (desktop) / centered (mobile) vs. center-aligned

### Removed
- Theme toggle button and associated JavaScript
- Light theme CSS variables and localStorage persistence
- Keyboard navigation (1-9 keys to focus links)
- Shimmer animation effect on featured links
- Radial gradient backgrounds
- Badge elements (Entrepreneur, Location, Email badges)
- Social icon links in footer (consolidated to sidebar)
- All rounded corners except 4px on profile photo

### Technical
- **Color palette:** Pure black #000000 (no gradients), #888888 (gray), #FFFFFF (white), #23CE6B (green), #2541B2 (blue)
- **3D transform space:** `perspective: 1200px` on body
- **Floating animation:** 5s ease-in-out infinite for business cards, 4s for personal links
- **Hover effect:** `translate3d(0, -3px, 10px)` with bounce easing `cubic-bezier(0.34, 1.56, 0.64, 1)`
- **Responsive grid:** `auto-fit, minmax(280px, 1fr)` for business cards
- **CSS custom properties:** 17 variables for spacing, typography, shadows, timing
- **Performance:** ~15KB HTML, GPU-accelerated animations, inline everything

### Design Philosophy
- Inspired by Apple, Nike, Stripe, and BAUHAUS principles
- Minimal, timeless aesthetic - no AI-generated look
- Spatial architecture - elements float off black wall surface
- Perpetual motion - creates organic, living quality
- 3D depth perception - hover extrusion like bricks sliding from wall
- Strict geometric precision - clean rectangles, consistent spacing

### Content Updates
- Simplified bio to "Entrepreneur • Dallas, TX"
- Business descriptions updated for clarity
- Added "Connect" header to personal links section
- All links maintain UTM parameter forwarding

### Accessibility Improvements
- Green focus indicators (#23CE6B) on all interactive elements
- Improved color contrast ratios (White on Black: 21:1 AAA)
- Semantic HTML with proper ARIA labels
- Tab navigation through all links
- Reduced motion support via media query
- 44px minimum touch targets on mobile

### Files Modified
- `index.html` - Complete rewrite (548 lines → 548 lines with entirely new structure)
- `CLAUDE.md` - Updated with new design documentation
- `CHANGELOG.md` - This file
- `README.md` - Updated with new design information

## [1.0.0] - 2025-10-04

### Added
- Initial release of scwlkr link-in-bio website
- Self-contained single-page HTML architecture with embedded CSS and JavaScript
- Dual theme system (dark/light) with localStorage persistence
- Featured links section with shimmer animation effect
- Social media grid with 6 platform links
- Theme toggle button with accessibility support (ARIA labels)
- UTM parameter forwarding for analytics tracking
- Keyboard navigation (press 1-9 to focus links)
- Dynamic copyright year using JavaScript
- Responsive design with mobile, tablet, and desktop layouts
- Reduced motion support for accessibility
- Focus ring animation for keyboard navigation feedback
- Profile photo and brand favicon integration
- Footer with social icon links
- External icon integration via CDN (Simple Icons, Iconify)
- Google Fonts integration (JetBrains Mono)
- SEO meta tags, Open Graph, and Twitter Card support

### Technical
- Brand color palette: #23CE6B (brand green), #08090A (dark), #F2F5EA (light)
- Responsive breakpoints at 560px and 400px
- CSS Grid and Flexbox layout system
- Radial gradient backgrounds with accent colors
- Smooth transitions and hover effects (100-300ms timing)
- Security: `rel="noopener"` on all external links

### Files
- `index.html` - Main production site (self-contained)
- `assets/img/pfp-square.jpeg` - Profile photo
- `logo/scwlkr-logo_144px.png` - Brand favicon
- `logo/scwlkr-logo_V1.png` - Full-size brand logo
- `logo/scwlkr-logo_V1.ai` - Adobe Illustrator source file
- `assets/css/styles.css` - Alternative stylesheet (not linked)
- `assets/js/main.js` - Utility functions (not linked)
- `.gitignore` - Git ignore rules for macOS files
- `README.md` - Project documentation
- `CLAUDE.md` - Claude Code instructions

### Content
- **Featured Links:**
  - The Media Hangar (themediahangar.com)
  - DFFW Daily (dffwdaily.com)
  - Email (scwlkr8@gmail.com)
- **Social Platforms:**
  - Instagram (@scwlkr_)
  - TikTok (@scwlkr)
  - X/Twitter (@scwlkr)
  - LinkedIn (shane-walker-384a671a3)
  - Letterboxd (movieswitboat)
  - Discord (@scwlkr)

## [0.9.0] - 2025-10-04

### Changed
- Updated Discord name and link
- Updated bio text
- Changed various text elements during development
- Reorganized folder structure

### Fixed
- Moved files back to correct directory structure
- Removed .DS_Store files from repository

### Added
- Git repository initialization
- .gitignore file for macOS system files

## Development History

**2025-10-04:**
- Multiple iterative updates to Discord integration
- Bio text refinements
- Directory structure optimization
- Git repository setup and cleanup

---

## Categories Reference

This changelog uses the following categories:

- **Added** - New features or functionality
- **Changed** - Changes to existing features
- **Deprecated** - Features that will be removed in future versions
- **Removed** - Features that have been removed
- **Fixed** - Bug fixes
- **Security** - Security-related changes
- **Technical** - Technical implementation details
- **Files** - File additions, removals, or reorganizations
- **Content** - Content updates (links, text, images)

## Version Numbering

This project follows semantic versioning principles:
- **Major version (X.0.0)** - Significant redesigns or breaking changes
- **Minor version (0.X.0)** - New features or substantial updates
- **Patch version (0.0.X)** - Bug fixes and minor tweaks

Current version: 2.1.0 (stable release with X post feature)
