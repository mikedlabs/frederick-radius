const RELEASE_BASE = "https://github.com/protomaps/go-pmtiles/releases/download";
const PROTOMAPS_BUILD_BASE = "https://build.protomaps.com";

export const PROTOMAPS_BUILD_METADATA_URL =
  "https://build-metadata.protomaps.dev/builds.json";

// Protomaps retains the latest build for every patch release after the normal
// one-week daily-build window closes. 4.15.0 is compatible with the v5 style
// package used by Radius, so this remains a dependable last resort when the
// live build index is temporarily unreachable.
export const PROTOMAPS_STABLE_FALLBACK_URL =
  `${PROTOMAPS_BUILD_BASE}/20260722.pmtiles`;

const PLATFORM_ASSETS = {
  "darwin-arm64": {
    archive: (version) => `go-pmtiles-${version}_Darwin_arm64.zip`,
    format: "zip",
  },
  "darwin-x64": {
    archive: (version) => `go-pmtiles-${version}_Darwin_x86_64.zip`,
    format: "zip",
  },
  "linux-arm64": {
    archive: (version) => `go-pmtiles_${version}_Linux_arm64.tar.gz`,
    format: "tar.gz",
  },
  "linux-x64": {
    archive: (version) => `go-pmtiles_${version}_Linux_x86_64.tar.gz`,
    format: "tar.gz",
  },
};

export function resolvePmtilesRelease({ version, platform, arch }) {
  const key = `${platform}-${arch}`;
  const release = PLATFORM_ASSETS[key];
  if (!release) {
    throw new Error(
      `go-pmtiles v${version} has no configured build for ${platform}/${arch}`,
    );
  }
  const archiveName = release.archive(version);
  return {
    archiveName,
    cacheKey: key,
    format: release.format,
    url: `${RELEASE_BASE}/v${version}/${archiveName}`,
  };
}

function enabled(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

export function basemapFailureMustStopBuild(env = process.env) {
  return enabled(env.CI) || enabled(env.VERCEL);
}

function validBuild(build, tilesetMajor) {
  return (
    build &&
    typeof build.key === "string" &&
    /^\d{8}\.pmtiles$/.test(build.key) &&
    typeof build.version === "string" &&
    build.version.startsWith(`${tilesetMajor}.`)
  );
}

export function selectNewestProtomapsBuild(builds, { tilesetMajor = 4 } = {}) {
  if (!Array.isArray(builds)) return null;

  const [newest] = builds
    .filter((build) => validBuild(build, tilesetMajor))
    .toSorted((left, right) => right.key.localeCompare(left.key));

  return newest ? `${PROTOMAPS_BUILD_BASE}/${newest.key}` : null;
}

function validateOverride(value) {
  if (!value) return null;

  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("PROTOMAPS_PLANET_BUILD_URL must use HTTPS");
  }
  return url.toString();
}

export async function resolveProtomapsPlanetBuild({
  env = process.env,
  fetchImpl = globalThis.fetch,
  tilesetMajor = 4,
} = {}) {
  const override = validateOverride(env.PROTOMAPS_PLANET_BUILD_URL?.trim());
  if (override) {
    return { source: "environment override", url: override };
  }

  try {
    const response = await fetchImpl(PROTOMAPS_BUILD_METADATA_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`build index returned HTTP ${response.status}`);
    }

    const url = selectNewestProtomapsBuild(await response.json(), {
      tilesetMajor,
    });
    if (!url) {
      throw new Error(`build index contained no v${tilesetMajor} tileset`);
    }
    return { source: "official build index", url };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      source: `stable fallback; build index unavailable: ${reason}`,
      url: PROTOMAPS_STABLE_FALLBACK_URL,
    };
  }
}
