"use client";

import { ArrowLeft, ArrowUpRight, Bookmark, Check, ChevronRight, ExternalLink, Search, Share2, ShoppingBag, Store, UtensilsCrossed, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import BottomDrawer from "@/components/ui/BottomDrawer";
import { Button } from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import type { FairVendorProfile } from "@/data/fair/great-frederick-fair-2026-vendors";
import { FAIR_DAY_PATH } from "@/lib/fair/plan-status";
import { fairVendorDirectoryHref } from "@/lib/fair/vendor-finder";
import { searchFairVendors } from "@/lib/fair/vendor-discovery";

export type FairVendorExplorerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: readonly FairVendorProfile[];
  selectedVendorId: string | null;
  onSelectVendor: (vendorId: string | null) => void;
  initialQuery?: string;
  savedVendorIds: readonly string[];
  onToggleVendor: (vendor: FairVendorProfile) => void;
};

type VendorFilter = "all" | "saved" | FairVendorProfile["kind"];
const CATEGORY_LABELS: Record<FairVendorProfile["kind"], string> = {
  food: "Food & drink",
  retail: "Shopping",
  exhibit: "Exhibits",
  service: "Services",
  other: "More vendors",
};

/** Construct from the public route, never from a visitor's current query string. */
export function fairVendorShareUrl(origin: string, vendorId: string): string {
  const url = new URL(FAIR_DAY_PATH, origin);
  url.searchParams.set("vendor", vendorId);
  url.hash = "fair-map";
  return url.toString();
}

export function filterFairVendors(vendors: readonly FairVendorProfile[], query: string, filter: VendorFilter, savedIds: readonly string[]): FairVendorProfile[] {
  return searchFairVendors(vendors, query).filter((vendor) => {
    if (filter === "saved" && !savedIds.includes(vendor.id)) return false;
    if (filter !== "all" && filter !== "saved" && filter !== vendor.kind) return false;
    return true;
  });
}

function VendorIcon({ kind, className }: { kind: FairVendorProfile["kind"]; className: string }) {
  const Icon = kind === "food" ? UtensilsCrossed : kind === "retail" ? ShoppingBag : Store;
  return <Icon className={className} aria-hidden />;
}

function VendorShareAction({ vendor }: { vendor: FairVendorProfile }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const share = async () => {
    const url = fairVendorShareUrl(window.location.origin, vendor.id);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${vendor.name} at the Fair`, text: `Find ${vendor.name} in the Frederick Radius Fair guide.`, url });
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Vendor link copied.");
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt("Copy this Fair vendor link:", url);
    }
  };

  return <>
    <Button variant="quiet" onClick={share} iconLeft={copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />} aria-label={`Share ${vendor.name}`}>
      {copied ? "Copied" : "Share"}
    </Button>
    <span className="sr-only" role="status">{copied ? "Vendor link copied." : ""}</span>
  </>;
}

function VendorSaveAction({ vendor, saved, onToggle }: { vendor: FairVendorProfile; saved: boolean; onToggle: (vendor: FairVendorProfile) => void }) {
  return <Button variant={saved ? "secondary" : "primary"} onClick={() => onToggle(vendor)} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} ${vendor.name} ${saved ? "from" : "to"} My Day`} iconLeft={saved ? <Check className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}>
    {saved ? "Saved to My Day" : "Save to My Day"}
  </Button>;
}

export default function FairVendorExplorer({ open, onOpenChange, vendors, selectedVendorId, onSelectVendor, initialQuery, savedVendorIds, onToggleVendor }: FairVendorExplorerProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [filter, setFilter] = useState<VendorFilter>("all");
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [appliedRequest, setAppliedRequest] = useState({ open, initialQuery });
  const resultOpenerId = useRef<string | null>(null);
  const selected = vendors.find((vendor) => vendor.id === selectedVendorId) ?? null;
  const filtered = filterFairVendors(vendors, query, filter, savedVendorIds);
  const categories = (Object.keys(CATEGORY_LABELS) as FairVendorProfile["kind"][]).filter((kind) => vendors.some((vendor) => vendor.kind === kind));

  // A fresh search handoff resets the explorer; closing a detail keeps its filters.
  if (appliedRequest.open !== open || appliedRequest.initialQuery !== initialQuery) {
    setAppliedRequest({ open, initialQuery });
    if (open && initialQuery !== undefined) {
      setQuery(initialQuery);
      setFilter("all");
    }
  }

  useEffect(() => {
    if (!open || !selectedVendorId) return;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedVendorId]);

  const backToResults = () => {
    onSelectVendor(null);
    window.requestAnimationFrame(() => {
      const opener = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-fair-vendor-result]")).find((button) => button.dataset.fairVendorResult === resultOpenerId.current);
      // The result may have been filtered out while it was selected.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      else document.getElementById("fair-vendor-query")?.focus({ preventScroll: true });
    });
  };

  return (
    <BottomDrawer open={open} onOpenChange={onOpenChange} surface="solid" title="Food & vendors" subtitle="Explore reviewed Fair stops and keep your favorites in My Day.">
      <div className="min-h-full bg-[var(--app-bg-elevated-solid)]">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-7" data-fair-vendor-explorer>
        {selectedVendorId ? selected ? (
          <article data-fair-vendor-detail={selected.id}>
            <Button variant="quiet" className="-ml-3 mb-4" onClick={backToResults} iconLeft={<ArrowLeft className="h-4 w-4" aria-hidden />}>Back to vendors</Button>
            <div className="grid gap-7 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-10">
              <div>
                <div className="mb-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--app-brand-press)]">
                  <VendorIcon kind={selected.kind} className="h-5 w-5" />
                  {CATEGORY_LABELS[selected.kind]}
                </div>
                <h2 ref={headingRef} tabIndex={-1} className="max-w-[20ch] text-[clamp(30px,5vw,48px)] font-extrabold leading-[1.06] tracking-[-0.04em] outline-none">{selected.name}</h2>
                <p className="mt-4 max-w-prose text-[16px] leading-relaxed text-[var(--app-ink-2)]">{selected.summary}</p>
                {selected.highlights.length > 0 ? <ul className="mt-5 space-y-2.5 text-[14px] leading-relaxed">
                  {selected.highlights.map((highlight) => <li key={highlight} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-[var(--app-brand-press)]" aria-hidden /><span>{highlight}</span></li>)}
                </ul> : null}
                <p className="mt-3 text-[12px] leading-relaxed text-[var(--app-ink-3)]">The vendor’s regular offerings are shown for context. Fair menus and availability may differ.</p>
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <VendorSaveAction vendor={selected} saved={savedVendorIds.includes(selected.id)} onToggle={onToggleVendor} />
                  <VendorShareAction key={selected.id} vendor={selected} />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--app-ink-3)]">Saved for your selected Fair day. No visit time is assigned.</p>
              </div>
              <div className="border-t pt-5 md:border-l md:border-t-0 md:pl-7 md:pt-0" style={{ borderColor: "var(--app-border)" }}>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--app-ink-3)]">Find them at the Fair</h3>
                <p className="mt-2 break-words text-[20px] font-bold tracking-tight">{selected.booth.status === "known" ? `Booth reference: ${selected.booth.value}` : "Booth location not confirmed"}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--app-ink-2)]">{selected.booth.status === "known" ? "Use this booth reference in the Fair’s official vendor guide. It is not an exact map pin." : selected.booth.reason}</p>
                <a href={selected.directoryUrl} target="_blank" rel="noopener noreferrer" className="tap-44 mt-2 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-[var(--app-cool)]">Open official booth guide <ArrowUpRight className="h-4 w-4" aria-hidden /></a>
                {selected.operatingHours.status === "known" ? <p className="mt-4 text-[13px] leading-relaxed text-[var(--app-ink-2)]">Published hours: {selected.operatingHours.value}</p> : <p className="mt-4 text-[13px] leading-relaxed text-[var(--app-ink-3)]">Vendor hours are not confirmed. Check with the vendor before making a special trip.</p>}
                {selected.menuUrl || selected.websiteUrl ? <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                  {selected.menuUrl ? <a href={selected.menuUrl} target="_blank" rel="noopener noreferrer" className="tap-44 flex min-h-11 items-center justify-between gap-3 text-[14px] font-bold text-[var(--app-brand-press)]">{selected.menuLabel ?? "Vendor menu"}<ExternalLink className="h-4 w-4 shrink-0" aria-hidden /></a> : null}
                  {selected.websiteUrl && selected.websiteUrl !== selected.menuUrl ? <a href={selected.websiteUrl} target="_blank" rel="noopener noreferrer" className="tap-44 flex min-h-11 items-center justify-between gap-3 text-[14px] font-semibold text-[var(--app-ink-2)]">Vendor website<ExternalLink className="h-4 w-4 shrink-0" aria-hidden /></a> : null}
                </div> : null}
                <details className="mt-5 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
                  <summary className="tap-44 flex min-h-11 cursor-pointer items-center text-[12px] font-semibold text-[var(--app-ink-3)]">Sources & review dates</summary>
                  <ul className="space-y-2 text-[12px] text-[var(--app-ink-3)]">{selected.provenance.map((source) => <li key={`${source.sourceUrl}-${source.verifiedAt}`}><a className="tap-44 flex min-h-11 flex-col justify-center py-1 text-[var(--app-cool)]" href={source.sourceUrl} target="_blank" rel="noopener noreferrer"><span className="font-semibold">{source.publisher}: {source.sourceTitle}</span><span className="mt-0.5 text-[var(--app-ink-3)]">Reviewed {new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(new Date(source.verifiedAt))}</span></a></li>)}</ul>
                </details>
              </div>
            </div>
          </article>
        ) : <div role="status"><h2 className="text-[24px] font-bold">This vendor is not in the reviewed guide.</h2><p className="mt-2 text-[14px] text-[var(--app-ink-2)]">The saved link may be out of date. The Fair’s official directory has the wider vendor list.</p><Button className="mt-4" variant="secondary" onClick={backToResults}>Browse reviewed vendors</Button></div> : (
          <>
            <div className="mb-5 flex items-start justify-between gap-5">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-brand-press)]">Along the way</p><h2 className="mt-1 text-[30px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[38px]">Find your next Fair stop.</h2><p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[var(--app-ink-2)]">Browse this reviewed selection of vendors. Save a stop for your day or send someone a direct link.</p></div>
              <UtensilsCrossed className="mt-2 hidden h-9 w-9 shrink-0 text-[var(--app-brand-press)] sm:block" aria-hidden />
            </div>
            <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-[var(--app-ink-3)]" aria-hidden /><label className="sr-only" htmlFor="fair-vendor-query">Search Fair vendors</label><input id="fair-vendor-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Rad Pies, ice cream, or a booth number" className="h-12 w-full rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated-solid)] pl-11 pr-12 text-[16px] outline-none focus:ring-2 focus:ring-[var(--app-brand)]" style={{ borderColor: "var(--app-control-border)" }} />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear vendor search" className="tap-44 absolute right-0.5 top-0.5 grid h-11 w-11 place-items-center text-[var(--app-ink-3)]"><X className="h-4 w-4" aria-hidden /></button> : null}</div>
            <div role="group" aria-label="Vendor categories" className="mt-3 flex flex-wrap gap-2">
              <Pill active={filter === "all"} onClick={() => setFilter("all")}>Browse all</Pill>
              {categories.map((kind) => <Pill key={kind} active={filter === kind} onClick={() => setFilter(kind)}>{CATEGORY_LABELS[kind]}</Pill>)}
              <Pill active={filter === "saved"} icon={<Bookmark className="h-3.5 w-3.5" aria-hidden />} onClick={() => setFilter("saved")}>Saved</Pill>
            </div>
            <p className="mb-4 mt-5 text-[12px] text-[var(--app-ink-3)]" role="status">{filtered.length} {filtered.length === 1 ? "reviewed vendor" : "reviewed vendors"}{query ? ` matching “${query}”` : ""}</p>
            {filtered.length > 0 ? <ul className="grid gap-4 md:grid-cols-2" aria-label="Reviewed Fair vendors">
              {filtered.map((vendor) => <li key={vendor.id} className="flex flex-col rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated-solid)] p-5" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--app-brand-press)]"><VendorIcon kind={vendor.kind} className="h-4 w-4" />{CATEGORY_LABELS[vendor.kind]}</div>
                <h3><button type="button" data-fair-vendor-result={vendor.id} onClick={() => { resultOpenerId.current = vendor.id; onSelectVendor(vendor.id); }} className="tap-44 mt-2 flex min-h-11 w-full items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]" aria-label={`Explore ${vendor.name}`}><span className="flex-1 text-[24px] font-extrabold leading-[1.1] tracking-[-0.03em]">{vendor.name}</span><ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[var(--app-ink-3)]" aria-hidden /></button></h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--app-ink-2)]">{vendor.summary}</p>
                <p className="mb-5 mt-3 line-clamp-2 text-[12px] font-semibold text-[var(--app-ink-3)]">{vendor.booth.status === "known" ? `Booth reference: ${vendor.booth.value}` : "Booth location not confirmed"}</p>
                <div className="mt-auto flex flex-wrap gap-2"><VendorSaveAction vendor={vendor} saved={savedVendorIds.includes(vendor.id)} onToggle={onToggleVendor} /><VendorShareAction vendor={vendor} /></div>
              </li>)}
            </ul> : <div className="border-y py-7" style={{ borderColor: "var(--app-border)" }}><h3 className="text-[22px] font-bold">{filter === "saved" ? "No saved vendors match this view." : "No reviewed vendor matches yet."}</h3><p className="mt-2 text-[14px] leading-relaxed text-[var(--app-ink-2)]">{filter === "saved" ? "Save a vendor to keep it with the rest of your Fair day, or try another search." : "This is a curated selection, not the full Fair directory. Try another search or check the official guide."}</p><Button className="mt-4" variant="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>Show all reviewed vendors</Button></div>}
          </>
        )}
        <a href={fairVendorDirectoryHref(query)} target="_blank" rel="noopener noreferrer" className="tap-44 mt-7 flex min-h-11 items-center justify-between gap-3 border-t pt-4 text-[13px] font-semibold text-[var(--app-cool)]" style={{ borderColor: "var(--app-border)" }}><span>Browse the full official vendor directory</span><ExternalLink className="h-4 w-4 shrink-0" aria-hidden /></a>
      </div>
      </div>
    </BottomDrawer>
  );
}
