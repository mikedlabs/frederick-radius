const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

export type MapPopupSource = {
  label: string;
  href: string;
  kind:
    | "field"
    | "frederick-county-gis"
    | "mapillary"
    | "maryland-imap"
    | "openstreetmap"
    | "usgs";
};

function osmObjectUrl(id: string): string {
  if (/^(?:node|way|relation)\/\d+$/.test(id)) {
    return `https://www.openstreetmap.org/${id}`;
  }

  const named = id.match(/-(node|way|relation)-(\d+)$/);
  if (named) {
    return `https://www.openstreetmap.org/${named[1]}/${named[2]}`;
  }

  const abbreviated = id.match(/-([nwr])-(\d+)$/);
  if (abbreviated) {
    const objectType =
      abbreviated[1] === "n"
        ? "node"
        : abbreviated[1] === "w"
          ? "way"
          : "relation";
    return `https://www.openstreetmap.org/${objectType}/${abbreviated[2]}`;
  }

  return OSM_COPYRIGHT_URL;
}

export function mapPopupSource(id: string): MapPopupSource {
  if (id.startsWith("fc-park-")) {
    return {
      kind: "frederick-county-gis",
      label: "Frederick County GIS",
      href: "https://fcgis.frederickcountymd.gov/server_pub/rest/services/ParksAndRecreation/Assets/MapServer",
    };
  }

  if (id.startsWith("usgs:")) {
    const site = id.slice("usgs:".length);
    return {
      kind: "usgs",
      label: "U.S. Geological Survey",
      href: `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(site)}/`,
    };
  }

  if (id.startsWith("mdev:")) {
    return {
      kind: "maryland-imap",
      label: "Maryland iMAP",
      href: "https://data.imap.maryland.gov/",
    };
  }

  if (id.startsWith("field:")) {
    return {
      kind: "field",
      label: "Frederick Radius field map",
      href: "/trust",
    };
  }

  if (id.startsWith("mly-")) {
    return {
      kind: "mapillary",
      label: "Mapillary",
      href: "https://www.mapillary.com/",
    };
  }

  return {
    kind: "openstreetmap",
    label: "OpenStreetMap contributors",
    href: osmObjectUrl(id),
  };
}
