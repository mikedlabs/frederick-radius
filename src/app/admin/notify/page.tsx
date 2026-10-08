import type { Metadata } from "next";
import { Send, BellRing } from "lucide-react";
import {
  AdminShell,
  Section,
  SectionLabel,
  Notice,
  EmptyState,
  StatStrip,
  Field,
  TextInput,
  Textarea,
  Select,
  AdminButton,
  Table,
  THead,
  Th,
  TBody,
  Tr,
  Td,
  StatusPill,
} from "@/components/admin/kit";
import { audienceOptions, audienceStats, recentBroadcasts } from "@/lib/push-broadcast";
import { hasCompleteVapidConfiguration } from "@/lib/push";
import { sendBroadcast } from "./actions";

export const metadata: Metadata = {
  title: "Broadcast · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /admin/notify — the owner broadcast composer.
 *
 * Write one notification, pick an audience (everyone, a topic, a town, the
 * followers of a place), see the reach, and send. Every recipient still passes
 * through the shared quiet-hours gate unless the owner marks it urgent. This
 * turns the cron-only fan-out primitive into a real product surface (the map's
 * #1 owner gap). Owner-triggered only; the /admin surface is Basic-Auth gated.
 */
export default async function NotifyPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; held?: string; gone?: string; to?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const vapid = hasCompleteVapidConfiguration();
  const stats = await audienceStats();
  const options = await audienceOptions();
  const history = await recentBroadcasts(12);
  const total = options.find((o) => o.value === "all")?.count ?? 0;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <AdminShell
      eyebrow="Broadcast"
      title="Send a notification"
      intro="Write a push, choose who gets it, and send. It honors each person's quiet hours unless you mark it urgent. Only reaches devices that turned notifications on."
    >
      {sp.sent !== undefined ? (
        <div className="mt-5">
          <Notice tone="positive">
            Sent to {sp.sent} device{sp.sent === "1" ? "" : "s"}
            {sp.to ? ` (${decodeURIComponent(sp.to)})` : ""}
            {Number(sp.held) > 0 ? ` · ${sp.held} held for quiet hours` : ""}
            {Number(sp.gone) > 0 ? ` · ${sp.gone} dead device${sp.gone === "1" ? "" : "s"} pruned` : ""}.
          </Notice>
        </div>
      ) : null}
      {sp.error ? (
        <div className="mt-5">
          <Notice tone="warning">Add a title, a body, and an audience, then send.</Notice>
        </div>
      ) : null}

      <div className="mt-6">
        <StatStrip
          items={[
            { value: stats.total, label: "devices" },
            { value: stats.withQuietHours, label: "quiet hours" },
            { value: stats.withTown, label: "home town" },
            { value: stats.opensPct == null ? "–" : `${stats.opensPct}%`, label: "opens · 30d", tone: stats.opensPct != null ? "positive" : "neutral" },
          ]}
        />
      </div>

      {!vapid ? (
        <EmptyState tone="warning" icon={BellRing}>
          Push is not fully configured on this deployment. All three VAPID values are required, so sends will not leave the app yet.
        </EmptyState>
      ) : total === 0 ? (
        <EmptyState icon={BellRing}>
          No one has turned on notifications yet. Broadcasts will reach devices as testers opt in.
        </EmptyState>
      ) : null}

      <Section title="Compose" description="Keep it short and specific. The title shows bold; the body is one or two lines.">
        <form action={sendBroadcast} className="mt-4 space-y-4">
          <Field label="Title" hint="Up to 80 characters">
            <TextInput name="title" required maxLength={80} placeholder="First Saturday is tonight" />
          </Field>
          <Field label="Body" hint="Up to 300 characters">
            <Textarea name="body" required maxLength={300} rows={3} placeholder="Downtown galleries open late, live music on Market Street from 6." />
          </Field>
          <Field label="Opens" hint="Where the notification takes them (a path on the site)">
            <TextInput name="url" placeholder="/today" defaultValue="/today" />
          </Field>
          <Field label="Audience" hint="Only segments with someone in them are listed">
            <Select name="segment" defaultValue="all">
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.count})
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2.5 text-[13px]" style={{ color: "var(--app-ink-2)" }}>
            <input type="checkbox" name="urgent" className="h-4 w-4" />
            <span>
              Urgent, ignore quiet hours{" "}
              <span style={{ color: "var(--app-ink-3)" }}>(use only for true time-sensitive alerts)</span>
            </span>
          </label>
          <div className="flex items-center gap-3 pt-1">
            <AdminButton variant="primary" type="submit" icon={Send}>
              Send notification
            </AdminButton>
            <span className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
              {total} device{total === 1 ? "" : "s"} enabled in all
            </span>
          </div>
        </form>
      </Section>

      <section className="mt-8">
        <SectionLabel>Recent broadcasts</SectionLabel>
        {history.length === 0 ? (
          <EmptyState>Nothing sent yet.</EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Message</Th>
              <Th align="right">Reached</Th>
              <Th align="right">Opened</Th>
              <Th align="right">When (ET)</Th>
            </THead>
            <TBody>
              {history.map((h, i) => {
                const rate = h.sent_count > 0 ? Math.round((h.open_count / h.sent_count) * 100) : 0;
                return (
                  <Tr key={i}>
                    <Td>
                      <span className="font-semibold" style={{ color: "var(--app-ink)" }}>{h.title}</span>
                      {h.body ? <span className="block text-[12px]" style={{ color: "var(--app-ink-3)" }}>{h.body}</span> : null}
                    </Td>
                    <Td align="right">
                      <StatusPill tone={h.sent_count > 0 ? "positive" : "muted"}>{h.sent_count}</StatusPill>
                    </Td>
                    <Td align="right" tone="muted" nums>
                      {h.open_count}
                      {h.sent_count > 0 ? <span style={{ color: "var(--app-ink-3)" }}> · {rate}%</span> : null}
                    </Td>
                    <Td align="right" tone="muted" nums>{fmt(h.sent_at)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
    </AdminShell>
  );
}
