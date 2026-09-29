#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${PUBLISH_REPO_URL:-git@github.com:akhil3645/akhil3645.github.io.git}"
REPO_DIR="${PUBLISH_REPO_DIR:-$HOME/.cache/akhil3645.github.io}"
SITE_URL="${PUBLISH_SITE_URL:-https://akhil3645.github.io}"
LIVE_WAIT_ATTEMPTS=24
LIVE_WAIT_SECONDS=5

SOURCE=""
SLUG=""
TITLE=""
DESC=""
DATE="$(date +'%b %-d, %Y')"
ENTRY=""
NO_PUSH=0

usage() {
  cat <<'USAGE'
Publish a folder as a page on akhil3645.github.io.

Usage:
  tools/publish-page.sh --source <dir> [options]

Required:
  --source <dir>    Folder with the page HTML and its assets

Options:
  --slug <slug>     URL slug, kebab-case (default: kebab-case of --title,
                    or a random string when no title is given)
  --title <text>    Hub card title (default: title-cased slug)
  --desc <text>     Hub card description (default: empty)
  --entry <file>    HTML file to publish as index.html
                    (default: index.html, else the only *.html file)
  --date <text>     Hub card date (default: today, e.g. "Sep 29, 2026")
  --no-push         Do everything except push and the live check
  -h, --help        Show this help

Environment:
  PUBLISH_REPO_DIR   Cached checkout (default: ~/.cache/akhil3645.github.io)
  PUBLISH_REPO_URL   Git remote
  PUBLISH_SITE_URL   Live site base URL

Copies the page files (source README.md is not published), appends the
pages.js entry, commits, pushes, then polls the live URL until it returns 200.
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

step() {
  printf '\n==> %s\n' "$*"
}

random_slug() {
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 10 || true
}

kebab() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source) [ $# -ge 2 ] || die "--source needs a value"; SOURCE="$2"; shift 2 ;;
    --slug) [ $# -ge 2 ] || die "--slug needs a value"; SLUG="$2"; shift 2 ;;
    --title) [ $# -ge 2 ] || die "--title needs a value"; TITLE="$2"; shift 2 ;;
    --desc) [ $# -ge 2 ] || die "--desc needs a value"; DESC="$2"; shift 2 ;;
    --entry) [ $# -ge 2 ] || die "--entry needs a value"; ENTRY="$2"; shift 2 ;;
    --date) [ $# -ge 2 ] || die "--date needs a value"; DATE="$2"; shift 2 ;;
    --no-push) NO_PUSH=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[ -n "$SOURCE" ] || { usage >&2; die "--source is required"; }
[ -d "$SOURCE" ] || die "source folder not found: $SOURCE"
command -v git >/dev/null || die "git is required"
command -v python3 >/dev/null || die "python3 is required"
SOURCE="$(cd "$SOURCE" && pwd)"

[ -n "$SLUG" ] || SLUG="$(kebab "$TITLE")"
[ -n "$SLUG" ] || SLUG="$(random_slug)"
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || die "slug must be lowercase letters, digits and hyphens: $SLUG"
[ "$SLUG" != "tools" ] || die "slug 'tools' is reserved"
if [ -z "$TITLE" ]; then
  TITLE="$(printf '%s' "$SLUG" | tr '-' ' ' | awk '{ for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) substr($i, 2) } 1')"
fi

if [ -n "$ENTRY" ]; then
  [ -f "$SOURCE/$ENTRY" ] || die "entry file not found: $SOURCE/$ENTRY"
elif [ -f "$SOURCE/index.html" ]; then
  ENTRY="index.html"
else
  mapfile -t HTML_FILES < <(find "$SOURCE" -maxdepth 1 -type f -iname '*.html' | sort)
  [ "${#HTML_FILES[@]}" -eq 1 ] || die "expected exactly one HTML file in $SOURCE; pass --entry <file>"
  ENTRY="$(basename "${HTML_FILES[0]}")"
fi

step "Preparing cached checkout at $REPO_DIR"
if [ -d "$REPO_DIR/.git" ]; then
  [ -z "$(git -C "$REPO_DIR" status --porcelain)" ] || die "cached checkout has uncommitted changes: $REPO_DIR"
  git -C "$REPO_DIR" pull --quiet --ff-only
else
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --quiet "$REPO_URL" "$REPO_DIR"
fi

DEST="$REPO_DIR/$SLUG"
[ ! -e "$DEST" ] || die "page already exists: $DEST"

step "Adding page files to $SLUG/"
cp -R "$SOURCE/." "$DEST/"
rm -f "$DEST/README.md"
if [ "$ENTRY" != "index.html" ]; then
  mv "$DEST/$ENTRY" "$DEST/index.html"
fi

step "Adding pages.js entry"
python3 - "$REPO_DIR/pages.js" "$SLUG" "$TITLE" "$DESC" "$DATE" <<'PY'
import json
import sys

path, slug, title, desc, date = sys.argv[1:6]
text = open(path, encoding="utf-8").read()
if f'url: "{slug}/"' in text or f"url: '{slug}/'" in text:
    sys.exit(f"pages.js already has an entry for {slug}/")
stripped = text.rstrip()
if not stripped.endswith("];"):
    sys.exit("pages.js does not end with ];")
entry = (
    "  {\n"
    f"    title: {json.dumps(title, ensure_ascii=False)},\n"
    f"    desc: {json.dumps(desc, ensure_ascii=False)},\n"
    f"    url: {json.dumps(slug + '/', ensure_ascii=False)},\n"
    f"    date: {json.dumps(date, ensure_ascii=False)},\n"
    "  },\n"
)
body = stripped[:-2].rstrip()
open(path, "w", encoding="utf-8").write(body + "\n" + entry + "];\n")
PY

step "Committing"
git -C "$REPO_DIR" add -- "$SLUG" pages.js
if git -C "$REPO_DIR" diff --cached --quiet; then
  echo "nothing to commit"
else
  git -C "$REPO_DIR" commit --quiet -m "Add $SLUG page" -- "$SLUG" pages.js
  git -C "$REPO_DIR" log -1 --oneline
fi

if [ "$NO_PUSH" = 1 ]; then
  step "Skipping push (--no-push)"
  exit 0
fi

step "Pushing to main"
git -C "$REPO_DIR" push

step "Waiting for $SITE_URL/$SLUG/ (Pages rebuild)"
code=""
attempt=1
while [ "$attempt" -le "$LIVE_WAIT_ATTEMPTS" ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/$SLUG/" || true)"
  if [ "$code" = "200" ]; then
    echo "live: $SITE_URL/$SLUG/ (200)"
    exit 0
  fi
  sleep "$LIVE_WAIT_SECONDS"
  attempt=$((attempt + 1))
done
echo "warning: $SITE_URL/$SLUG/ last returned $code; Pages may still be building" >&2
