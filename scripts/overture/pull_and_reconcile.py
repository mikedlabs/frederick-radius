#!/usr/bin/env python3
"""
pull_and_reconcile.py — pull Frederick County places from Overture Maps
(free, CDLA Permissive 2.0) and reconcile against the live catalog.

    pip install duckdb
    python3 scripts/overture/pull_and_reconcile.py

What it does, no API key, no per-call cost:
  1. Streams the latest Overture `places` release for the county bbox
     straight from S3 with DuckDB (≈8s, ~17k rows).
  2. Matches each catalog place (places-client.json) to its nearest
     Overture place within 120m by name similarity.
  3. Reports three actionable buckets:
       - CONTACT FILLS : catalog place missing website/phone, Overture has it
       - CLOSURE FLAGS : Overture operating_status == 'closed'
       - GEOCODE SUSPECTS: same-name Overture match sits >250m away
     plus the count of high-confidence NET-NEW places not in the catalog.
  4. Writes a markdown report + a JSON of proposed additive fills that
     slot into the existing places-overrides / data:review workflow.

Overture carries names, categories, websites, phones, socials, addresses,
confidence, and operating_status — but NOT opening hours. Hours/photos stay
a Google Place Details or owner-submission job. Spend Google budget only
there; let Overture cover website/phone/category/closure for free.
"""
import duckdb, json, math, os, datetime
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-05-20.0")
BBOX = dict(south=39.265, west=-77.700, north=39.745, east=-77.150)

def haversine(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dlat = math.radians(b[1] - a[1]); dlng = math.radians(b[0] - a[0])
    h = math.sin(dlat/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlng/2)**2
    return 2*R*math.asin(math.sqrt(h))

def norm(s):
    s = (s or "").lower()
    for ch in "'’&.,": s = s.replace(ch, "")
    for w in [" the ", " llc", " inc", " co ", " company", " restaurant"]:
        s = s.replace(w, " ")
    return " ".join(s.split())

def toks(s): return set(norm(s).split())
def jaccard(a, b):
    A, B = toks(a), toks(b)
    return len(A & B) / len(A | B) if A | B else 0.0

print(f"Pulling Overture places {RELEASE} for Frederick County ...")
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
SRC = f"read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*', hive_partitioning=1)"
rows = con.execute(f"""
  SELECT names.primary AS name,
         (bbox.xmin+bbox.xmax)/2 AS lng, (bbox.ymin+bbox.ymax)/2 AS lat,
         categories.primary AS category, confidence,
         websites[1] AS website, phones[1] AS phone, operating_status
  FROM {SRC}
  WHERE bbox.xmin BETWEEN {BBOX['west']} AND {BBOX['east']}
    AND bbox.ymin BETWEEN {BBOX['south']} AND {BBOX['north']}
    AND names.primary IS NOT NULL
""").fetchall()
ov = [dict(name=r[0], lng=r[1], lat=r[2], category=r[3], confidence=r[4],
           website=r[5], phone=r[6], status=r[7]) for r in rows]
print(f"  {len(ov)} Overture places in county")

# spatial grid (~0.002deg ≈ 170m cells) for fast nearest lookup
CELL = 0.002
grid = defaultdict(list)
for o in ov:
    grid[(round(o["lng"]/CELL), round(o["lat"]/CELL))].append(o)
def nearby(lng, lat):
    cx, cy = round(lng/CELL), round(lat/CELL)
    out = []
    for dx in (-1,0,1):
        for dy in (-1,0,1):
            out += grid.get((cx+dx, cy+dy), [])
    return out

cat = json.load(open(os.path.join(ROOT, "src/data/places-client.json")))
fills, closures, suspects = [], [], []
matched = 0
for p in cat:
    g = p.get("geom") or {}
    if "lng" not in g: continue
    cand = nearby(g["lng"], g["lat"])
    best, bestd, bestj = None, 1e9, 0
    for o in cand:
        d = haversine((g["lng"], g["lat"]), (o["lng"], o["lat"]))
        if d > 120: continue
        j = jaccard(p["name"], o["name"])
        if j > bestj or (j == bestj and d < bestd):
            best, bestd, bestj = o, d, j
    if best and bestj >= 0.5:
        matched += 1
        if (best["status"] or "").lower() == "closed":
            closures.append((p["slug"], p["name"]))
        miss = {}
        if not p.get("website") and best["website"]: miss["website"] = best["website"]
        if not p.get("phone") and best["phone"]: miss["phone"] = best["phone"]
        if miss:
            fills.append({"slug": p["slug"], "name": p["name"], **miss,
                          "overture_match": best["name"], "dist_m": round(bestd)})

# geocode suspects: same-name Overture row exists but nearest is far
ov_by_norm = defaultdict(list)
for o in ov: ov_by_norm[norm(o["name"])].append(o)
for p in cat:
    g = p.get("geom") or {}
    if "lng" not in g: continue
    same = ov_by_norm.get(norm(p["name"]), [])
    if not same: continue
    nd = min(haversine((g["lng"], g["lat"]), (o["lng"], o["lat"])) for o in same)
    if nd > 250:
        suspects.append({"slug": p["slug"], "name": p["name"], "nearest_overture_m": round(nd)})

# net-new: high-confidence Overture w/ category, not within 80m of any catalog place
cat_grid = defaultdict(list)
for p in cat:
    g = p.get("geom") or {}
    if "lng" in g: cat_grid[(round(g["lng"]/CELL), round(g["lat"]/CELL))].append((g["lng"], g["lat"]))
def near_cat(lng, lat):
    cx, cy = round(lng/CELL), round(lat/CELL)
    for dx in (-1,0,1):
        for dy in (-1,0,1):
            for (clng, clat) in cat_grid.get((cx+dx, cy+dy), []):
                if haversine((lng,lat),(clng,clat)) < 80: return True
    return False
netnew = [o for o in ov if (o["confidence"] or 0) >= 0.9 and o["category"] and not near_cat(o["lng"], o["lat"])]

report = []
def w(s=""): report.append(s)
w("# Overture reconciliation"); w()
w(f"_release {RELEASE} · county bbox · {datetime.date.today()}_"); w()
w(f"- Overture places in county: **{len(ov)}**  (catalog: **{len(cat)}**, ~{len(ov)//len(cat)}x)")
w(f"- Catalog places matched to an Overture place (<=120m, name>=0.5): **{matched}** ({matched*100//len(cat)}%)")
w(f"- **Contact fills** available (catalog missing website/phone, Overture has it): **{len(fills)}**")
w(f"- **Closure flags** (Overture operating_status = closed): **{len(closures)}**")
w(f"- **Geocode suspects** (same-name Overture match >250m away): **{len(suspects)}**")
w(f"- **Net-new** high-confidence places not in catalog (>=0.9 conf, has category): **{len(netnew)}**"); w()
w("## Sample contact fills"); w("```")
for f in fills[:15]: w(f"  {f['name'][:32]:32} +{('website' if 'website' in f else '')+('/phone' if 'phone' in f else ''):14} ({f['dist_m']}m)")
w("```")
w("## Sample net-new (discovery candidates)"); w("```")
for o in sorted(netnew, key=lambda x:-x["confidence"])[:15]:
    w(f"  {o['name'][:34]:34} {o['category'][:24]:24} conf={o['confidence']:.2f}")
w("```")

os.makedirs(os.path.join(ROOT, "docs/audits"), exist_ok=True)
rp = os.path.join(ROOT, "docs/audits", f"{datetime.date.today()}-overture-reconciliation.md")
open(rp, "w").write("\n".join(report))
fp = os.path.join(ROOT, "docs/audits", f"{datetime.date.today()}-overture-contact-fills.json")
json.dump({"generated": str(datetime.date.today()), "release": RELEASE, "fills": fills[:500],
           "closures": closures, "suspects": suspects}, open(fp, "w"), indent=2)
print("\n".join(report))
print(f"\nwrote {os.path.relpath(rp, ROOT)} and {os.path.relpath(fp, ROOT)}")
