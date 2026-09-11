#!/usr/bin/env bash
# Cuts the static TTFs the PDF export embeds, from the same masters the web
# faces are cut from.
#
# `lib/report-pdf.ts` draws the downloadable report with the three faces the
# report uses on screen — Cooper for display, Inter for prose, Geist Mono for
# figures — so the file somebody forwards looks like the document they were
# looking at. pdf-lib cannot read what the browser reads:
#
#   - woff2 is a compressed container it has no decoder for. TTF only.
#   - A variable font embeds at its default instance, so InterVariable would
#     come out at wght 400 and there would be no bold anywhere in the PDF.
#
# So each variable face is pinned to the two weights the layout uses, then
# subset to the same LATIN range as `build-font-subsets.sh` and written as a
# plain TTF. The reports are Spanish and English, and that range already covers
# the punctuation, currency and arrows a model tends to reach for.
#
# Requires fontTools with brotli:  pip install 'fonttools[woff]'
set -euo pipefail
cd "$(dirname "$0")/.."

# Kept in step with build-font-subsets.sh by hand. A PDF has no `unicode-range`
# to fall back to a second file with, so this is the whole character set the
# export can draw; anything outside it is dropped by `sanitize` in
# lib/report-pdf.ts rather than failing the download.
LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD,U+2264-2265,U+00D7,U+00F7,U+2713-2714,U+2717,U+25CF,U+25A0,U+221E,U+2605-2606"
FEATURES="kern,liga,clig,calt,tnum,lnum,ccmp,mark,mkmk,locl,rlig,case"

OUT=public/fonts/pdf
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# subset <src> <dst>
subset() {
  python3 -m fontTools.subset "$1" \
    --unicodes="$LATIN" \
    --layout-features="$FEATURES" \
    --no-hinting \
    --drop-tables+=DSIG \
    --output-file="$2" 2>/dev/null
  printf '  %-24s %6s\n' "$(basename "$2")" "$(du -h "$2" | cut -f1)"
}

# pin <src> <dst> <weight> — flatten a variable font to one static instance first.
pin() {
  python3 -m fontTools.varLib.instancer "$1" "wght=$3" \
    --output "$TMP/pinned.ttf" >/dev/null
  subset "$TMP/pinned.ttf" "$2"
}

echo "Cooper"
subset public/fonts/cooper/CooperLtBT_400-s.p.0ayak-z9t8l45.woff2 "$OUT/Cooper-400.ttf"
subset public/fonts/cooper/CooperLtBT_500-s.p.268aeup1v2w88.woff2 "$OUT/Cooper-500.ttf"

echo "Inter"
pin public/fonts/inter/InterVariable.woff2 "$OUT/Inter-400.ttf" 400
pin public/fonts/inter/InterVariable.woff2 "$OUT/Inter-600.ttf" 600

echo "Geist Mono"
pin public/fonts/geist-mono/GeistMono-Variable.ttf "$OUT/GeistMono-400.ttf" 400
pin public/fonts/geist-mono/GeistMono-Variable.ttf "$OUT/GeistMono-500.ttf" 500
