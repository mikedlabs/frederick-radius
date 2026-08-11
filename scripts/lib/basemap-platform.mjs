const RELEASE_BASE = "https://github.com/protomaps/go-pmtiles/releases/download";

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
