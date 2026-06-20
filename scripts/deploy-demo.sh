#!/usr/bin/env bash
# Assemble a deployable demo bundle (Netlify-ready) into a target directory.
#
# Usage: bash scripts/deploy-demo.sh <out-dir> <landing-url>
#
# Two demos share ONE codebase (demo/) but ship as two independent artifacts:
#   - Original self-explore demo -> landing: demo/mds-section-i.html
#   - Guided tour demo           -> landing: demo/medical-diagnosis.html?tour=1
#
# The bundles are byte-for-byte identical; the ONLY difference is the index.html
# redirect target. The guided tour is dormant unless the URL carries ?tour=1, so
# the self-explore artifact is unaffected by the tour code being present.
set -euo pipefail

OUT_DIR="${1:?usage: deploy-demo.sh <out-dir> <landing-url>}"
LANDING="${2:?usage: deploy-demo.sh <out-dir> <landing-url>}"

# Build both entries: pcc (captured PCC pages) + legacy (medical-diagnosis etc.)
npm run demo:build
DEMO_ENTRY=legacy npm run demo:build

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/content/css" "$OUT_DIR/content/icd10-viewer" "$OUT_DIR/content/super-menu" "$OUT_DIR/lib"

rsync -a \
  --exclude='*.jsx' \
  --exclude='components/' \
  --exclude='hooks/' \
  --exclude='pcc-demo.html' \
  --exclude='demo-mock-chrome.js' \
  --exclude='demo-mock-globals.js' \
  demo/ "$OUT_DIR/demo/"

cp content/css/variables.css content/css/icd10-viewer.css content/css/therapy-modal.css content/css/meddiag-augment.css content/css/pdpm-analyzer.css "$OUT_DIR/content/css/"
cp content/icd10-viewer/icd10-mock-data.js content/icd10-viewer/icd10-api.js content/icd10-viewer/icd10-sidebar.js content/icd10-viewer/icd10-evidence-panel.js content/icd10-viewer/icd10-pdf-viewer.js content/icd10-viewer/icd10-viewer.js "$OUT_DIR/content/icd10-viewer/"
cp content/super-menu/meddiag-augment.js "$OUT_DIR/content/super-menu/"
cp lib/pdf.min.js lib/pdf.worker.min.js "$OUT_DIR/lib/" 2>/dev/null || true

cat > "$OUT_DIR/index.html" <<HTML
<html><head><meta http-equiv="refresh" content="0;url=$LANDING"></head></html>
HTML

echo "Ready! Drag $OUT_DIR/ into Netlify  (landing: $LANDING)"
