# scwlkr.com context

## Site boundary

`scwlkr.com` is scwlkr's public personal site and the root `README.md` is his GitHub profile introduction. The site is one screen. It has no account, content system, analytics dependency, contact form, database, or public API.

## Audience and job

The audience is a curious builder, collaborator, employer, or internet passerby arriving with little context. The page has one job: make scwlkr memorable. It is a flex, not a portfolio: no project list, no about section, no copy.

## The idea

There is no interface. The screen holds one thing at a time, made of dust: the scwlkr wordmark, the raccoon mark, then three ways out (`wlkr.si`, `x`, `instagram`). Every control is hidden and discovered by using the page:

- scroll, swipe, arrow keys, or click empty space to move between the five views;
- the pointer pushes the dust around and the whole sculpture leans toward it;
- press and hold pulls the dust into the pointer, release throws it back out;
- typing anywhere spells the letters in dust, a matching destination ghosts in, and Enter goes there;
- a word that is a destination is itself the link;
- on a phone, a sideways drag runs the alphabet under the finger and letting go keeps the letter; a tap is Enter.

Left alone, the page plays itself through the views. Left alone for a minute and a half, whatever is on screen crumbles into a pile of sand until it is touched.

Hidden extras, none of them announced anywhere on the page:

- `scwlkr.com/#anything` opens spelling that word as a greeting (underscores are spaces; a hashed blocklist drops the worst words);
- typing `time` shows a live clock in dust, `sand` collapses the screen on demand;
- the raccoon's eyes follow the pointer, it blinks, and clicking its nose makes it sneeze;
- typing anything else and pressing Enter asks a small language model running in the visitor's own browser for a one-sentence reply (`public/mind.js`, loaded only then; where no model can run, nothing happens).

## Voice

- Direct, self-aware, and a little strange.
- The standing line is `n00b until proven guilty.` It lives in the page description and the console, and it can be typed. It is never set as visible copy.

## Visual system

- Charcoal `#181818` field, white dust, signal green `#23ce6b`. Green is reserved for the wordmark's `l`, the pointer, the active tick, and dust in motion.
- The wordmark and raccoon are the canonical brand files (`public/wordmark.svg`, `public/favicon.svg`; `public/shapes.js` is generated from them). Do not redraw, restyle, or approximate them.
- Destination words are set in Inter 800, self-hosted.
- Minimal means nothing on screen that is not the subject: no taglines, labels, helper text, or visible navigation beyond the tick rail, which hides when idle.

## Content contract

Exactly three outbound links: `https://wlkr.si`, `https://x.com/scwlkr`, `https://instagram.com/scwlkr_`. Individual projects are not featured here; they live on wlkr.si. No popularity, customer, employment, or performance claim may be added without current evidence.

## Runtime and acceptance

Cloudflare Workers Static Assets serves `public/` on `scwlkr.com`; the tiny Worker module only supplies an asset fallback. Plain HTML, CSS, and vanilla JavaScript with no dependencies or build step. The strict content security policy stays: no inline script or style, nothing loaded from other origins.

The live version needs WebGL2 (the dust is simulated on the GPU with transform feedback). Without JavaScript, without WebGL2, or when reduced motion is requested, the plain version is the site: the wordmark and the three links. Both versions must support keyboard focus and fit narrow screens without horizontal overflow. `npm run release:check` is the local release gate and `npm run verify:public` checks the deployed result.
