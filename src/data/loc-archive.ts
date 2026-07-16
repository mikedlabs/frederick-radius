/**
 * Curated Frederick records from the Library of Congress.
 *
 * This module is deliberately static. Runtime UI must not turn LOC search or
 * OCR into unreviewed copy; refreshes are performed by scripts/audit-loc-archive.ts
 * and every candidate is reviewed before it is added here.
 */

export type LocArchiveKind =
  | "sanborn"
  | "county-map"
  | "habs"
  | "newspaper"
  | "fsa-owi";

export type LocRightsStatus =
  | "public-domain"
  | "no-known-restrictions"
  | "free-to-use";

export type LocCoordinatePrecision =
  | "item"
  | "address"
  | "city-center";

export type LocCoordinates = {
  lat: number;
  lng: number;
  /** `city-center` is coverage context, never an exact historic feature pin. */
  precision: LocCoordinatePrecision;
  sourceUrl?: string;
};

export type LocArchiveLocation = {
  address?: string;
  coordinates?: LocCoordinates;
};

export type LocArchiveImage = {
  url: string;
  /** IIIF image-service identifier without /full/{size}/0/default.jpg. */
  iiifBaseUrl?: string;
  width?: number;
  height?: number;
  alt: string;
};

export type LocArchiveRights = {
  status: LocRightsStatus;
  /** Item- or collection-level LOC advisory, retained verbatim. */
  advisory: string;
};

type LocArchiveRecordBase = {
  id: string;
  kind: LocArchiveKind;
  title: string;
  /** Short editorial description limited to facts visible in official metadata. */
  summary: string;
  dateLabel: string;
  /** Sort year; dateLabel preserves catalog uncertainty and date precision. */
  year: number;
  itemUrl: string;
  sourceUrl: string;
  apiUrl: string;
  image: LocArchiveImage;
  creditLine: string;
  rights: LocArchiveRights;
  reviewedAt: string;
  location?: LocArchiveLocation;
};

export type LocSanbornRecord = LocArchiveRecordBase & {
  kind: "sanborn";
  editionYear: 1887 | 1892 | 1897 | 1904 | 1911 | 1922;
  sheetCount: number;
  manifestUrl: string;
};

export type LocCountyMapRecord = LocArchiveRecordBase & {
  kind: "county-map";
  cartographer: string;
  manifestUrl: string;
};

export type LocHabsRecord = LocArchiveRecordBase & {
  kind: "habs";
  surveyNumber: string;
  address: string;
  photographer: string;
  photoDate: string;
  documentation: {
    photos: number;
    measuredDrawings: number;
    dataPages: number;
  };
};

export type LocNewspaperRecord = LocArchiveRecordBase & {
  kind: "newspaper";
  publication: "The Citizen";
  issueDate: string;
  pageNumber: number;
  featureTitle: string;
  excerpt?: string;
  ocrUrl: string;
  ocrReview: "human-checked" | "metadata-only";
};

export type LocFsaOwiRecord = LocArchiveRecordBase & {
  kind: "fsa-owi";
  photographer: string;
  createdDate: string;
  reproductionNumber: string;
};

export type LocArchiveRecord =
  | LocSanbornRecord
  | LocCountyMapRecord
  | LocHabsRecord
  | LocNewspaperRecord
  | LocFsaOwiRecord;

export type LocArchiveNearbyMatch = {
  record: LocArchiveRecord;
  distanceKm: number;
};

export const LOC_ARCHIVE_REVIEWED_AT = "2026-07-15";

const FREDERICK_COVERAGE: LocArchiveLocation = {
  address: "Frederick, Frederick County, Maryland",
};

const SANBORN_RIGHTS: LocArchiveRights = {
  status: "public-domain",
  advisory:
    "The content of the Library of Congress online Sanborn Maps Collection is in the public domain and is free to use and reuse.",
};

const SANBORN_CREDIT =
  "Library of Congress, Geography and Map Division, Sanborn Maps Collection.";

function sanbornRecord(
  editionYear: LocSanbornRecord["editionYear"],
  month: string,
  itemSuffix: string,
  sheetCount: number,
): LocSanbornRecord {
  const resourceId = `g3844fm.g3844fm_g03603${editionYear}`;
  // LOC's resource page uses the dotted collection-qualified id above, but
  // its IIIF service path takes the underlying filename without that prefix.
  // Reusing resourceId here produced `...:g3844fm:g3844fm.g3844fm_...` and a
  // 404 for every Sanborn preview.
  const iiifResource = `g3844fm_g03603${editionYear}`;
  const iiifBaseUrl =
    `https://tile.loc.gov/image-services/iiif/` +
    `service:gmd:gmd384m:g3844m:g3844fm:${iiifResource}:03603_${editionYear}-0001`;

  return {
    id: `loc-sanborn-frederick-${editionYear}`,
    kind: "sanborn",
    title: "Sanborn Fire Insurance Map from Frederick, Frederick County, Maryland.",
    summary: `The ${month} ${editionYear} Sanborn edition documents Frederick across ${sheetCount} map sheets, including a title and street index sheet.`,
    dateLabel: `${month} ${editionYear}`,
    year: editionYear,
    editionYear,
    sheetCount,
    itemUrl: `https://www.loc.gov/item/sanborn03603_${itemSuffix}/`,
    sourceUrl: `https://www.loc.gov/resource/${resourceId}/`,
    apiUrl: `https://www.loc.gov/item/sanborn03603_${itemSuffix}/?fo=json`,
    manifestUrl: `https://www.loc.gov/item/sanborn03603_${itemSuffix}/manifest.json`,
    image: {
      url: `${iiifBaseUrl}/full/1200,/0/default.jpg`,
      iiifBaseUrl,
      width: 1200,
      alt: `Title and street index sheet from the ${editionYear} Sanborn fire insurance map of Frederick, Maryland`,
    },
    creditLine: SANBORN_CREDIT,
    rights: SANBORN_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: FREDERICK_COVERAGE,
  };
}

export const SANBORN_EDITIONS: readonly LocSanbornRecord[] = [
  sanbornRecord(1887, "August", "001", 16),
  sanbornRecord(1892, "July", "002", 18),
  sanbornRecord(1897, "August", "003", 25),
  sanbornRecord(1904, "September", "004", 27),
  sanbornRecord(1911, "July", "005", 31),
  sanbornRecord(1922, "June", "006", 34),
];

const countyMapIiif =
  "https://tile.loc.gov/image-services/iiif/service:gmd:gmd384:g3843:g3843f:la000292";

export const FREDERICK_COUNTY_LANDOWNER_MAP: LocCountyMapRecord = {
  id: "loc-frederick-county-landowner-map-1858",
  kind: "county-map",
  title:
    "Map of Frederick County, Md. : accurately drawn from correct instrumental surveys of all the county roads &c",
  summary:
    "Isaac Bond's county map names landowners and election districts, traces roads, and includes 25 city and town insets plus population, school, elevation, and road-mileage tables.",
  dateLabel: "1858",
  year: 1858,
  cartographer: "Isaac Bond",
  itemUrl: "https://www.loc.gov/item/2002624018/",
  sourceUrl: "https://www.loc.gov/resource/g3843f.la000292/",
  apiUrl: "https://www.loc.gov/item/2002624018/?fo=json",
  manifestUrl: "https://www.loc.gov/item/2002624018/manifest.json",
  image: {
    url: `${countyMapIiif}/full/1200,/0/default.jpg`,
    iiifBaseUrl: countyMapIiif,
    width: 1200,
    alt: "Hand-colored 1858 landowner map of Frederick County, Maryland, surrounded by town and city insets",
  },
  creditLine: "Library of Congress, Geography and Map Division.",
  rights: {
    status: "free-to-use",
    advisory:
      "The content of the Library of Congress Geography and Map Division digitized collections is free to use and reuse unless a Rights Advisory statement is present that indicates otherwise.",
  },
  reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
  location: { address: "Frederick County, Maryland" },
};

const HABS_RIGHTS: LocArchiveRights = {
  status: "no-known-restrictions",
  advisory:
    "No known restrictions on images made by the U.S. Government; images copied from other sources may be restricted.",
};

export const HABS_RECORDS: readonly LocHabsRecord[] = [
  {
    id: "loc-habs-59-61-south-market",
    kind: "habs",
    title:
      "59-61 South Market Street (Commercial Building), Frederick, Frederick County, MD",
    summary:
      "The survey identifies an early nineteenth-century commercial building, built circa 1816-1821, with Federal fabric and later Victorian Commercial Italianate alterations. Its photographs and data pages document downtown commercial development.",
    dateLabel: "May 1984 photograph; documentation compiled after 1933",
    year: 1984,
    surveyNumber: "HABS MD-902",
    address: "59-61 South Market Street, Frederick, MD",
    photographer: "Harriet Wise",
    photoDate: "1984-05",
    documentation: { photos: 19, measuredDrawings: 0, dataPages: 11 },
    itemUrl: "https://www.loc.gov/item/md0868/",
    sourceUrl: "https://www.loc.gov/resource/hhh.md0868.photos.081653p/",
    apiUrl: "https://www.loc.gov/item/md0868/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/habshaer/md/md0800/md0868/photos/081653pv.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:habshaer:md:md0800:md0868:photos:081653pv",
      width: 1024,
      alt: "Northwest HABS view showing the southeast front elevation of 59-61 South Market Street in Frederick",
    },
    creditLine:
      "Historic American Buildings Survey; Harriet Wise, photographer, May 1984; Library of Congress, Prints and Photographs Division.",
    rights: HABS_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: { address: "59-61 South Market Street, Frederick, MD" },
  },
  {
    id: "loc-habs-st-johns-church-convent",
    kind: "habs",
    title:
      "St. John's Roman Catholic Church & Convent, Second Street, Frederick, Frederick County, MD",
    summary:
      "Two E. H. Pickering photographs made in September 1936 document St. John's Roman Catholic Church and Convent on Second Street.",
    dateLabel: "September 1936 photograph; documentation compiled after 1933",
    year: 1936,
    surveyNumber: "HABS MD-496",
    address: "Second Street, Frederick, MD",
    photographer: "E. H. Pickering",
    photoDate: "1936-09",
    documentation: { photos: 2, measuredDrawings: 0, dataPages: 0 },
    itemUrl: "https://www.loc.gov/item/md0335/",
    sourceUrl: "https://www.loc.gov/resource/hhh.md0335.photos.081639p/",
    apiUrl: "https://www.loc.gov/item/md0335/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/habshaer/md/md0300/md0335/photos/081639pv.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:habshaer:md:md0300:md0335:photos:081639pv",
      width: 1024,
      alt: "September 1936 HABS photograph of St. John's Roman Catholic Church and Convent on Second Street in Frederick",
    },
    creditLine:
      "Historic American Buildings Survey; E. H. Pickering, photographer, September 1936; Library of Congress, Prints and Photographs Division.",
    rights: HABS_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: { address: "Second Street, Frederick, MD" },
  },
  {
    id: "loc-habs-loats-female-orphan-home",
    kind: "habs",
    title:
      "Loat's Female Orphan Home, 24 East Church Street, Frederick, Frederick County, MD",
    summary:
      "Two E. H. Pickering photographs made in September 1936 document the building cataloged as Loat's Female Orphan Home at 24 East Church Street.",
    dateLabel: "September 1936 photograph; documentation compiled after 1933",
    year: 1936,
    surveyNumber: "HABS MD-489",
    address: "24 East Church Street, Frederick, MD",
    photographer: "E. H. Pickering",
    photoDate: "1936-09",
    documentation: { photos: 2, measuredDrawings: 0, dataPages: 0 },
    itemUrl: "https://www.loc.gov/item/md0340/",
    sourceUrl: "https://www.loc.gov/resource/hhh.md0340.photos.081688p/",
    apiUrl: "https://www.loc.gov/item/md0340/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/habshaer/md/md0300/md0340/photos/081688pv.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:habshaer:md:md0300:md0340:photos:081688pv",
      width: 1024,
      alt: "September 1936 HABS photograph of Loat's Female Orphan Home at 24 East Church Street in Frederick",
    },
    creditLine:
      "Historic American Buildings Survey; E. H. Pickering, photographer, September 1936; Library of Congress, Prints and Photographs Division.",
    rights: HABS_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: { address: "24 East Church Street, Frederick, MD" },
  },
  {
    id: "loc-habs-us-post-office-frederick",
    kind: "habs",
    title:
      "U. S. Post Office, 201 East Patrick Street, Frederick, Frederick County, MD",
    summary:
      "The survey documents Frederick's U.S. Post Office, initially built in 1917 and subsequently altered in 1938, through eleven photographs and eight data pages.",
    dateLabel: "June 1981 photograph; documentation compiled after 1933",
    year: 1981,
    surveyNumber: "HABS MD-900",
    address: "201 East Patrick Street, Frederick, MD",
    photographer: "M. E. Warren",
    photoDate: "1981-06",
    documentation: { photos: 11, measuredDrawings: 0, dataPages: 8 },
    itemUrl: "https://www.loc.gov/item/md1017/",
    sourceUrl: "https://www.loc.gov/resource/hhh.md1017.photos.081672p/",
    apiUrl: "https://www.loc.gov/item/md1017/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/habshaer/md/md1000/md1017/photos/081672pv.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:habshaer:md:md1000:md1017:photos:081672pv",
      width: 1024,
      alt: "Northwest HABS view showing the south front and east elevations of the U.S. Post Office on East Patrick Street",
    },
    creditLine:
      "Historic American Buildings Survey; M. E. Warren, photographer, June 1981; Library of Congress, Prints and Photographs Division.",
    rights: HABS_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: { address: "201 East Patrick Street, Frederick, MD" },
  },
  {
    id: "loc-haer-bo-frederick-station",
    kind: "habs",
    title:
      "Baltimore & Ohio Railroad, Frederick Station, Southeast Corner of Market & All Saints Streets, Frederick, Frederick County, MD",
    summary:
      "The HAER survey records Frederick's B&O station, its former passenger canopy, east facade, and a cast-iron canopy column detail.",
    dateLabel: "1970 photograph; documentation compiled after 1968",
    year: 1970,
    surveyNumber: "HAER MD-18",
    address:
      "Southeast corner of Market & All Saints Streets, Frederick, MD",
    photographer: "William E. Barrett",
    photoDate: "1970",
    documentation: { photos: 3, measuredDrawings: 0, dataPages: 0 },
    itemUrl: "https://www.loc.gov/item/md0679/",
    sourceUrl: "https://www.loc.gov/resource/hhh.md0679.photos.081649p/",
    apiUrl: "https://www.loc.gov/item/md0679/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/habshaer/md/md0600/md0679/photos/081649pv.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:habshaer:md:md0600:md0679:photos:081649pv",
      width: 1024,
      alt: "HAER view of the former passenger canopy extending from Frederick's B&O station down All Saints Street",
    },
    creditLine:
      "Historic American Engineering Record; William E. Barrett, photographer, 1970; Library of Congress, Prints and Photographs Division.",
    rights: HABS_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: {
      address:
        "Southeast corner of Market & All Saints Streets, Frederick, MD",
    },
  },
];

const NEWSPAPER_RIGHTS: LocArchiveRights = {
  status: "public-domain",
  advisory:
    "The Library of Congress believes that the newspapers in Chronicling America are in the public domain or have no known copyright restrictions. Newspapers published in the United States more than 95 years ago are in the public domain in their entirety.",
};

const CITIZEN_COVERAGE: LocArchiveLocation = {
  address: "Frederick City, Maryland",
};

export const NEWSPAPER_FEATURES: readonly LocNewspaperRecord[] = [
  {
    id: "loc-citizen-off-the-track-1896-08-28",
    kind: "newspaper",
    title: "The citizen (Frederick City, Md.), August 28, 1896",
    featureTitle: "Off the Track",
    summary:
      "The paper reported that a Frederick and Middletown Electric Railroad car ran uncontrolled down the mountain, injuring or badly shaking about 40 people. The account names Rocky Springs and Braddock Heights while describing the route and response.",
    excerpt: "Serious Accident on the F. & M. Electric Railroad.",
    dateLabel: "August 28, 1896",
    year: 1896,
    publication: "The Citizen",
    issueDate: "1896-08-28",
    pageNumber: 5,
    itemUrl:
      "https://www.loc.gov/item/sn89060092/1896-08-28/ed-1/",
    sourceUrl:
      "https://www.loc.gov/resource/sn89060092/1896-08-28/ed-1/?sp=5&st=text",
    apiUrl:
      "https://www.loc.gov/resource/sn89060092/1896-08-28/ed-1/?fo=json",
    ocrUrl:
      "https://tile.loc.gov/storage-services/service/ndnp/mdu/batch_mdu_frederick_ver03/data/sn89060092/00279521894/1896082801/0283.xml",
    ocrReview: "human-checked",
    image: {
      url: "https://tile.loc.gov/image-services/iiif/service:ndnp:mdu:batch_mdu_frederick_ver03:data:sn89060092:00279521894:1896082801:0283/full/1200,/0/default.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:ndnp:mdu:batch_mdu_frederick_ver03:data:sn89060092:00279521894:1896082801:0283",
      width: 1200,
      alt: "Page five of The Citizen of Frederick, Maryland, dated August 28, 1896, carrying the Off the Track report",
    },
    creditLine:
      "The Citizen. (Frederick, MD), Aug. 28, 1896. Library of Congress, Chronicling America. Image produced by University of Maryland, College Park, MD.",
    rights: NEWSPAPER_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: CITIZEN_COVERAGE,
  },
  {
    id: "loc-citizen-fredericks-claim-1900-03-30",
    kind: "newspaper",
    title: "The citizen (Frederick City, Md.), March 30, 1900",
    featureTitle: "Frederick's Claim",
    summary:
      "The paper reported that Frederick representatives arranged an April 11 congressional hearing for the city's $200,000 war claim, with Milton G. Urner selected as spokesman.",
    excerpt:
      "Local Committee to be Given a Hearing by the Senate and House on April 11th.",
    dateLabel: "March 30, 1900",
    year: 1900,
    publication: "The Citizen",
    issueDate: "1900-03-30",
    pageNumber: 5,
    itemUrl:
      "https://www.loc.gov/item/sn89060092/1900-03-30/ed-1/",
    sourceUrl:
      "https://www.loc.gov/resource/sn89060092/1900-03-30/ed-1/?sp=5&st=text",
    apiUrl:
      "https://www.loc.gov/resource/sn89060092/1900-03-30/ed-1/?fo=json",
    ocrUrl:
      "https://tile.loc.gov/storage-services/service/ndnp/mdu/batch_mdu_frederick_ver03/data/sn89060092/00279521924/1900033001/0117.xml",
    ocrReview: "human-checked",
    image: {
      url: "https://tile.loc.gov/image-services/iiif/service:ndnp:mdu:batch_mdu_frederick_ver03:data:sn89060092:00279521924:1900033001:0117/full/1200,/0/default.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:ndnp:mdu:batch_mdu_frederick_ver03:data:sn89060092:00279521924:1900033001:0117",
      width: 1200,
      alt: "Page five of The Citizen of Frederick, Maryland, dated March 30, 1900, carrying Frederick's Claim",
    },
    creditLine:
      "The Citizen. (Frederick, MD), Mar. 30, 1900. Library of Congress, Chronicling America. Image produced by University of Maryland, College Park, MD.",
    rights: NEWSPAPER_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: CITIZEN_COVERAGE,
  },
  {
    id: "loc-citizen-great-frederick-fair-1911-10-13",
    kind: "newspaper",
    title: "The citizen (Frederick City, Md.), October 13, 1911",
    featureTitle: "The Great Frederick Fair",
    summary:
      "The fair preview described a new grandstand and bandstand, expanded livestock and implement accommodations, and improved dining rooms prepared by the Frederick County Agricultural Society.",
    dateLabel: "October 13, 1911",
    year: 1911,
    publication: "The Citizen",
    issueDate: "1911-10-13",
    pageNumber: 5,
    itemUrl:
      "https://www.loc.gov/item/sn89060092/1911-10-13/ed-1/",
    sourceUrl:
      "https://www.loc.gov/resource/sn89060092/1911-10-13/ed-1/?sp=5&st=text",
    apiUrl:
      "https://www.loc.gov/resource/sn89060092/1911-10-13/ed-1/?fo=json",
    ocrUrl:
      "https://tile.loc.gov/storage-services/service/ndnp/mdu/batch_mdu_galena_ver02/data/sn89060092/00279521808/1911101301/0365.xml",
    ocrReview: "human-checked",
    image: {
      url: "https://tile.loc.gov/image-services/iiif/service:ndnp:mdu:batch_mdu_galena_ver02:data:sn89060092:00279521808:1911101301:0365/full/1200,/0/default.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:ndnp:mdu:batch_mdu_galena_ver02:data:sn89060092:00279521808:1911101301:0365",
      width: 1200,
      alt: "Page five of The Citizen of Frederick, Maryland, dated October 13, 1911, carrying The Great Frederick Fair preview",
    },
    creditLine:
      "The Citizen. (Frederick, MD), Oct. 13, 1911. Library of Congress, Chronicling America. Image produced by University of Maryland, College Park, MD.",
    rights: NEWSPAPER_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: CITIZEN_COVERAGE,
  },
];

const FSA_RIGHTS: LocArchiveRights = {
  status: "public-domain",
  advisory:
    "No known restrictions. For information, see U.S. Farm Security Administration/Office of War Information Black & White Photographs.",
};

const FSA_CREDIT =
  "Library of Congress, Prints & Photographs Division, Farm Security Administration/Office of War Information Black-and-White Negatives.";

export const FSA_OWI_PHOTOS: readonly LocFsaOwiRecord[] = [
  {
    id: "loc-fsa-farm-near-frederick-1940",
    kind: "fsa-owi",
    title: "Farm near Frederick, Maryland",
    summary:
      "Marion Post Wolcott photographed this Frederick-area farm in February 1940 for the federal documentary photography project later held in the FSA/OWI collection.",
    dateLabel: "February 1940",
    year: 1940,
    photographer: "Marion Post Wolcott",
    createdDate: "1940-02",
    reproductionNumber: "LC-USF34-052971-D",
    itemUrl: "https://www.loc.gov/item/2017802229/",
    sourceUrl: "https://www.loc.gov/resource/fsa.8c11387/",
    apiUrl:
      "https://www.loc.gov/item/2017802229/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/fsa/8c11000/8c11300/8c11387v.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:fsa:8c11000:8c11300:8c11387v",
      alt: "Black-and-white 1940 photograph of a farm near Frederick, Maryland",
    },
    creditLine: FSA_CREDIT,
    rights: FSA_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: FREDERICK_COVERAGE,
  },
  {
    id: "loc-fsa-gas-station-frederick-1937",
    kind: "fsa-owi",
    title: "[Untitled photo, possibly related to: Gas station, Frederick, Maryland]",
    summary:
      "John Vachon's November 1937 negative is cataloged as possibly related to a Frederick gas-station photograph; Radius preserves the Library's uncertainty instead of assigning a more specific location.",
    dateLabel: "[November 1937]",
    year: 1937,
    photographer: "John Vachon",
    createdDate: "1937-11",
    reproductionNumber: "LC-USF33-T01-001055-M1; LC-DIG-fsa-8a03015",
    itemUrl: "https://www.loc.gov/item/2017716832/",
    sourceUrl: "https://www.loc.gov/resource/fsa.8a03015/",
    apiUrl:
      "https://www.loc.gov/item/2017716832/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/fsa/8a03000/8a03000/8a03015v.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:fsa:8a03000:8a03000:8a03015v",
      alt: "Black-and-white 1937 photograph cataloged as possibly related to a gas station in Frederick, Maryland",
    },
    creditLine: FSA_CREDIT,
    rights: FSA_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: FREDERICK_COVERAGE,
  },
  {
    id: "loc-fsa-hog-killing-near-frederick-1940",
    kind: "fsa-owi",
    title: "Hog killing time near Frederick, Maryland",
    summary:
      "Marion Post Wolcott photographed hog-killing work near Frederick in February 1940 for the federal documentary photography project.",
    dateLabel: "February 1940",
    year: 1940,
    photographer: "Marion Post Wolcott",
    createdDate: "1940-02",
    reproductionNumber: "LC-USF34-052980-E; LC-DIG-fsa-8c30370",
    itemUrl: "https://www.loc.gov/item/2017802238/",
    sourceUrl: "https://www.loc.gov/resource/fsa.8c30370/",
    apiUrl:
      "https://www.loc.gov/item/2017802238/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/fsa/8c30000/8c30300/8c30370v.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:fsa:8c30000:8c30300:8c30370v",
      alt: "Black-and-white 1940 photograph of hog-killing work near Frederick, Maryland",
    },
    creditLine: FSA_CREDIT,
    rights: FSA_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: FREDERICK_COVERAGE,
  },
  {
    id: "loc-fsa-limestone-quarry-frederick-1941",
    kind: "fsa-owi",
    title: "Workers in limestone quarry near Frederick, Maryland",
    summary:
      "Edwin Rosskam photographed workers in a limestone quarry near Frederick in June 1941 for the FSA/OWI documentary collection.",
    dateLabel: "June 1941",
    year: 1941,
    photographer: "Edwin Rosskam",
    createdDate: "1941-06",
    reproductionNumber: "LC-USF34-012804-D",
    itemUrl: "https://www.loc.gov/item/2017764770/",
    sourceUrl: "https://www.loc.gov/resource/fsa.8b37502/",
    apiUrl:
      "https://www.loc.gov/item/2017764770/?fo=json&at=item,resources",
    image: {
      url: "https://tile.loc.gov/storage-services/service/pnp/fsa/8b37000/8b37500/8b37502v.jpg",
      iiifBaseUrl:
        "https://tile.loc.gov/image-services/iiif/service:pnp:fsa:8b37000:8b37500:8b37502v",
      alt: "Black-and-white 1941 photograph of workers in a limestone quarry near Frederick, Maryland",
    },
    creditLine: FSA_CREDIT,
    rights: FSA_RIGHTS,
    reviewedAt: LOC_ARCHIVE_REVIEWED_AT,
    location: FREDERICK_COVERAGE,
  },
];

export const LOC_ARCHIVE_RECORDS: readonly LocArchiveRecord[] = [
  FREDERICK_COUNTY_LANDOWNER_MAP,
  ...SANBORN_EDITIONS,
  ...HABS_RECORDS,
  ...NEWSPAPER_FEATURES,
  ...FSA_OWI_PHOTOS,
];

export const LOC_ARCHIVE_BY_ID: Readonly<Record<string, LocArchiveRecord>> =
  Object.freeze(
    Object.fromEntries(LOC_ARCHIVE_RECORDS.map((record) => [record.id, record])),
  );

export function getLocArchiveRecord(id: string): LocArchiveRecord | null {
  return LOC_ARCHIVE_BY_ID[id] ?? null;
}

export function getLocArchiveRecordsByKind<K extends LocArchiveKind>(
  kind: K,
): readonly Extract<LocArchiveRecord, { kind: K }>[] {
  return LOC_ARCHIVE_RECORDS.filter(
    (record): record is Extract<LocArchiveRecord, { kind: K }> =>
      record.kind === kind,
  );
}

export function getLocArchiveRecordsForYear(
  year: number,
): readonly LocArchiveRecord[] {
  if (!Number.isInteger(year)) return [];
  return LOC_ARCHIVE_RECORDS.filter((record) => record.year === year);
}

export function getRotatingLocArchiveRecord(
  date: Date,
  records: readonly LocArchiveRecord[] = LOC_ARCHIVE_RECORDS,
): LocArchiveRecord {
  // The curated archive is a compile-time non-empty collection. A caller may
  // still pass an empty filtered pool; falling back keeps daily surfaces safe.
  const pool = records.length > 0 ? records : LOC_ARCHIVE_RECORDS;
  if (Number.isNaN(date.getTime())) return pool[0]!;
  const localDay = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayIndex = Math.floor(localDay / 86_400_000);
  return pool[((dayIndex % pool.length) + pool.length) % pool.length]!;
}

function haversineDistanceKm(a: LocCoordinates, b: LocCoordinates): number {
  const earthRadiusKm = 6371.0088;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const aLat = toRadians(a.lat);
  const bLat = toRadians(b.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function findNearbyLocArchiveRecords(
  origin: Pick<LocCoordinates, "lat" | "lng">,
  radiusKm: number,
  records: readonly LocArchiveRecord[] = LOC_ARCHIVE_RECORDS,
): readonly LocArchiveNearbyMatch[] {
  if (
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    !Number.isFinite(radiusKm) ||
    radiusKm < 0
  ) {
    return [];
  }

  const originPoint: LocCoordinates = {
    ...origin,
    precision: "item",
  };

  return records
    .flatMap((record): LocArchiveNearbyMatch[] => {
      const coordinates = record.location?.coordinates;
      if (!coordinates) return [];
      const distanceKm = haversineDistanceKm(originPoint, coordinates);
      return distanceKm <= radiusKm ? [{ record, distanceKm }] : [];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.record.year - b.record.year);
}

/** Returns the reviewed, display-ready credit line without implying endorsement. */
export function formatLocAttribution(record: LocArchiveRecord): string {
  return record.creditLine;
}

export function getLocArchiveImageUrl(
  record: LocArchiveRecord,
  width = 1200,
): string {
  if (!record.image.iiifBaseUrl) return record.image.url;
  const safeWidth = Math.min(2400, Math.max(200, Math.round(width)));
  return `${record.image.iiifBaseUrl}/full/${safeWidth},/0/default.jpg`;
}
