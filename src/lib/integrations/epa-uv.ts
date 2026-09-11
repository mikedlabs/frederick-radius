export interface UVIndexData {
  ZIP_CODE: number;
  UV_INDEX: number;
  UV_ALERT: number;
}

/**
 * Fetch the EPA UV Index for Frederick (21701).
 * Caches for 1 hour.
 */
export async function getEPAUVIndex(): Promise<number | null> {
  try {
    const res = await fetch("https://data.epa.gov/efservice/getEnvirofacts/UV/ZIP/21701/JSON", {
      next: { revalidate: 3600 }
    });
    
    if (!res.ok) return null;
    
    const data = await res.json() as UVIndexData[];
    if (data && data.length > 0 && typeof data[0].UV_INDEX === 'number') {
      return data[0].UV_INDEX;
    }
    
    return null;
  } catch (err) {
    console.error("Failed to fetch EPA UV Index:", err);
    return null;
  }
}
