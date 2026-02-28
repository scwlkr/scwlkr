# Bubba Dashboard - Integration Map

This document serves as the true mapping for how the React UI corresponds to the Google Sheets backend deployed with Google Apps Script.

## 1. System Architecture

- **Database:** Google Sheet `Bubba_DB` acts as the definitive data store.
- **Backend API:** A Google Apps Script (Web App deployment) running `docs/Code.gs` processes HTTP requests from the outside world.
- **Frontend Sync:** The `src/api/sheetApi.ts` fetches and toggles this remote data securely using text/plain posts to avoid Cross-Origin Preflight rejections inherent to Apps Script.
- **Middleware / Gatekeeping:** `src/components/AuthWrapper.tsx` secures routes based on `.env` configuration (Admin PIN) and User ID Context passing.

---

## 2. API Endpoint Mappings

All requests interact with the Web App URL defined in your `.env.local` as `VITE_APPS_SCRIPT_URL`.

### A. Fetch All Users
- **Hook:** `fetchAllUsers()`
- **HTTP:** `GET {VITE_APPS_SCRIPT_URL}`
- **Usage:** Polls the database every 60 seconds within `AdminView.tsx` to keep the operator's grid map in sync.

### B. Fetch User Status
- **Hook:** `fetchUserStatus(id)`
- **HTTP:** `GET {VITE_APPS_SCRIPT_URL}?id={id}`
- **Usage:** Fires on `UserView.tsx` mount using the `AuthContext` to get the designated user's initial state so the toggle renders accurately.

### C. Update User Status
- **Hook:** `toggleUserStatus(id, status)`
- **HTTP:** `POST {VITE_APPS_SCRIPT_URL}`
- **Payload:** `{ id: 1, status: 'Open' }` (sent as `text/plain`).
- **Usage:** Triggers inside `UserView.tsx` when the agent clicks the tactile toggle button. Uses 'Optimistic UI', instantly turning green/red locally, and gracefully reverting backward with an error toast if the backend fails to apply the change.

---

## 3. Local Environment

To spin up and test the whole flow locally, you must provide `.env.local`:

```
VITE_GOOGLE_SHEET_ID="..."
VITE_APPS_SCRIPT_URL="..."
```

Without the `VITE_APPS_SCRIPT_URL` defined, the frontend application gracefully devolves into Offline Error states rendered natively within the React components, warning the operator to check their connection to `Bubba_DB`.
