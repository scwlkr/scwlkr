# Bubba Dashboard - Master System Manual

This document provides a comprehensive overview of the Bubba Dashboard architecture, configuration, and recovery procedures. It serves as the single source of truth for the system's integration with `scwlkr.com` and Google Sheets.

---

## 1. Architecture Overview
The Bubba Dashboard is a serverless, decoupled single-page application (SPA).

- **Frontend (UI & Logic):** Built with React (Vite) and Tailwind CSS v4. Hosted on Vercel as part of the `scwlkr.com` domain, specifically routed to `/bubba-dashboard`.
- **Backend API (Middleware):** Google Apps Script deployed as a Web App. It receives vanilla HTTP requests (`GET` and `POST`) and translates them into Google Server-Side actions.
- **Database (Data Layer):** A Google Spreadsheet (`Bubba_DB`). It acts as a live, free, NoSQL database.

### The "Handshake" Logic
How does the Admin view know when a User has toggled their status?
1. **User Action:** The Agent clicks the huge toggle switch on `/user`.
2. **Optimistic UI:** The button instantly turns green/red locally on their device.
3. **Data Transit:** `sheetApi.ts` silently sends a `POST` request containing their `id` and `status` to the Apps Script URL. *Important: it sends this as `text/plain` to bypass Apps Script's strict preflight CORS requirement.*
4. **Database Update:** The Apps Script finds the corresponding user row and injects the new status and ISO timestamp.
5. **Admin Polling:** The Admin dashboard (`/`) runs a `setInterval` loop exactly every 60,000 milliseconds (1 minute). Next time it polls, it pulls the fresh JSON from the GS Web App and re-renders the grid tile for that specific user.

---

## 2. Environment Setup

The application relies on a scoped `.env.local` file located strictly within the `bubba-dashboard/` folder. This ensures the root `scwlkr.com` repository is not polluted with sub-project secrets.

Create `bubba-dashboard/.env.local` with:
```env
# The ID of the Google Sheet (found in the URL: docs.google.com/spreadsheets/d/<THIS_ID>/edit)
VITE_GOOGLE_SHEET_ID="<YOUR_SPREADSHEET_ID>"

# The deployed Web App URL from Google Apps Script
VITE_APPS_SCRIPT_URL="<YOUR_DEPLOYED_MACRO_URL>"
```

---

## 3. Google Sheets Configuration

To recreate or fix the database connection:
1. Create a Google Sheet.
2. Rename the active tab exactly to: `Bubba_DB`
3. The columns in Row 1 (A1:D1) **must** be: `id` | `username` | `status` | `last_updated`
4. Go to **Extensions > Apps Script**.
5. Paste the contents of `bubba-dashboard/docs/Code.gs` into the editor.
6. Click **Deploy > New Deployment > Web App**.
   - **Execute as:** `Me` (This bypasses OAuth screens for end users).
   - **Who has access:** `Anyone`.
7. Copy the generated URL and save it as `VITE_APPS_SCRIPT_URL` in your `.env.local`.

---

## 4. File Map & Directory Structure

The `bubba-dashboard` folder is fully self-contained.

```text
bubba-dashboard/
├── .env.local                  # Environment variables (Git-ignored)
├── docs/                       # System Documentation
│   ├── backend-setup.md        # Detailed GS setup steps
│   ├── Code.gs                 # The exact Apps Script source code
│   ├── integration.md          # API endpoint mappings
│   └── SYSTEM_MANUAL.md        # This document
├── scripts/                    # Dev & Ops Scripts
│   └── audit.sh                # Bash script to test production routing
├── src/                        # React Application Source
│   ├── api/
│   │   └── sheetApi.ts         # Centralized Fetch logic for Apps Script
│   ├── components/
│   │   ├── AdminView.tsx       # Polling grid for Admin
│   │   ├── AuthWrapper.tsx     # Gatekeeping PIN / ID routing
│   │   └── UserView.tsx        # Optimistic UI Agent Toggle
│   ├── App.tsx                 # React Router handling (base=/bubba-dashboard)
│   ├── index.css               # Tailwind v4 globals & Brand Colors
│   └── main.tsx                # Vite React root mounting
├── index.html                  # Core HTML Entry point
├── package.json                # Dependencies map
├── tailwind.config.ts          # Tailwind overrides (if applicable)
├── tsconfig.json               # TypeScript restrictions
└── vite.config.ts              # Vite Build configs (base: '/bubba-dashboard')
```

---

## 5. Dependency List

This UI depends on modern, lightweight systems:
- **Framework:** `React 18` + `TypeScript`
- **Build Tool:** `Vite`
- **Styling:** `Tailwind CSS v4` + `@tailwindcss/vite`
- **Icons:** `lucide-react` (Provides matching vector SVGs for UI)
- **Routing:** `react-router-dom`
- *No complex state managers (Redux) or thick fetch clients (Axios) are utilized to keep the bundle as tiny as possible.*

---

## 6. ZERO-TO-HERO: Disaster Recovery Plan

If the `bubba-dashboard` folder is completely wiped out, or you need to launch it on a brand new machine, follow these 5 steps securely:

1. **Re-Initialize:** Pull the code repository from GitHub to your local machine. Navigate terminal to `/scwlkr/bubba-dashboard` and run `npm install` to rebuild all node-modules.
2. **Re-Link Environment:** Create a `.env.local` file inside `bubba-dashboard`. Paste your `VITE_APPS_SCRIPT_URL` containing the live Apps Script Web App url.
3. **Double Check DB:** Ensure your Google Sheet still has the `Bubba_DB` tab, and the script is actively deployed via *Extensions > Apps script*.
4. **Local Audit:** Run `npm run dev`. Go to `localhost:5173/bubba-dashboard/`. Enter PIN `1234`. Verify the Admin view connects without spawning red "Sync Errors".
5. **Production Push:** Deployment is handled strictly by GitHub Actions (`.github/workflows/deploy.yml`) using `lftp`. When you push to the `master` branch, the workflow automatically builds the `dist/` folder and mirrors it directly to `public_html/bubba-dashboard` on Hostinger via FTP. To verify it succeeded, run `npm run verify-deploy` in your local terminal.
