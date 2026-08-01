"use client";

import { useCallback, useState } from "react";

/**
 * SubmitForm — the public letter-submission form.
 *
 * The photo of the handwritten letter is the point of the project, so it is the
 * one required field; a signature, a way to reach the sender, and a typed note
 * are all optional. The scan is downscaled in the browser to a JPEG data URL
 * (keeping the upload small and legible) and posted to
 * /api/dear-frederick/submit, which stores it and files a pending submission
 * for the owner to read. Nothing is published from here, and the confirmation
 * copy says so plainly.
 */

/** Shrink the chosen image to a reasonable width and re-encode as JPEG so the
 *  upload stays small while the handwriting stays readable. */
async function downscale(
  file: File,
  maxDim = 2000,
  quality = 0.82,
): Promise<string> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}

export default function SubmitForm() {
  const [image, setImage] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [publicationConsent, setPublicationConsent] = useState(false);
  const [reading, setReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onPickPhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      setImage(await downscale(file));
    } catch {
      setError(
        "We could not read that photo. Please try another image of the letter.",
      );
    } finally {
      setReading(false);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!image) {
      setError("Please add a photo of your letter first.");
      return;
    }
    if (!publicationConsent) {
      setError(
        "Please confirm that you have permission to share and publish this letter.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/dear-frederick/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          publicationConsent,
          signature: signature.trim() || undefined,
          contact: contact.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      if (res.status === 413) {
        setError(
          "That image is a little too large. Please try a smaller photo.",
        );
        return;
      }
      if (res.status === 429) {
        setError(
          "That is a lot of submissions at once. Please try again in a little while.",
        );
        return;
      }
      if (res.status === 503) {
        setError(
          "Submissions are not set up on this deployment yet. Please try again later.",
        );
        return;
      }
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (d.error === "scan-invalid" || d.error === "scan-bad-dimensions") {
        setError(
          "We could not read that as a photo. Please try another image of the letter.",
        );
        return;
      }
      setError(
        `Something went wrong (${d.error ?? res.status}). Please try again.`,
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        className="rounded-[var(--app-radius-md)] border p-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--app-positive) 28%, var(--app-border))",
          background:
            "color-mix(in srgb, var(--app-positive) 6%, var(--app-bg-elevated))",
        }}
      >
        <h2
          className="font-serif text-[18px] font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          Your letter is in.
        </h2>
        <p
          className="mt-1.5 text-[13.5px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Thank you for sending this. We read every letter that arrives, and if
          yours is a fit for the wall you will see it there. We add letters by
          hand, so it can take a little while.
        </p>
      </div>
    );
  }

  const labelCls = "block font-mono text-[11px] uppercase tracking-[0.08em]";
  const controlCls =
    "mt-1 w-full rounded-[var(--app-radius-sm)] border px-3 py-2.5 text-[16px]";
  const controlStyle = {
    borderColor: "var(--app-control-border, var(--app-border))",
    background: "var(--app-bg-elevated)",
    color: "var(--app-ink)",
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-[var(--app-radius-md)] border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-bg-elevated)",
      }}
    >
      <div>
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>
          Photo of your letter
        </span>
        <label
          className="tap-44 mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-[var(--app-radius-sm)] border border-dashed px-3 py-4 text-[14px] font-semibold"
          style={{
            borderColor: "var(--app-control-border, var(--app-border))",
            color: "var(--app-ink-2)",
          }}
        >
          <span aria-hidden>{"\u{1F4F7}"}</span>
          <span>{image ? "Choose a different photo" : "Add a photo"}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPickPhoto(e.target.files?.[0])}
          />
        </label>
        {reading ? (
          <span
            className="mt-1 block text-[11px]"
            style={{ color: "var(--app-ink-3)" }}
          >
            Reading your photo.
          </span>
        ) : null}
        {image ? (
          <div
            className="mt-2 overflow-hidden rounded-[var(--app-radius-sm)] border bg-white p-2"
            style={{ borderColor: "var(--app-border)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local capture preview (data URL) */}
            <img
              src={image}
              alt="Your letter, as you photographed it"
              className="mx-auto max-h-64 w-auto rounded-[3px]"
            />
          </div>
        ) : (
          <span
            className="mt-1 block text-[11px] leading-relaxed"
            style={{ color: "var(--app-ink-3)" }}
          >
            A clear photo of the whole page is all we need. We transcribe the
            words by hand.
          </span>
        )}
      </div>

      <label className="block">
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>
          How to sign it
        </span>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          maxLength={120}
          placeholder="Anonymous"
          className={controlCls}
          style={controlStyle}
        />
        <span
          className="mt-1 block text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          Leave this blank to stay anonymous.
        </span>
      </label>

      <label
        className="flex cursor-pointer items-start gap-3 rounded-[var(--app-radius-sm)] border p-3"
        style={{ borderColor: "var(--app-control-border, var(--app-border))" }}
      >
        <input
          type="checkbox"
          checked={publicationConsent}
          onChange={(event) => setPublicationConsent(event.target.checked)}
          required
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--app-brand-press)]"
        />
        <span
          className="text-[12.5px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          I wrote this letter or have permission to share it. Frederick Radius
          may store, review, transcribe, edit for clarity or safety, and publish
          the letter and its image. My contact information stays private, and I
          can ask for removal. See the{" "}
          <a
            href="/terms"
            className="font-semibold underline underline-offset-2"
          >
            terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="font-semibold underline underline-offset-2"
          >
            privacy policy
          </a>
          .
        </span>
      </label>

      <label className="block">
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>
          Email or phone
        </span>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
          placeholder="Only if you want us to reach you"
          className={controlCls}
          style={controlStyle}
        />
        <span
          className="mt-1 block text-[11px]"
          style={{ color: "var(--app-ink-3)" }}
        >
          This is only used to reach you about your letter. It never shows on
          the site.
        </span>
      </label>

      <label className="block">
        <span className={labelCls} style={{ color: "var(--app-ink-3)" }}>
          Anything to add
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="A typed version of your letter, or a note for us. This is optional."
          className={controlCls}
          style={controlStyle}
        />
      </label>

      {error ? (
        <p
          className="text-[12.5px] font-medium"
          style={{ color: "var(--app-danger)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || reading || !publicationConsent}
        className="tap-44 w-full rounded-[var(--app-radius-md)] py-2.5 text-[14px] font-semibold disabled:opacity-50"
        style={{
          background: "var(--app-brand-press)",
          color: "var(--app-on-brand, #fff)",
        }}
      >
        {submitting ? "Sending your letter" : "Send your letter"}
      </button>
    </form>
  );
}
