#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${PUBLISH_REPO_URL:-git@github.com:akhil3645/akhil3645.github.io.git}"
REPO_DIR="${PUBLISH_REPO_DIR:-$HOME/.cache/akhil3645.github.io}"
SITE_URL="${PUBLISH_SITE_URL:-https://akhil3645.github.io}"
SMOKE_PORT="${PUBLISH_SMOKE_PORT:-4318}"
LIVE_WAIT_ATTEMPTS=24
LIVE_WAIT_SECONDS=5

SOURCE=""
SLUG=""
TITLE=""
DESC=""
DATE="$(date +'%b %-d, %Y')"
ENTRY=""
RANDOM_SLUG=0
NO_PUSH=0
SKIP_SMOKE=0
INCLUDE_README=0
SMOKE_SERVER_PID=""

usage() {
  cat <<'USAGE'
Publish a folder as a page on akhil3645.github.io.

Usage:
  tools/publish-page.sh --source <dir> [options]

Required:
  --source <dir>       Folder containing the page HTML and its assets

Options:
  --slug <slug>        URL slug; kebab-case, random strings are fine
                       (default: kebab-case of --title, else random)
  --title <text>       Hub card title (default: title-cased slug)
  --desc <text>        Hub card description (default: empty)
  --entry <file>       HTML file to publish as index.html
                       (default: index.html, else the only *.html file)
  --date <text>        Hub card date (default: today, e.g. "Sep 29, 2026")
  --random-slug        Generate a short random slug
  --include-readme     Copy the source README.md (excluded by default)
  --no-push            Do everything except push and the live check
  --skip-smoke         Skip the HTTP smoke checks
  -h, --help           Show this help

Environment:
  PUBLISH_REPO_DIR         Cached checkout path
                           (default: ~/.cache/akhil3645.github.io)
  PUBLISH_REPO_URL         Git remote (default: git@github.com:akhil3645/akhil3645.github.io.git)
  PUBLISH_SITE_URL         Live site base URL (default: https://akhil3645.github.io)
  PUBLISH_SMOKE_PORT       Port for the local smoke-check server (default: 4318)

The script keeps a cached checkout, so it clones once and pulls after that.
It copies the page, appends the pages.js hub entry, runs HTTP smoke checks
(200, title, referenced assets; no browser or screenshots), commits, pushes,
and waits for the live URL to return 200.
USAGE
}

die() {
  echo "error: $*" >&2
  exit 1
}

step() {
  printf '\n==> %s\n' "$*"
}

cleanup_smoke_server() {
  if [ -n "$SMOKE_SERVER_PID" ]; then
    kill "$SMOKE_SERVER_PID" 2>/dev/null || true
    SMOKE_SERVER_PID=""
  fi
}

trap cleanup_smoke_server EXIT

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
    --random-slug) RANDOM_SLUG=1; shift ;;
    --no-push) NO_PUSH=1; shift ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    --include-readme) INCLUDE_README=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[ -n "$SOURCE" ] || { usage >&2; die "--source is required"; }
[ -d "$SOURCE" ] || die "source folder not found: $SOURCE"
command -v python3 >/dev/null || die "python3 is required"
command -v git >/dev/null || die "git is required"
SOURCE="$(cd "$SOURCE" && pwd)"

if [ "$RANDOM_SLUG" = 1 ]; then
  SLUG="$(random_slug)"
elif [ -z "$SLUG" ]; then
  if [ -n "$TITLE" ]; then
    SLUG="$(kebab "$TITLE")"
  fi
  [ -n "$SLUG" ] || SLUG="$(random_slug)"
fi
[[ "$SLUG" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || die "slug must be lowercase letters, digits and hyphens: $SLUG"
[ "${#SLUG}" -le 64 ] || die "slug is too long (max 64 characters)"
[ "$SLUG" != "tools" ] || die "slug 'tools' is reserved"

if [ -z "$TITLE" ]; then
  TITLE="$(printf '%s' "$SLUG" | tr '-' ' ' | awk '{ for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) substr($i, 2) } 1')"
fi

if [ -n "$ENTRY" ]; then
  [ -f "$SOURCE/$ENTRY" ] || die "entry file not found: $SOURCE/$ENTRY"
else
  if [ -f "$SOURCE/index.html" ]; then
    ENTRY="index.html"
  else
    mapfile -t HTML_FILES < <(find "$SOURCE" -maxdepth 1 -type f -iname '*.html' | sort)
    if [ "${#HTML_FILES[@]}" -ne 1 ]; then
      die "expected exactly one HTML file in $SOURCE; pass --entry <file>"
    fi
    ENTRY="$(basename "${HTML_FILES[0]}")"
  fi
fi

step "Preparing cached checkout at $REPO_DIR"
if [ -d "$REPO_DIR/.git" ]; then
  if [ -n "$(git -C "$REPO_DIR" status --porcelain)" ]; then
    die "cached checkout has uncommitted changes: $REPO_DIR"
  fi
  git -C "$REPO_DIR" fetch --quiet origin main
  git -C "$REPO_DIR" checkout --quiet main
  git -C "$REPO_DIR" merge --ff-only --quiet origin/main
else
  if [ -e "$REPO_DIR" ]; then
    die "$REPO_DIR exists but is not a git checkout"
  fi
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --quiet "$REPO_URL" "$REPO_DIR"
fi

DEST="$REPO_DIR/$SLUG"
if [ -e "$DEST" ]; then
  die "page already exists: $DEST"
fi

step "Copying page to $SLUG/"
cp -R "$SOURCE/." "$DEST/"
if [ "$INCLUDE_README" = 0 ]; then
  rm -f "$DEST/README.md"
fi
if [ "$ENTRY" != "index.html" ]; then
  mv "$DEST/$ENTRY" "$DEST/index.html"
fi

step "Checking page references"
unresolved=0
refs="$(grep -rhoE '(src|href)="[^"]+"' "$DEST" --include='*.html' | sed -E 's/^[a-z]+="//; s/"$//' | sort -u || true)"
while IFS= read -r ref; do
  case "$ref" in
    ""|\#*|http://*|https://*|mailto:*|tel:*|data:*|javascript:*|//*) continue ;;
    file://*) echo "  file reference: $ref"; unresolved=1; continue ;;
    /*) echo "  absolute path: $ref"; unresolved=1; continue ;;
  esac
  target="${ref%%#*}"
  target="${target%%\?*}"
  [ -z "$target" ] && continue
  if [ ! -e "$DEST/$target" ]; then
    echo "  missing: $ref"
    unresolved=1
  fi
done <<< "$refs"
if [ "$unresolved" -ne 0 ]; then
  die "page references do not resolve"
fi

step "Appending hub entry to pages.js"
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

run_smoke_test() {
  local url server_ready=0 ok=1 title refs ref target code
  url="http://127.0.0.1:$SMOKE_PORT/$SLUG/"
  (cd "$REPO_DIR" && exec python3 -m http.server "$SMOKE_PORT" --bind 127.0.0.1) >/dev/null 2>&1 &
  SMOKE_SERVER_PID=$!
  for _ in $(seq 1 20); do
    if curl -sf -o /dev/null "$url"; then
      server_ready=1
      break
    fi
    sleep 0.3
  done
  if [ "$server_ready" != 1 ]; then
    cleanup_smoke_server
    die "local server did not serve $url (is port $SMOKE_PORT in use? set PUBLISH_SMOKE_PORT to change it)"
  fi
  title="$(curl -s "$url" | grep -oE '<title>[^<]*</title>' | head -1 | sed -E 's/^<title>//; s/<\/title>$//' || true)"
  if [ -z "$title" ]; then
    echo "smoke: page <title> is missing or empty" >&2
    ok=0
  fi
  refs="$(grep -rhoE '(src|href)="[^"]+"' "$REPO_DIR/$SLUG" --include='*.html' | sed -E 's/^[a-z]+="//; s/"$//' | sort -u || true)"
  while IFS= read -r ref; do
    case "$ref" in
      ""|\#*|http://*|https://*|mailto:*|tel:*|data:*|javascript:*|//*) continue ;;
    esac
    target="${ref%%#*}"
    target="${target%%\?*}"
    [ -z "$target" ] && continue
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url$target" || true)"
    if [ "$code" != "200" ]; then
      echo "smoke: $ref returned $code" >&2
      ok=0
    fi
  done <<< "$refs"
  cleanup_smoke_server
  if [ "$ok" != 1 ]; then
    die "smoke test failed for $url"
  fi
  echo "smoke: ok (title: $title)"
}

if [ "$SKIP_SMOKE" = 1 ]; then
  step "Skipping smoke test (--skip-smoke)"
else
  step "Smoke testing $SLUG/"
  run_smoke_test
fi

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
else
  step "Pushing to main"
  git -C "$REPO_DIR" push
  step "Waiting for $SITE_URL/$SLUG/ (Pages rebuild)"
  live_code=""
  attempt=1
  while [ "$attempt" -le "$LIVE_WAIT_ATTEMPTS" ]; do
    live_code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/$SLUG/" || true)"
    if [ "$live_code" = "200" ]; then
      break
    fi
    sleep "$LIVE_WAIT_SECONDS"
    attempt=$((attempt + 1))
  done
  if [ "$live_code" = "200" ]; then
    if curl -s "$SITE_URL/pages.js" | grep -q "url: \"$SLUG/\""; then
      echo "live: $SITE_URL/$SLUG/ (200, hub entry present)"
    else
      echo "live: $SITE_URL/$SLUG/ (200; hub entry not visible yet)" >&2
    fi
  else
    echo "warning: $SITE_URL/$SLUG/ last returned $live_code; Pages may still be building" >&2
  fi
fi

step "Done"
echo "page: $SITE_URL/$SLUG/"
if [ "$NO_PUSH" = 1 ]; then
  echo "note: not pushed (--no-push); cached checkout is $REPO_DIR"
fi
