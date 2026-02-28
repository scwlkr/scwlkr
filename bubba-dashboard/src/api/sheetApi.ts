export interface LocationRow {
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
 * Fetches all location rows from the Bubba_DB Google Sheet
 */
export const fetchAllLocations = async (): Promise<LocationRow[]> => {
    if (!API_URL) throw new Error("API URL is missing in .env.local");

    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        return data.data as LocationRow[];
    } catch (error) {
        console.error("Error fetching all locations:", error);
        throw error;
    }
}

/**
 * Fetches a single location row from the Bubba_DB Google Sheet by its numeric ID
 */
export const fetchLocationStatus = async (id: number): Promise<LocationRow | null> => {
    if (!API_URL) throw new Error("API URL is missing in .env.local");

    try {
        const res = await fetch(`${API_URL}?id=${id}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const data = await res.json();
        if (data.status === 404 || !data.data) return null;
        return data.data as LocationRow;
    } catch (error) {
        console.error(`Error fetching location ${id}:`, error);
        throw error;
    }
}

/**
 * Toggles a location's status by sending a POST update to the Apps Script endpoint.
 * Content-Type is set to text/plain to bypass Apps Script's strict CORS preflight requirements.
 */
export const toggleLocationStatus = async (id: number, status: 'Open' | 'Closed'): Promise<boolean> => {
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
        console.error(`Error toggling status for location ${id}:`, error);
        throw error;
    }
}
