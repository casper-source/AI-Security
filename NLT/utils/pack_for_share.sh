#!/usr/bin/env bash
set -euo pipefail

# Enhanced version: adds safety checks, optional flags, refined exclusions.

# scripts/pack_for_share.sh
# Create a clean, shareable zip of the current project directory.
# Usage: scripts/pack_for_share.sh [-n name] [-o outdir] [--dry-run] [--yes]

DEST_PARENT="${DEST_PARENT:-$(pwd)}"
TIMESTAMP=$(date +%Y%m%dT%H%M%S)
DEFAULT_NAME="nlt_chatbot_share_${TIMESTAMP}"
OUT_NAME="${DEFAULT_NAME}"
OUT_DIR="${DEST_PARENT}"
DRY_RUN=false
ASSUME_YES=false
INCLUDE_DATA=false
KEEP_TEMP=false

# Track whether we completed successfully (used for cleanup logic)
SUCCESS=false

usage(){
  cat <<EOF
Usage: $(basename "$0") [options]
Options:
  -n NAME          Output base name (default: ${DEFAULT_NAME})
  -o OUTDIR        Where to place the zip (default: current directory)
  --src DIR        Source directory to package (default: repo root detected via script location)
  --include-data   Keep the 'data' directory (excluded by default)
  --dry-run        Show what would be done, don't actually copy/zip
  --yes            Skip confirmation prompts (assume yes)
  --keep-temp      Keep the temporary working directory (implies --yes for cleanup prompt)
  -h|--help        Show this help

Creates a temporary copy of the repository, removes caches, compiled artifacts,
databases, virtualenvs and other sensitive/large files, then zips the cleaned copy.
You can run this script from any directory; it auto-detects the project root based
on its own location.
EOF
}

SRC_OVERRIDE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -n) shift; OUT_NAME="$1"; shift ;;
    -o) shift; OUT_DIR="$1"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    --include-data) INCLUDE_DATA=true; shift ;;
    --keep-temp) KEEP_TEMP=true; shift ;;
    --src) shift; SRC_OVERRIDE="$1"; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

# Ensure required external commands are available early.
for cmd in rsync zip mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' not found in PATH" >&2
    exit 1
  fi
done

# Resolve OUT_DIR to absolute path (without relying on pushd later)
if [ ! -d "$OUT_DIR" ]; then
  mkdir -p "$OUT_DIR" || { echo "Failed to create output directory $OUT_DIR" >&2; exit 1; }
fi

# Determine repository root relative to script location unless overridden
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -n "$SRC_OVERRIDE" ]; then
  if [ ! -d "$SRC_OVERRIDE" ]; then
    echo "Error: --src directory '$SRC_OVERRIDE' does not exist" >&2
    exit 1
  fi
  SRC_DIR="$(cd "$SRC_OVERRIDE" && pwd)"
else
  SRC_DIR="$REPO_ROOT"
fi

if [ "$(pwd)" != "$SRC_DIR" ]; then
  echo "Packaging source directory: $SRC_DIR (current dir: $(pwd))"
fi
TMP_BASE=$(mktemp -d -t nlt_share_XXXXXX)
DEST_DIR="$TMP_BASE/$OUT_NAME"

echo "Source: $SRC_DIR"
echo "Destination (temp): $DEST_DIR"

if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN: no files will be copied or removed. Exiting after plan.";
fi

# Patterns to exclude during copy (rsync) and also to delete after copy if present
EXCLUDE_PATTERNS=".git
ai_hacking
__pycache__
*.pyc
*.pyo
*.pyd
*.db
*.sqlite
*.sqlite3
node_modules
venv
.venv
env
dist
build
vector_db
data
transformers_cache
sentence_transformers_cache
*.pem
*.key
.env
.selected_model
.current_hardware_config
cookies*.txt
cookies*.json
*.log
.vscode
.idea"

# Optionally retain the data directory if requested.
if [ "$INCLUDE_DATA" = true ]; then
  EXCLUDE_PATTERNS=$(printf '%s\n' "$EXCLUDE_PATTERNS" | grep -v '^data$' || true)
fi

echo "Excluding patterns:"; echo "$EXCLUDE_PATTERNS"

if [ "$DRY_RUN" = true ]; then
  echo "Would run: rsync -a --info=STATS2 --exclude-from=- \"$SRC_DIR/\" \"$DEST_DIR/\"";
  echo "Would delete residual sensitive files after copy (safety pass).";
  echo "Would create zip: $OUT_DIR/${OUT_NAME}.zip";
  exit 0
fi

echo "Copying repository to temporary location..."
mkdir -p "$DEST_DIR"

# Use rsync and pass excludes via stdin
rsync -a --info=STATS2 --exclude-from=- "$SRC_DIR/" "$DEST_DIR/" <<EOF
$EXCLUDE_PATTERNS
EOF

echo "Copy completed. Cleaning copied tree..."

# Delete residual patterns in the copied tree (extra safety)
pushd "$DEST_DIR" >/dev/null

# Remove common sensitive/large items (in case they slipped through)
echo "Removing sensitive/large files and directories..."
find . -type d \( -name '__pycache__' -o -name 'node_modules' -o -name 'vector_db' -o -name 'data' -o -name 'ai_hacking' -o -name 'venv' -o -name '.venv' -o -name '.idea' -o -name '.vscode' \) -print -prune -exec rm -rf {} + || true
find . -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' -o -name '*.pem' -o -name '*.key' -o -name '.env' -o -name '.selected_model' -o -name '.current_hardware_config' -o -name 'cookies*.txt' -o -name 'cookies*.json' -o -name '*.log' \) -print -delete || true

# Remove git metadata if any
rm -rf .git || true

# Remove empty directories
find . -type d -empty -delete || true

popd >/dev/null

OUT_ZIP="$OUT_DIR/${OUT_NAME}.zip"

echo "Creating zip archive: $OUT_ZIP"
pushd "$TMP_BASE" >/dev/null
zip -r "$OUT_ZIP" "$OUT_NAME" >/dev/null
popd >/dev/null

echo "Shareable archive created: $OUT_ZIP"
echo "Temporary working directory: $TMP_BASE"

# Mark success before interactive deletion logic
SUCCESS=true

if [ "$KEEP_TEMP" = true ]; then
  echo "--keep-temp specified: leaving temp directory: $TMP_BASE"
elif [ "$ASSUME_YES" = false ]; then
  read -r -p "Delete temporary working directory $TMP_BASE ? (Y/n): " yn || true
  case "$yn" in
    [nN]*) echo "Keeping temporary directory: $TMP_BASE" ;;
    *) rm -rf "$TMP_BASE"; echo "Temporary directory deleted." ;;
  esac
else
  rm -rf "$TMP_BASE"
fi

echo "Done."

exit 0
