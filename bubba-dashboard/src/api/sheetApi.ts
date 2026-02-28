export interface UserRow {
    id: number;
    username: string;
    status: string;
    last_updated: string;
}

/**
 * The Web App URL deployed via Google Apps Script. 
 * Ensure this is populated in your `bubba-dashboard/.env.local`
 */
const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

/**
 * Fetches all user rows from the Bubba_DB Google Sheet
 */
export const fetchAllUsers = async (): Promise<UserRow[]> => {
    if (!API_URL) throw new Error("API URL is missing in .env.local");

    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        return data.data as UserRow[];
    } catch (error) {
        console.error("Error fetching all users:", error);
        throw error;
    }
}

/**
 * Fetches a single user row from the Bubba_DB Google Sheet by their numeric ID
 */
export const fetchUserStatus = async (id: number): Promise<UserRow | null> => {
    if (!API_URL) throw new Error("API URL is missing in .env.local");

    try {
        const res = await fetch(`${API_URL}?id=${id}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        if (data.status === 404 || !data.data) return null;
        return data.data as UserRow;
    } catch (error) {
        console.error(`Error fetching user ${id}:`, error);
        throw error;
    }
}

/**
 * Toggles a user's status by sending a POST update to the Apps Script endpoint.
 * Content-Type is set to text/plain to bypass Apps Script's strict CORS preflight requirements.
 */
export const toggleUserStatus = async (id: number, status: 'Open' | 'Closed'): Promise<boolean> => {
    if (!API_URL) throw new Error("API URL is missing in .env.local");

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ id, status }),
            headers: {
                "Content-Type": "text/plain",
            }
        });

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        return data.success;
    } catch (error) {
        console.error(`Error toggling status for user ${id}:`, error);
        throw error;
    }
}
