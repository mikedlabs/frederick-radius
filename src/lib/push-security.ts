import "server-only";

import { ECDH } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isRateLimited,
  isSameOriginMutationRequest,
  isSameOriginRequest,
  readJsonBodyWithLimit,
} from "@/lib/origin-check";

/**
 * Request-facing Web Push security helpers.
 *
 * A PushSubscription endpoint is an opaque bearer capability, but it is also
 * an outbound URL. Never accept an arbitrary HTTPS URL here: doing so turns a
 * future notification into SSRF. The allowlist below covers the browser push
 * services Frederick Radius supports (Chromium/FCM, Firefox/Mozilla,
 * Safari/APNs Web Push, and WNS). Custom/self-hosted providers are rejected on
 * purpose because this public beta has no use case for them.
 *
 * Ownership compatibility note: existing public clients retain only their
 * PushSubscription and several legacy calls send only its endpoint. A newly
 * enforced management token would strand those installed clients unless the
 * settings/follow UI first shipped a token bootstrap and retained it. Until
 * that client migration is deliberately made, endpoint-only calls remain
 * bearer-capability operations. The subscribe route adds the strongest proof
 * available without breaking that contract: an endpoint conflict updates only
 * when the submitted p256dh/auth keys exactly match the stored keys.
 */

export const PUSH_BODY_LIMITS = {
  subscribe: 8 * 1024,
  topics: 4 * 1024,
  prefs: 4 * 1024,
  endpointOnly: 3 * 1024,
} as const;

export const WEB_PUSH_TIMEOUT_MS = 10_000;

const MAX_ENDPOINT_BYTES = 2_048;
const MAX_DEVICE_ID_LENGTH = 128;
const JSON_CONTENT_TYPE = "application/json";

export type ValidatedPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function providerPathIsValid(url: URL): boolean {
  switch (url.hostname) {
    case "fcm.googleapis.com":
      // Chromium moved from /fcm/send/ to /wp/ in 2025. Accept both so
      // subscriptions created before that rollout continue to work.
      return (
        (url.pathname.startsWith("/wp/") && url.pathname.length > 4) ||
        (url.pathname.startsWith("/fcm/send/") && url.pathname.length > 10)
      );
    case "android.googleapis.com":
      // Legacy Chrome/GCM subscriptions can remain installed for a long time.
      return url.pathname.startsWith("/gcm/send/") && url.pathname.length > 10;
    case "updates.push.services.mozilla.com":
    case "push.services.mozilla.com":
      return url.pathname.startsWith("/wpush/") && url.pathname.length > 7;
    case "web.push.apple.com":
      return url.pathname.length > 1;
    default:
      // Microsoft documents the registrable domain as the stable boundary;
      // WNS subdomains are intentionally allowed to change.
      return (
        url.hostname.endsWith(".notify.windows.com") &&
        (url.pathname.length > 1 || url.search.length > 1)
      );
  }
}

/** Validate a provider-issued endpoint without making a DNS request. */
export function isRecognizedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ENDPOINT_BYTES) {
    return false;
  }

  // Compare the raw authority to the parsed hostname. This rejects username /
  // password credentials and every explicit port, including an explicit :443
  // that URL() otherwise normalizes away.
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1];
  if (!authority) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (
    url.protocol !== "https:" ||
    authority !== url.hostname ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hash !== ""
  ) {
    return false;
  }

  return providerPathIsValid(url);
}

function decodeCanonicalBase64Url(value: unknown, expectedBytes: number): Uint8Array | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+={0,2}$/.test(value)
  ) {
    return null;
  }

  const unpadded = value.replace(/=+$/, "");
  // A base64/base64url value can never have a single encoded character in its
  // final quantum. Checking this before Buffer.from avoids permissive decode.
  if (unpadded.length % 4 === 1) return null;

  try {
    const bytes = Buffer.from(unpadded, "base64url");
    if (bytes.length !== expectedBytes || bytes.toString("base64url") !== unpadded) return null;
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Runtime validation for PushSubscription.toJSON(). p256dh is an uncompressed
 * P-256 public key (65 bytes beginning with 0x04); auth is a 16-byte secret.
 */
export function parsePushSubscription(value: unknown): ValidatedPushSubscription | null {
  if (!isJsonObject(value) || !isJsonObject(value.keys)) return null;
  if (!isRecognizedPushEndpoint(value.endpoint)) return null;

  const p256dhBytes = decodeCanonicalBase64Url(value.keys.p256dh, 65);
  const authBytes = decodeCanonicalBase64Url(value.keys.auth, 16);
  if (!p256dhBytes || p256dhBytes[0] !== 0x04 || !authBytes) return null;
  try {
    // Length/prefix alone still admits points that are not on P-256. Node's
    // conversion routine performs the curve-membership validation for us.
    ECDH.convertKey(Buffer.from(p256dhBytes), "prime256v1", undefined, undefined, "uncompressed");
  } catch {
    return null;
  }

  return {
    endpoint: value.endpoint,
    keys: {
      p256dh: value.keys.p256dh as string,
      auth: value.keys.auth as string,
    },
  };
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidDeviceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_DEVICE_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function responseHeaders(init?: ResponseInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  return headers;
}

export function pushJson(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, { ...init, headers: responseHeaders(init) });
}

export function pushEmpty(status = 204, init: ResponseInit = {}): NextResponse {
  return new NextResponse(null, { ...init, status, headers: responseHeaders(init) });
}

export async function guardPushMutation(
  request: Request,
  bucket: string,
  max: number,
  windowSec: number,
): Promise<NextResponse | null> {
  if (!isSameOriginMutationRequest(request)) {
    return pushJson({ error: "Forbidden." }, { status: 403 });
  }
  if (await isRateLimited(request, bucket, max, windowSec)) {
    return pushJson(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(windowSec) } },
    );
  }
  return null;
}

export async function guardPushRead(
  request: Request,
  bucket: string,
  max: number,
  windowSec: number,
): Promise<NextResponse | null> {
  if (!isSameOriginRequest(request)) {
    return pushJson({ error: "Forbidden." }, { status: 403 });
  }
  if (await isRateLimited(request, bucket, max, windowSec)) {
    return pushJson(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(windowSec) } },
    );
  }
  return null;
}

export type PushBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

export async function readPushJson(request: Request, maxBytes: number): Promise<PushBodyResult> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== JSON_CONTENT_TYPE) {
    return {
      ok: false,
      response: pushJson({ error: "Content-Type must be application/json." }, { status: 415 }),
    };
  }

  const parsed = await readJsonBodyWithLimit(request, maxBytes);
  if (!parsed.ok) {
    return {
      ok: false,
      response: pushJson(
        { error: parsed.error === "body-too-large" ? "Request body too large." : "Invalid JSON." },
        { status: parsed.error === "body-too-large" ? 413 : 400 },
      ),
    };
  }

  return { ok: true, value: parsed.value };
}
