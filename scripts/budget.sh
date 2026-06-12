#!/usr/bin/env bash
# scripts/budget.sh
# The clutter budget: visible text lines per screen, the single regression number.
# Baselines (June 12, 2026): /today 310 · /events 951 · / 50 · /pulse 122
# Targets: /today < 150 · /events < 400
# Usage: bash scripts/budget.sh            (production)
#        BASE_URL=http://localhost:3000 bash scripts/budget.sh
# Requires: python3 with beautifulsoup4 (pip install beautifulsoup4)

BASE="${BASE_URL:-https://frederickradius.app}"
UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

echo "Clutter budget against ${BASE} on $(date)"
echo "page | visible lines | decoded bytes"
echo "-----|---------------|--------------"

for p in "" "today" "events" "map" "alerts"; do
  HTML=$(curl -sL --compressed -A "$UA" "${BASE}/${p}")
  BYTES=$(printf %s "$HTML" | wc -c | tr -d ' ')
  LINES=$(printf %s "$HTML" | python3 -c "
import sys
from bs4 import BeautifulSoup
s = BeautifulSoup(sys.stdin.read(), 'html.parser')
for t in s(['script','style','noscript','svg','footer','head']):
    t.decompose()
print(len([l for l in s.get_text('\n', strip=True).split('\n') if l.strip()]))
")
  echo "/${p} | ${LINES} | ${BYTES}"
done

echo ""
echo "Append this output to docs/BASELINE.md with the session number."
