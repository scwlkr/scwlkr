# Google Sheets Backend Integration Guide

This document outlines the setup required to use a Google Sheet as the primary database for the Bubba Dashboard using **Google Apps Script**. 

Using a Google Apps Script Web App is the cleanest, serverless method to integrate Google Sheets with a React application without managing complex OAuth flows or dedicated Node backends. It acts as our internal API.

---

## 1. Database Schema Setup

1. Create a new Google Sheet.
2. Rename the first tab to exactly: `Bubba_DB`
3. Add the following column headers exactly in Row 1 (A1:D1):
   - `id`
   - `username`
   - `status`
   - `last_updated`

### Dummy Data

Populate Rows 2-6 with the following initial data:

| id | username     | status | last_updated              |
|----|--------------|--------|---------------------------|
| 1  | User Alpha   | Open   | 2026-02-27T12:00:00.000Z  |
| 2  | User Bravo   | Closed | 2026-02-27T12:00:00.000Z  |
| 3  | User Charlie | Open   | 2026-02-27T12:00:00.000Z  |
| 4  | User Delta   | Closed | 2026-02-27T12:00:00.000Z  |
| 5  | User Echo    | Closed | 2026-02-27T12:00:00.000Z  |

---

## 2. API Logic Deployment (Apps Script)

1. Inside your Google Sheet, click on **Extensions > Apps Script**.
2. Clear the default code and paste the entirety of the `docs/Code.gs` file found in this folder.
3. Save the project (Cmd+S) as "Bubba DB API".
4. Deploy the script:
   - Click the blue **Deploy** button > **New deployment**.
   - Select type: **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone** (*This bypasses complex Auth; rely on the obscure URL as the API Key*).
   - Click **Deploy** and authorize the script when prompted.
5. Copy the generated **Web App URL**. This is your API Endpoint.

---

## 3. Environment Isolation

To ensure sensitive credentials and the Spreadsheet ID remain scoped to the `/bubba-dashboard` folder without polluting `scwlkr.com`'s global config, we use a `.env.local` file inside `bubba-dashboard/`.

Create or edit `bubba-dashboard/.env.local` with your details:

```env
VITE_GOOGLE_SHEET_ID="your_google_spreadsheet_id_here"
VITE_APPS_SCRIPT_URL="your_deployed_web_app_url_here"
```

*Note: `.env.local` is included in `.gitignore` by default in Vite and won't be committed.*

---

## 4. How the Frontend Connects

The frontend `src` logic handles the GET and POST operations via basic Fetch requests wrapped in `try/catch` handlers for timeouts or missing IDs. Because of Google's strict CORS policies, the React app sends `POST` updates using `text/plain` which the API logic in `Code.gs` parses correctly. 

See `src/api/sheetApi.ts` for the implementation wrappers.
