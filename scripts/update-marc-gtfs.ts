import fs from "fs";
import path from "path";
import https from "https";
import { execSync } from "child_process";

const GTFS_URL = "https://mdotmta-gtfs.s3.amazonaws.com/mdotmta_gtfs_marc.zip";

const TMP_DIR = path.join(process.cwd(), "tmp_gtfs");
const OUTPUT_FILE = path.join(process.cwd(), "src/data/marc-schedule.json");

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function parseCSV(filePath: string) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const header = lines[0].split(",").map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let inQuote = false;
    let currentValue = "";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        values.push(currentValue.trim());
        currentValue = "";
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());
    
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = values[i];
    });
    return obj;
  });
}

async function main() {
  console.log("Downloading MARC GTFS...");
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR);
  }
  
  const zipPath = path.join(TMP_DIR, "marc.zip");
  await downloadFile(GTFS_URL, zipPath);
  
  console.log("Unzipping...");
  execSync(`unzip -o ${zipPath} -d ${TMP_DIR}`);
  
  console.log("Parsing routes.txt...");
  const routes = parseCSV(path.join(TMP_DIR, "routes.txt"));
  const brunswickRoute = routes.find(r => r.route_long_name?.toUpperCase().includes("BRUNSWICK"));
  if (!brunswickRoute) throw new Error("Could not find Brunswick line in routes.txt");
  const brunswickRouteId = brunswickRoute.route_id;
  
  console.log("Parsing trips.txt...");
  const trips = parseCSV(path.join(TMP_DIR, "trips.txt"));
  const brunswickTrips = trips.filter(t => t.route_id === brunswickRouteId);
  const validTripIds = new Set(brunswickTrips.map(t => t.trip_id));
  
  console.log("Parsing calendar.txt...");
  const calendar = parseCSV(path.join(TMP_DIR, "calendar.txt"));
  const serviceDays: Record<string, number[]> = {};
  for (const row of calendar) {
    serviceDays[row.service_id] = [
      parseInt(row.monday),
      parseInt(row.tuesday),
      parseInt(row.wednesday),
      parseInt(row.thursday),
      parseInt(row.friday),
      parseInt(row.saturday),
      parseInt(row.sunday)
    ];
  }

  console.log("Parsing stops.txt...");
  const stops = parseCSV(path.join(TMP_DIR, "stops.txt"));
  const frederickStops = stops.filter(s => s.stop_name?.toUpperCase().includes("FREDERICK") || s.stop_name?.toUpperCase().includes("MONOCACY")).map(s => s.stop_id);
  
  console.log("Parsing stop_times.txt...");
  const stopTimes = parseCSV(path.join(TMP_DIR, "stop_times.txt"));
  
  const relevantDepartures: any[] = [];
  
  for (const st of stopTimes) {
    if (frederickStops.includes(st.stop_id) && validTripIds.has(st.trip_id)) {
      const trip = brunswickTrips.find(t => t.trip_id === st.trip_id);
      if (!trip) continue;
      
      const sDays = serviceDays[trip.service_id];
      if (!sDays) continue;
      
      const stopInfo = stops.find(s => s.stop_id === st.stop_id);
      
      const headsign = trip.trip_headsign?.toLowerCase() || "";
      const direction = (headsign.includes("washington") || headsign.includes("union station")) ? "outbound" : "inbound";
      if (direction === "inbound") continue;
      
      relevantDepartures.push({
        stop_id: st.stop_id,
        stop_name: stopInfo?.stop_name,
        departure_time: st.departure_time,
        headsign: trip.trip_headsign,
        service_days: sDays // [mon, tue, wed, thu, fri, sat, sun]
      });
    }
  }
  
  relevantDepartures.sort((a, b) => a.departure_time.localeCompare(b.departure_time));
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    departures: relevantDepartures
  }, null, 2));
  
  console.log(`Saved ${relevantDepartures.length} outbound departures to ${OUTPUT_FILE}`);
  
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

main().catch(console.error);
