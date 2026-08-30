#!/usr/bin/env bash
# Converts the raw Playwright recording into the two assets the README embeds.
# GIF constraints (see README.md#demo): 960px wide, ~12fps, palettegen/paletteuse,
# under 10MB — drop fps or shorten record.mjs's walkthrough rather than exceed it.
set -euo pipefail
cd "$(dirname "$0")"

SRC="output/demo-raw.webm"
ASSETS_DIR="../../docs/assets"
MP4_OUT="$ASSETS_DIR/demo.mp4"
GIF_OUT="$ASSETS_DIR/demo.gif"
PALETTE="output/palette.png"

if [ ! -f "$SRC" ]; then
  echo "Missing $SRC — run 'npm run record' first." >&2
  exit 1
fi

mkdir -p "$ASSETS_DIR"

echo "Encoding $MP4_OUT ..."
ffmpeg -y -i "$SRC" -vf "scale=1280:-2" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "$MP4_OUT"

echo "Building GIF palette ..."
ffmpeg -y -i "$SRC" -vf "fps=12,scale=960:-2:flags=lanczos,palettegen" "$PALETTE"

echo "Encoding $GIF_OUT ..."
ffmpeg -y -i "$SRC" -i "$PALETTE" \
  -filter_complex "fps=12,scale=960:-2:flags=lanczos[x];[x][1:v]paletteuse" \
  "$GIF_OUT"

SIZE=$(stat -f%z "$GIF_OUT" 2>/dev/null || stat -c%s "$GIF_OUT")
echo "GIF size: $SIZE bytes"
if [ "$SIZE" -gt 10485760 ]; then
  echo "ERROR: $GIF_OUT is over 10MB. Lower fps or shorten record.mjs's walkthrough and re-run." >&2
  exit 1
fi

echo "Done: $MP4_OUT and $GIF_OUT"
