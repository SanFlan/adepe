#!/usr/bin/env bash
#
# Render `pitch.html` to `pitch.pdf` — eight landscape 16:9 pages, one per slide.
#
#   scripts/pitch-pdf.sh
#
# The deck already knows how to print itself: its `@media print` block reveals all eight
# slides and pins each to one `@page` box. All this script does is drive headless Chrome
# over the local file and put the result at the repository root, where `deploy-sprite.sh`
# picks it up and uploads it beside the deck so the "Descargar PDF" link resolves.
#
# Re-run it after editing a slide, or the published PDF and the published deck disagree.

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
out=$root/pitch.pdf

chrome=${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}
if [ ! -x "$chrome" ]; then
  chrome=$(command -v google-chrome || command -v chromium || true)
fi
[ -n "$chrome" ] && [ -x "$chrome" ] || {
  echo "no Chrome found; set CHROME=/path/to/chrome" >&2
  exit 1
}

# --user-data-dir is not optional: without a scratch profile Chrome refuses to start
# headless while a normal window is open, which it usually is.
profile=$(mktemp -d -t adepe-pitch-pdf)
trap 'rm -rf "$profile"' EXIT

# Chrome writes the PDF and then, on macOS, sits there rather than exiting -- in both
# headless modes. So it is launched detached and killed once the file has appeared and
# stopped growing; waiting on the process itself would simply never return.
rm -f "$out"
"$chrome" \
  --headless=old \
  --disable-gpu \
  --no-pdf-header-footer \
  --user-data-dir="$profile" \
  --print-to-pdf="$out" \
  "file://$root/pitch.html" >/dev/null 2>&1 &
chrome_pid=$!
trap 'kill "$chrome_pid" 2>/dev/null || true; rm -rf "$profile"' EXIT

size=-1
for _ in $(seq 60); do
  sleep 1
  now=$(stat -f%z "$out" 2>/dev/null || stat -c%s "$out" 2>/dev/null || echo -1)
  [ "$now" -gt 0 ] && [ "$now" = "$size" ] && break
  size=$now
done
kill "$chrome_pid" 2>/dev/null || true

[ -s "$out" ] || { echo "Chrome produced no PDF" >&2; exit 1; }

# One page per slide. A different count means the print stylesheet stopped matching the
# markup -- worth failing on, because the PDF would still be produced and still look fine
# at a glance while silently dropping or doubling slides.
slides=$(grep -c '<section class="slide"' "$root/pitch.html")
pages=$(strings "$out" | grep -o '/Type[[:space:]]*/Pages\{0,1\}' | grep -cv Pages || true)
if [ "$pages" != "$slides" ]; then
  echo "expected $slides pages, got $pages" >&2
  exit 1
fi

echo "$out  ($pages pages, $(du -h "$out" | cut -f1))"
