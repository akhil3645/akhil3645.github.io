# Agent Instructions — akhil3645.github.io

Static pages site. GitHub is the store, GitHub Pages is the egress. No installation or build step. Tailwind Play CDN is supported for styling prototypes.

Live site: https://akhil3645.github.io/

## Publishing a new page

Fast path from a design-export folder:

```bash
tools/publish-page.sh --source <dir> --slug <slug> --title "..." --desc "..."
```

The script uses a cached checkout at `~/.cache/akhil3645.github.io` (override with `PUBLISH_REPO_DIR`), so it clones once and pulls after that. It copies the page files, appends the `pages.js` entry, commits, pushes, then polls the live URL with curl until it returns 200. Run `tools/publish-page.sh --help` for all options.

Manual path (what the script automates):

1. Create a folder at the repo root named in kebab-case (e.g. `my-demo/`). The folder name becomes the URL slug.
2. Put an `index.html` in it plus any assets. Reference all assets with relative paths — the site serves pages from subpaths, so absolute paths will break.
3. Append one entry to `pages.js` so the page appears on the hub:

   ```js
   {
     title: "My Page",
     desc: "Short description shown on the hub card",
     url: "my-demo/",
     date: "Sep 10, 2026",
   }
   ```

4. Commit and push to `main`:

   ```bash
   git add -A && git commit -m "Add my-demo page" && git push
   ```

5. The page is live in ~30–60s at `https://akhil3645.github.io/my-demo/`.

## Slug conventions

- Lowercase kebab-case: letters, digits and hyphens, no leading or trailing hyphen (`a2-block-statements`, `v2-builder-prototype`).
- Derived from the hub title when `--slug` is omitted, with a random string as fallback. Random slugs are fine when no meaningful name exists.
- The slug is both the folder name and the public URL. Renaming it later breaks shared links, so pick once and keep it.

## Conventions

- Plain HTML/CSS/JS only. No frameworks or bundlers. Tailwind Play CDN is an allowed external dependency for prototypes; pin its version and document it. Other dependencies require an explicit decision.
- Use Tailwind utilities in HTML/JS and a page-local `<style type="text/tailwindcss">` for theme tokens and components. See README for the starter snippet. No npm install or CSS build is needed.
- Use images at their original resolution. Never re-encode, resize, or recompress screenshot assets.
- `pages.js` is the single source of truth for the hub listing. Every published page must have an entry there.
- Keep README focused on how the repository works and how to develop/publish pages. Put page-specific descriptions in `pages.js` or the page itself, not README.
- Keep page-owned assets self-contained with relative paths. Tailwind pages require the documented CDN to load for styling.
- The repo is public. Never commit credentials, tokens, internal-only material, or content not meant to be shared. Review screenshot content (browser chrome, tabs, bookmarks, emails can be visible) before pushing.

## Verification

- Publishing is confirmed by curl: the script polls the live URL until it returns 200.
- No browser, screenshots, or pixel-level passes during publishing. Do a visual or interaction pass only when styling or interactive behavior is what changed, or when the user asks.
- To confirm manually:

  ```bash
  curl -s -o /dev/null -w "%{http_code}" https://akhil3645.github.io/<folder>/
  ```

  A `200` within a couple of minutes means the publish succeeded; a `404` means the build has not finished yet — wait and retry.
