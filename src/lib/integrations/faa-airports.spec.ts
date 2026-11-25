import { describe, expect, it } from "vitest";
import { AIRPORT_STATE_LABEL, parseAreaAirportReport } from "./faa-airports";

const at = Date.parse("2026-11-24T16:00:00Z");
const timestamp = "Tue Nov 24 15:55:36 2026 GMT";
const envelope = (sections = "", updated = timestamp) =>
  `<AIRPORT_STATUS_INFORMATION><Update_Time>${updated}</Update_Time><Dtd_File>http://www.fly.faa.gov/AirportStatus.dtd</Dtd_File>${sections}</AIRPORT_STATUS_INFORMATION>`;
const section = (name: string, list: string, items: string) =>
  `<Delay_type><Name>${name}</Name><${list}>${items}</${list}></Delay_type>`;

describe("FAA regional airport reports", () => {
  it("dates a valid quiet report and limits its meaning to the FAA notice list", () => {
    const report = parseAreaAirportReport(envelope(), at);
    expect(report?.updatedAt).toBe("2026-11-24T15:55:36.000Z");
    expect(report?.airports.map(({ code, state }) => [code, AIRPORT_STATE_LABEL[state]])).toEqual([
      ["BWI", "No FAA notice listed"], ["IAD", "No FAA notice listed"], ["DCA", "No FAA notice listed"],
    ]);
  });

  it("keeps details inside their airport, including nested arrival and departure times", () => {
    const delays = section("General Arrival/Departure Delay Info", "Arrival_Departure_Delay_List", [
      "<Delay><ARPT>BWI</ARPT></Delay>",
      '<Delay><ARPT>IAD</ARPT><Reason>WX:Wind</Reason><Arrival_Departure Type="Arrival"><Min>15 minutes</Min><Max>30 minutes</Max></Arrival_Departure><Arrival_Departure Type="Departure"><Max>10 minutes</Max></Arrival_Departure></Delay>',
    ].join(""));
    const ground = section("Ground Delay Programs", "Ground_Delay_List",
      "<Ground_Delay><ARPT>DCA</ARPT><Avg>45 minutes</Avg><Reason>Heavy volume</Reason></Ground_Delay>");
    expect(parseAreaAirportReport(envelope(delays + ground), at)?.airports).toMatchObject([
      { code: "BWI", state: "delay", detail: undefined },
      { code: "IAD", state: "delay", detail: "Arrivals 15 minutes–30 minutes · Departures 10 minutes · Wind" },
      { code: "DCA", state: "delay", detail: "45 minutes avg · Heavy volume" },
    ]);
  });

  it("labels a restricted closure as a notice and preserves the stronger report for each airport", () => {
    const stop = section("Ground Stop Programs", "Ground_Stop_List",
      "<Program><ARPT>IAD</ARPT><Reason>Airport volume</Reason></Program><Program><ARPT>DCA</ARPT></Program>");
    const closure = section("Airport Closures", "Airport_Closure_List",
      "<Airport><ARPT>DCA</ARPT><Reason>Prior permission required for some operations</Reason></Airport>");
    const report = parseAreaAirportReport(envelope(closure + stop), at);
    expect(report?.airports[1]).toMatchObject({ state: "ground_stop", detail: "Airport volume" });
    expect(report?.airports[2]).toMatchObject({ state: "closure" });
    expect(AIRPORT_STATE_LABEL.closure).toBe("Closure notice");
  });

  it.each([
    ["stale", envelope("", "Tue Nov 24 15:00:00 2026 GMT")],
    ["future", envelope("", "Tue Nov 24 17:00:00 2026 GMT")],
    ["undated", envelope("", "")],
    ["invalid timestamp", envelope("", "today GMT")],
    ["missing time zone", envelope("", "Tue Nov 24 15:55:36 2026")],
    ["truncated", envelope().slice(0, -10)],
    ["wrong root", "<html>AIRPORT_STATUS_INFORMATION</html>"],
    ["missing empty feed envelope", `<AIRPORT_STATUS_INFORMATION><Update_Time>${timestamp}</Update_Time></AIRPORT_STATUS_INFORMATION>`],
    ["missing section", envelope("<Delay_type/>")],
    ["unknown section", envelope(section("Not a recognized report", "Other", "<Item/>"))],
    ["unexpected item", envelope(section("Airport Closures", "Airport_Closure_List", "<WrongItem><ARPT>BWI</ARPT></WrongItem>"))],
    ["empty airport record", envelope(section("Airport Closures", "Airport_Closure_List", "<Airport/>"))],
    ["missing airport", envelope(section("Airport Closures", "Airport_Closure_List", "<Airport><Reason>Unassigned</Reason></Airport>"))],
  ])("leaves status unavailable for a %s response", (_name, xml) => {
    expect(parseAreaAirportReport(xml, at)).toBeNull();
  });
});
