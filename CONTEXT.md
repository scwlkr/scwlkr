# scwlkr.com context

## Site boundary

`scwlkr.com` is scwlkr's public personal site and the root `README.md` is his GitHub profile introduction. The site is a single-page presentation of his voice and selected work. It has no account, content system, analytics dependency, contact form, database, or public API.

## Audience and job

The audience is a curious builder, collaborator, employer, or internet passerby arriving with little context. The page has one job: make scwlkr memorable and get the visitor to open a project.

## Voice

- Direct, self-aware, and a little strange.
- Specific about what was built; never padded with résumé language.
- Confident without pretending every experiment is a company.
- The standing line is `N00B UNTIL PROVEN GUILTY.`

## Visual system

- Blueprint navy `#000088`, electric blue `#3155ff`, flare orange `#ff5a36`, hard white `#f7f8fc`, and ink `#11131a`.
- Huge compressed lettering carries the identity; monospace labels provide technical detail.
- The signature interaction is the pointer-responsive `SCWLKR` hero word. Motion must stop when reduced motion is requested.
- Project visuals are made from HTML and CSS so they remain fast, sharp, and specific to the work.

## Content contract

The selected work is OpenJob, WalkLang, LocalHub, UQIQ, Vampyre, and paletteWOW. Every item links to its public GitHub repository. No popularity, customer, employment, or performance claim may be added without current evidence.

## Runtime and acceptance

Cloudflare Workers Static Assets serves `public/` on `scwlkr.com`; the tiny Worker module only supplies an asset fallback. The page must remain usable without JavaScript, support keyboard focus, respect reduced motion, fit narrow screens without horizontal overflow, and ship with its security headers. `npm run release:check` is the local release gate and `npm run verify:public` checks the deployed result.
