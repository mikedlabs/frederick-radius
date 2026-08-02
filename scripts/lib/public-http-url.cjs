"use strict";

// One conservative boundary for provider-returned URLs. Source Scout, its
// GitHub issue bridge, and the Tavily adapter all use this module so private
// address and size protections cannot drift between collection and delivery.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isIP } = require("node:net");

const MAX_PUBLIC_HTTP_URL_LENGTH = 2_048;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SPECIAL_USE_HOST_SUFFIXES = [
  ".alt",
  ".arpa",
  ".example",
  ".internal",
  ".invalid",
  ".local",
  ".localhost",
  ".onion",
  ".test",
];

function normalizedHost(host) {
  return host
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isValidDomainName(host) {
  return (
    host.length <= 253 &&
    host.includes(".") &&
    host
      .split(".")
      .every(
        (label) =>
          label.length > 0 &&
          label.length <= 63 &&
          /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  );
}

function isPublicIpv4(host) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first, second, third] = parts;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function parseIpv6Groups(host) {
  if (isIP(host) !== 6) return undefined;
  const halves = host.toLowerCase().split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return undefined;
  const groups = [
    ...head,
    ...Array.from({ length: missing }, () => "0"),
    ...tail,
  ].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every(Number.isFinite)
    ? groups
    : undefined;
}

function isPublicIpv6(host) {
  const groups = parseIpv6Groups(host);
  if (!groups) return false;
  const [first, second] = groups;
  const ipv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (ipv4Mapped) return false;
  return !(
    groups.slice(0, 6).every((group) => group === 0) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x64 && second === 0xff9b) ||
    (first === 0x100 && groups.slice(1, 4).every((group) => group === 0)) ||
    (first === 0x2001 && second === 0) ||
    (first === 0x2001 && second === 2) ||
    (first === 0x2001 && second === 0x0db8) ||
    (first === 0x2001 && (second & 0xfff0) === 0x0010) ||
    (first === 0x2001 && (second & 0xfff0) === 0x0020) ||
    first === 0x2002
  );
}

function normalizePublicHost(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return undefined;
  }
  const host = normalizedHost(value);
  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPublicIpv4(host) ? host : undefined;
  if (ipVersion === 6) return isPublicIpv6(host) ? host : undefined;
  if (
    SPECIAL_USE_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    ) ||
    !isValidDomainName(host)
  ) {
    return undefined;
  }
  return host;
}

function publicHttpUrlDomain(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_PUBLIC_HTTP_URL_LENGTH ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      parsed.href !== value
    ) {
      return undefined;
    }
    return normalizePublicHost(parsed.hostname);
  } catch {
    return undefined;
  }
}

module.exports = {
  MAX_PUBLIC_HTTP_URL_LENGTH,
  normalizePublicHost,
  publicHttpUrlDomain,
};
