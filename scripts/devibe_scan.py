#!/usr/bin/env python3
"""
devibe_scan.py - static scan for "vibe-coded" / AI-generated design tells.

Adapted from JCarterJohnson/vibecoded-design-tells (skill/scripts/devibe_scan.py),
whose rule set + severities come from a Reddit study of what people flag as
looking AI-generated. Stdlib only; read-only. See docs/DESIGN_TELLS.md for how we
read the results (the field-guide app is the target; /pitch is a separate world).

Usage:
    python3 scripts/devibe_scan.py src                 # public product scan
    python3 scripts/devibe_scan.py src --surface all   # every surface
    python3 scripts/devibe_scan.py src --severity high # high-signal only
    python3 scripts/devibe_scan.py src --json          # machine-readable (CI)
Exit code = number of HIGH findings, so CI can gate on it.

Mark a deliberate choice with an `unslop-ignore` comment on the line to skip it.
"""
import os, re, sys, json, argparse

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The default report answers one question: what does the public Frederick Radius
# product look like? These paths are explicitly separate worlds: the no-index
# pitch deck, prod-disabled prototypes, private admin tools, and the small set of
# helpers imported only by the pitch deck. `--surface all` includes all of them
# so accepted debt never disappears from the repository-wide report.
PUBLIC_APP_EXCLUDED_PREFIXES = (
    "src/app/pitch/",
    "src/components/marketing/",
    "src/app/(app)/proto/",
    "src/components/proto/",
    "src/app/admin/",
    "src/components/admin/",
)
PUBLIC_APP_EXCLUDED_FILES = {
    "src/components/ui/animated-button.tsx",
    "src/components/ui/glass-card.tsx",
    "src/components/ui/gradient-text.tsx",
    "src/data/city-data-engine.ts",
}

# globals.css is shared, but its first legacy token block is expressly owned by
# `.marketing-shell` under /pitch. Keep scanning the rest of globals.css rather
# than hiding the most important public-product stylesheet wholesale.
PUBLIC_APP_EXCLUDED_BLOCKS = {
    "src/app/globals.css": (
        ("INTERNAL PITCH DECK", "APP (Warm Civic)"),
    ),
}
EXTS = {".html", ".htm", ".css", ".scss", ".sass", ".less", ".js", ".jsx",
        ".ts", ".tsx", ".vue", ".svelte", ".astro", ".mdx"}
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", "out", "vendor",
             "coverage", ".svelte-kit", ".astro", ".turbo", ".cache", "__pycache__"}
W = {"high": 3, "medium": 2, "low": 1}
RULES = [
    {"id": "shadcn-default-card", "label": "Untouched shadcn default Card / theme", "sev": "high",
     "fix": "Theme the tokens (primary, radius, neutrals, spacing). Stock defaults are the giveaway, not shadcn.",
     "pats": [r"rounded-lg\s+border\s+bg-card\s+text-card-foreground\s+shadow-sm",
              r"\"baseColor\"\s*:\s*\"(slate|zinc|gray|neutral|stone)\"",
              r"--radius\s*:\s*0\.5rem"]},
    {"id": "ai-purple", "label": "AI purple / indigo / violet as primary color", "sev": "high",
     "fix": "Pick a brand color outside the violet/indigo/purple band.",
     "pats": [r"\b(bg|text|from|via|to|border|ring|fill|stroke|decoration|outline)-(indigo|violet|purple|fuchsia)-(400|500|600|700|800)\b",
              r"#(6366f1|4f46e5|818cf8|7c3aed|6d28d9|8b5cf6|a855f7|9333ea|7e22ce|c026d3|d946ef)\b"]},
    {"id": "gradient-text", "label": "Gradient-filled text (heading/hero)", "sev": "high",
     "fix": "Solid color on headings and copy.",
     "pats": [r"bg-clip-text\s+[^\"'`]*text-transparent", r"text-transparent\s+[^\"'`]*bg-clip-text",
              r"-webkit-background-clip\s*:\s*text", r"\bbackground-clip\s*:\s*text"]},
    {"id": "purple-blue-gradient", "label": "Purple-to-blue/pink gradient", "sev": "high",
     "fix": "Default to solid fills.",
     "pats": [r"from-(purple|violet|indigo|fuchsia)-\d+\s+(via-[a-z]+-\d+\s+)?to-(blue|indigo|pink|cyan|sky)-\d+",
              r"linear-gradient\([^)]*#(6366f1|7c3aed|8b5cf6|a855f7)[^)]*\)"]},
    {"id": "claude-default-look", "label": "The 'tasteful default' look (cream background + serif display)", "sev": "high",
     "fix": "Anchor color and type to the real brand. If cream + serif is genuine, mark unslop-ignore.",
     "pats": [r"#(faf8f5|f5f1e8|f3eee3|fdfbf7|f7f3ec|faf6ef|f6f1e7|fbf7f0|f4efe4)\b",
              r"\bbg-(stone|amber|orange)-(50|100)\b",
              r"\b(Instrument\s*Serif|Fraunces|Playfair\s*Display|Cormorant|Spectral|DM\s*Serif)\b"]},
    {"id": "hero-three-cards", "label": "Centered hero + three-feature-card grid skeleton", "sev": "medium",
     "fix": "Break the grid.",
     "pats": [r"grid-cols-1\s+(sm:grid-cols-2\s+)?md:grid-cols-3"]},
    {"id": "rounded-everything", "label": "Large rounded corners / pill buttons everywhere", "sev": "medium",
     "fix": "Use a small, intentional radius scale by role.",
     "pats": [r"\brounded-(2xl|3xl|full)\b", r"border-radius\s*:\s*(999\d*px|9999px)"],
     "suppress": r"\b[hw]-(\d|10|11|12|14|16)(\.5)?\b"},
    {"id": "fade-in-animations", "label": "Boilerplate fade-in / hover-grow / scroll animation", "sev": "medium",
     "fix": "Motion only when it communicates something; gate behind prefers-reduced-motion.",
     "pats": [r"initial=\{\{\s*opacity:\s*0", r"whileInView", r"whileHover=\{\{\s*scale",
              r"data-aos\s*=", r"\bhover:scale-1\d{2}\b"]},
    {"id": "neon-glow", "label": "Unprompted neon glow shadow", "sev": "medium",
     "fix": "Remove glow you did not deliberately design.",
     "pats": [r"shadow-\[0_0_", r"drop-shadow-\[0_0_", r"text-shadow\s*:[^;]*\d+px[^;]*(rgba|#|hsl)",
              r"box-shadow\s*:[^;]*\b0\s+0\s+\d{2,}px"]},
    {"id": "emoji-as-icons", "label": "Emoji used as icons / section bullets", "sev": "medium",
     "fix": "Use a real SVG icon set or none.",
     "pats": [r"[\U0001F680✨⚡\U0001F525\U0001F4A1\U0001F512✅\U0001F3AF\U0001F31F\U0001F6E1\U0001F4C8\U0001F511\U0001F389]"]},
    {"id": "generic-font", "label": "Generic default font (Inter / Geist / Roboto / system)", "sev": "medium",
     "fix": "Choose a typeface with character.",
     "pats": [r"font-family\s*:\s*['\"]?(Inter|Geist|Roboto)\b",
              r"\b(Inter|Geist|Geist_Mono|Roboto)\s*\(",
              r"fontFamily\s*:\s*\{[^}]*['\"](Inter|Geist|Roboto)"]},
    {"id": "hype-copy", "label": "Generated marketing copy cliche", "sev": "low",
     "fix": "Say what the product literally does.",
     "pats": [r"\bTransform your\b", r"\bSupercharge\b", r"\bUnleash\b", r"\bEffortlessly\b",
              r"\breimagined\b", r"take your [^.]{0,30}to the next level", r"\bGame-?changer\b"]},
    {"id": "stock-illustration", "label": "Generic blob / stock illustration source", "sev": "low",
     "fix": "Use real screenshots or commissioned art.",
     "pats": [r"undraw", r"storyset", r"\bdrawkit\b"]},
]
def compile_rules(min_sev):
    order = ["high", "medium", "low"]; floor = order.index(min_sev) if min_sev else len(order)-1
    out = []
    for r in RULES:
        if order.index(r["sev"]) > floor: continue
        r = dict(r); r["rx"] = [re.compile(p, re.IGNORECASE) for p in r["pats"]]
        r["suppress_rx"] = re.compile(r["suppress"], re.IGNORECASE) if r.get("suppress") else None
        out.append(r)
    return out
def repo_path(path):
    return os.path.relpath(os.path.abspath(path), PROJECT_ROOT).replace(os.sep, "/")


def excluded_from_public(path):
    rel = repo_path(path)
    return rel in PUBLIC_APP_EXCLUDED_FILES or any(
        rel.startswith(prefix) for prefix in PUBLIC_APP_EXCLUDED_PREFIXES
    )


def iter_files(path, surface="all"):
    if os.path.isfile(path):
        if surface == "public" and excluded_from_public(path): return
        yield path
        return
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(".min.js") or f.endswith(".min.css"): continue
            fp = os.path.join(root, f)
            if surface == "public" and excluded_from_public(fp): continue
            if os.path.splitext(f)[1].lower() in EXTS: yield fp


def public_excluded_lines(path, lines):
    """Return 1-based line numbers owned by an explicitly separate surface."""
    blocks = PUBLIC_APP_EXCLUDED_BLOCKS.get(repo_path(path), ())
    excluded = set()
    for start_marker, end_marker in blocks:
        inside = False
        for number, line in enumerate(lines, 1):
            if start_marker in line:
                inside = True
            if inside:
                excluded.add(number)
            if inside and end_marker in line:
                inside = False
    return excluded


def scan(path, min_sev, surface):
    rules = compile_rules(min_sev); findings = []
    for fp in iter_files(path, surface):
        try:
            with open(fp, "r", encoding="utf-8", errors="ignore") as fh: lines = fh.readlines()
        except Exception: continue
        if len(lines) == 1 and len(lines[0]) > 5000: continue
        excluded_lines = public_excluded_lines(fp, lines) if surface == "public" else set()
        for i, line in enumerate(lines, 1):
            if i in excluded_lines: continue
            if "unslop-ignore" in line.lower(): continue
            for r in rules:
                if r["suppress_rx"] and r["suppress_rx"].search(line): continue
                for rx in r["rx"]:
                    if rx.search(line):
                        findings.append({"rule": r["id"],"label":r["label"],"sev":r["sev"],"fix":r["fix"],"file":fp,"line":i,"snippet":line.strip()[:160]}); break
    return findings
def verdict(by_sev):
    # Repeated class occurrences should create review pressure, not turn a large
    # product into a scarier verdict than a five-file landing page. HIGH signals
    # gate the scan; MEDIUM/LOW hits remain visible as pattern debt.
    if by_sev.get("high", 0) >= 3: return "High-signal AI defaults present"
    if by_sev.get("high", 0) >= 1: return "Some high-signal AI defaults present"
    if by_sev.get("medium", 0) >= 1: return "No high-signal defaults; repeated patterns need review"
    if by_sev.get("low", 0) >= 1: return "Clean, with minor copy or asset tells"
    return "Clean, no tells detected"
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("path")
    ap.add_argument("--severity", choices=["high","medium","low"], default="low")
    ap.add_argument("--surface", choices=["public", "all"], default="public")
    ap.add_argument("--json", action="store_true"); ap.add_argument("--max", type=int, default=10)
    args = ap.parse_args()
    if not os.path.exists(args.path): print("path not found", file=sys.stderr); sys.exit(2)
    findings = scan(args.path, args.severity, args.surface); by_sev={}; by_rule={}
    for f in findings:
        by_sev[f["sev"]]=by_sev.get(f["sev"],0)+1; by_rule.setdefault(f["rule"],[]).append(f)
    weighted = sum(W[s]*n for s,n in by_sev.items())
    files_scanned = sum(1 for _ in iter_files(args.path, args.surface))
    all_files = sum(1 for _ in iter_files(args.path, "all"))
    high_count = by_sev.get("high", 0)
    sev_order={"high":0,"medium":1,"low":2}
    rule_ids = sorted(by_rule, key=lambda rid:(sev_order[by_rule[rid][0]["sev"]], -len(by_rule[rid])))
    report = {
        "path": args.path,
        "surface": args.surface,
        "files_scanned": files_scanned,
        "files_excluded": all_files - files_scanned,
        "findings": findings,
        "counts": {
            "high": high_count,
            "medium": by_sev.get("medium", 0),
            "low": by_sev.get("low", 0),
        },
        "pressure_score": weighted,
        "verdict": verdict(by_sev),
    }
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"\n  scan: {args.path}   surface: {args.surface}")
        print(
            f"  files scanned: {files_scanned}   excluded: {all_files-files_scanned}   "
            f"findings: {len(findings)}   pressure score: {weighted}"
        )
        print(f"  verdict: {verdict(by_sev)}")
        print(f"  high: {high_count}   medium: {by_sev.get('medium',0)}   low: {by_sev.get('low',0)}\n")
        for rid in rule_ids:
            items = by_rule[rid]; f0 = items[0]
            print(f"  [{f0['sev'].upper()}] {f0['label']}  ({len(items)} hits)")
            for it in items[:args.max]:
                print(f"        {it['file']}:{it['line']}  {it['snippet']}")
            if len(items) > args.max: print(f"        ... +{len(items)-args.max} more")
            print()
    sys.exit(min(high_count, 255))
if __name__ == "__main__": main()
