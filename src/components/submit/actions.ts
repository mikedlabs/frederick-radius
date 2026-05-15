"use server";

export type SubmitPlaceInput = {
  name: string;
  category: string;
  address: string;
  municipality: string;
  website: string;
  phone: string;
  description: string;
  submitter_email: string;
  submitter_name: string;
  is_owner: boolean;
};

export type SubmitEventInput = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  address: string;
  municipality: string;
  category: string;
  is_free: boolean;
  price_text: string;
  ticket_url: string;
  organizer: string;
  submitter_email: string;
  submitter_name: string;
};

/**
 * For now we just log to the server console + return a token. Once Neon DB
 * is wired, this writes to a "submissions" table that the /admin queue
 * displays. Once Resend is wired, this also fires a notification email to
 * the admin.
 */
async function persistSubmission(type: "place" | "event", payload: object): Promise<string> {
  const token = crypto.randomUUID();
   
  console.log("[submission]", type, token, JSON.stringify(payload));
  // Fire-and-forget admin notification when Resend is configured.
  await maybeSendAdminEmail(type, payload);
  return token;
}

async function maybeSendAdminEmail(type: "place" | "event", payload: object) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL ?? "hello@frederickradius.app";
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Frederick Radius <submissions@frederickradius.app>",
        to,
        subject: `New ${type} submission`,
        text: JSON.stringify(payload, null, 2),
      }),
    });
  } catch {
    /* swallow */
  }
}

export async function submitPlaceAction(input: SubmitPlaceInput): Promise<{ token: string }> {
  if (!input.name || !input.category || !input.submitter_email) {
    throw new Error("Name, category, and email are required.");
  }
  const token = await persistSubmission("place", input);
  return { token };
}

export async function submitEventAction(input: SubmitEventInput): Promise<{ token: string }> {
  if (!input.title || !input.starts_at || !input.submitter_email) {
    throw new Error("Title, start time, and email are required.");
  }
  const token = await persistSubmission("event", input);
  return { token };
}
