"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { AdminButton, Field, TextInput } from "@/components/admin/kit";
import { mintCards, type MintResult } from "./actions";

const INITIAL: MintResult = { urls: [] };

/** Build a small CSV (code,url) and hand the browser a download. */
function downloadCsv(urls: string[]): void {
  const rows = ["code,url", ...urls.map((u) => `${u.split("/j/")[1] ?? ""},${u}`)];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = "nfc-cards.csv";
  a.click();
  URL.revokeObjectURL(href);
}

/**
 * MintCards — the one primary action on the cards desk. A native form posts to
 * the mintCards server action; useActionState surfaces the returned tap URLs so
 * the owner can copy them or export a CSV to write onto the physical cards.
 */
export default function MintCards() {
  const [state, formAction, pending] = useActionState(mintCards, INITIAL);

  return (
    <div className="mt-3 space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <Field label="Label" hint="Optional">
            <TextInput type="text" name="label" placeholder="Farmers market table" />
          </Field>
        </div>
        <div className="min-w-[120px]">
          <Field label="Batch" hint="Optional">
            <TextInput type="text" name="batch" placeholder="jul-2026" />
          </Field>
        </div>
        <div className="w-24">
          <Field label="How many">
            <TextInput
              type="number"
              name="count"
              defaultValue={10}
              min={1}
              max={100}
              className="tabular-nums"
            />
          </Field>
        </div>
        <AdminButton type="submit" variant="primary" icon={KeyRound} disabled={pending}>
          {pending ? "Minting" : "Mint cards"}
        </AdminButton>
      </form>

      {state.error ? (
        <p className="text-[12px]" style={{ color: "var(--app-danger)" }}>
          {state.error}
        </p>
      ) : null}

      {state.urls.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[12px]" style={{ color: "var(--app-ink-2)" }}>
            {state.urls.length} {state.urls.length === 1 ? "card" : "cards"} minted. Write these
            onto the cards, then keep the list somewhere safe.
          </p>
          <textarea
            readOnly
            value={state.urls.join("\n")}
            rows={Math.min(state.urls.length + 1, 12)}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-[var(--app-radius-sm)] border p-3 font-mono text-[12px]"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-bg-elevated)",
              color: "var(--app-ink)",
            }}
          />
          <div className="flex flex-wrap gap-2">
            <AdminButton
              type="button"
              variant="ghost"
              onClick={() => void navigator.clipboard?.writeText(state.urls.join("\n"))}
            >
              Copy all
            </AdminButton>
            <AdminButton type="button" variant="ghost" onClick={() => downloadCsv(state.urls)}>
              Download CSV
            </AdminButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
