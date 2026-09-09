#!/usr/bin/env bash
# Recuts the shipped font subsets from the masters in public/fonts.
#
# The masters (InterVariable.woff2, InterVariable-Italic.woff2, SaansVF.ttf and
# the two hashed Cooper files) cover every script the typefaces ship with. The
# app has two locales, `es` and `en`, so the pages only ever ask for latin and
# — for names that arrive through the CRM — latin-ext. `app/globals.css`
# declares each face twice with a `unicode-range`, and the browser fetches the
# extended file only when a glyph inside its range is on the page.
#
# Requires fontTools with brotli:  pip install 'fonttools[woff]'
set -euo pipefail
cd "$(dirname "$0")/.."

LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD,U+2264-2265,U+00D7,U+00F7,U+2713-2714,U+2717,U+25CF,U+25A0,U+221E,U+2605-2606"
EXT="U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"
# `calt`/`liga` carry Inter's own shaping; `tnum` is what `font-variant-numeric:
# tabular-nums` in globals.css resolves to. Dropping the rest is most of the
# saving: the alternate sets reference glyphs the unicode range would otherwise
# have kept alive.
FEATURES="kern,liga,clig,calt,tnum,onum,lnum,pnum,zero,frac,ccmp,mark,mkmk,locl,rlig,case"

cut() { # cut <src> <dst> <unicodes>
  python3 -m fontTools.subset "$1" \
    --unicodes="$3" \
    --layout-features="$FEATURES" \
    --flavor=woff2 \
    --no-hinting \
    --drop-tables+=DSIG \
    --output-file="$2"
  printf '  %-40s %6s\n' "$(basename "$2")" "$(du -h "$2" | cut -f1)"
}

echo "Inter"
cut public/fonts/inter/InterVariable.woff2        public/fonts/inter/InterVariable-latin.woff2           "$LATIN"
cut public/fonts/inter/InterVariable.woff2        public/fonts/inter/InterVariable-latinext.woff2        "$EXT"
cut public/fonts/inter/InterVariable-Italic.woff2 public/fonts/inter/InterVariable-Italic-latin.woff2    "$LATIN"
cut public/fonts/inter/InterVariable-Italic.woff2 public/fonts/inter/InterVariable-Italic-latinext.woff2 "$EXT"

echo "Saans"
cut public/fonts/saans/SaansVF.ttf public/fonts/saans/SaansVF-latin.woff2    "$LATIN"
cut public/fonts/saans/SaansVF.ttf public/fonts/saans/SaansVF-latinext.woff2 "$EXT"

echo "Cooper"
cut public/fonts/cooper/CooperLtBT_400-s.p.0ayak-z9t8l45.woff2 public/fonts/cooper/CooperLtBT_400-latin.woff2 "$LATIN"
cut public/fonts/cooper/CooperLtBT_500-s.p.268aeup1v2w88.woff2 public/fonts/cooper/CooperLtBT_500-latin.woff2 "$LATIN"
