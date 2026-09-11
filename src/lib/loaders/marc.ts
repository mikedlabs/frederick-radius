import schedule from "@/data/marc-schedule.json";

export interface MarcDeparture {
  stop_id: string;
  stop_name: string;
  departure_time: string; // HH:MM:SS
  headsign: string;
  service_days: number[]; // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
}

/**
 * Returns the next N departures for a given stop from right now.
 */
export function getNextMarcDepartures(stopIdOrName: string, limit: number = 3): MarcDeparture[] {
  const departures = schedule.departures as MarcDeparture[];
  
  // Find matching stops
  const matchingStops = departures.filter(d => 
    d.stop_id === stopIdOrName || 
    d.stop_name.toLowerCase().includes(stopIdOrName.toLowerCase())
  );

  const now = new Date();
  // Ensure we are comparing in NY time, since the server might be UTC
  const nyTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).format(now);
  
  // Extract hour and minute correctly from Int/DateTimeFormat since it returns something like "24:00" or "14:00"
  // Wait, hour12: false can return "24:xx" for midnight. Better to use standard Date in NY zone.
  
  const nyDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const jsDay = nyDate.getDay(); // 0 is Sunday
  const todayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const tomorrowIndex = (todayIndex + 1) % 7;
  
  const currentHour = nyDate.getHours();
  const currentMinute = nyDate.getMinutes();
  const currentTimeStr = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}:00`;
  
  const upcoming: MarcDeparture[] = [];
  
  // Check today's remaining departures
  for (const d of matchingStops) {
    if (d.service_days[todayIndex] === 1 && d.departure_time >= currentTimeStr) {
      upcoming.push(d);
    }
  }
  
  // If we don't have enough, check tomorrow's departures
  if (upcoming.length < limit) {
    for (const d of matchingStops) {
      if (d.service_days[tomorrowIndex] === 1) {
        upcoming.push(d);
      }
    }
  }
  
  return upcoming.slice(0, limit);
}
