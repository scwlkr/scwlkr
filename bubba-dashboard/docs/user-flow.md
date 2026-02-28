# Bubba Dashboard - Session Persistence & User Flow

This document details the user flow and behavior regarding session persistence and location switching for the Bubba Dashboard within the `/user` view.

---

## 1. Session Persistence Overview

In order to prevent users (e.g., location managers) from needing to repeatedly type in their location ID every time they navigate to the app, the dashboard uses `localStorage` coupled with URL state.

- **Local Storage Key:** `scwlkr_bubba_current_loc`
- **Value Details:** A numeric string ranging from `1` to `16` representing one of the distinct Bubba locations.

### Flow Breakdown:
1. **First Time Visit:** 
   - User goes to `scwlkr.com/bubba-dashboard/user`.
   - The application checks `scwlkr_bubba_current_loc` in Local Storage and `?loc=X` in the URL.
   - If both are empty, the user is presented with the "Location Login" gate and prompted for an ID (1-16).
   
2. **Successful Authentication:** 
   - Upon entering a valid ID, `scwlkr_bubba_current_loc` is set in local storage.
   - The URL is updated instantly without a page reload to append `?loc=[ID]`.
   - The user proceeds to the `LocationView` where the toggle state is fetched.

3. **Subsequent Visits:** 
   - A user revisits `scwlkr.com/bubba-dashboard/user`.
   - The app reads `scwlkr_bubba_current_loc`, bypasses the login gate naturally, syncs the URL properly (if not bookmarked), and begins fetching the specific location's data immediately.

---

## 2. Bookmarking & URL State

Optionally, users can share or bookmark the URLs.
- A URL like `/bubba-dashboard/user?loc=5` acts as a shortcut.
- When accessed directly, that parameter is consumed, injected into Local Storage, and the specific Location 5 view is spawned regardless of prior session states.

---

## 3. The "Switcher" Component

To facilitate rapid context switching for administrators or managers dealing with multiple stores, the `LocationView` includes an in-app selector.

- **Location:** At the top header of the `/user` view, next to the Location ID, is a minimalist `Change <ChevronDown />` link.
- **Action:** Clicking this expands an elegant, non-intrusive dropdown list populated with all 16 locations. 
- **Execution:** Clicking a location invokes the protected `changeLocation(id)` method from `AuthContext`.
    1. Updates local React state (`loggedInLocationId`).
    2. Overwrites the `scwlkr_bubba_current_loc` value in local storage.
    3. Triggers React Router to navigate silently to the new URL: `?loc=X`. 
    4. Kicks off a React `useEffect` in `LocationView`, momentarily displaying an opaque Loading screen overlaid perfectly on top to block erroneous toggles whilst polling Bubba_DB.

---

## 4. Error Handling & Recovery

If a user connects to a Location ID that does not exist in the Google Database (Bubba_DB), or a session data corruption occurs:
- A stark "Sync Error" toast will present itself under the header.
- The toast includes a simple "Return to login" hyper-text anchor.
- Actioning this link forcefully evicts `scwlkr_bubba_current_loc` from Local Storage and redirects the instance securely back to `/bubba-dashboard/user` to start fresh.
