# akhil3645.github.io

Static pages hosted on GitHub Pages. GitHub is the store, Pages is the egress.

Live at: https://akhil3645.github.io/

## Add a new page

1. Create a folder in the repo root, e.g. `my-page/`, containing an `index.html`
   (plus any page-owned assets, referenced with relative paths).
2. Append an entry to `pages.js` so it shows up on the home page:

   ```js
   {
     title: "My Page",
     desc: "Short description",
     url: "my-page/",
     date: "Sep 17, 2026",
   }
   ```

3. Preview and test locally using the steps below.
4. Commit and push to `main`. Pages rebuilds automatically.

The page goes live at `https://akhil3645.github.io/my-page/`.

## Tailwind CSS for development and prototyping

Tailwind Play CDN is supported. **No npm installation, bundler, or build step is
required.** Pages can use plain CSS or Tailwind; existing pages do not need migration.
Use the pinned Tailwind v4 browser package, `4.3.3`, in this starter:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My prototype</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
    <style type="text/tailwindcss">
      @theme {
        --color-brand: #215cbd;
      }
    </style>
  </head>
  <body class="min-h-screen bg-slate-100 p-8 text-slate-900">
    <main class="mx-auto max-w-lg rounded-xl bg-white p-6 shadow-sm">
      <h1 class="text-2xl font-bold text-brand">My prototype</h1>
      <button class="mt-4 rounded-lg bg-brand px-4 py-2 text-white">
        Explore
      </button>
    </main>
  </body>
</html>
```

- Use Tailwind utility classes directly in HTML and JavaScript-generated markup.
- Put theme tokens and reusable `@apply` components in a page-local
  `<style type="text/tailwindcss">` block.
- Use complete utility class names in dynamic markup.
- Pin the CDN version; verify styling when upgrading. The older
  `https://cdn.tailwindcss.com` snippet uses the v3 configuration model; these pages
  use the v4 browser package and `@theme` syntax instead.
- Styling requires the CDN to load. Page scripts and other page-owned assets remain
  relative and self-contained. This setup is intended for demos and prototypes.

## Local preview and verification

From the repo root (requires Python 3):

```bash
python3 -m http.server 4317 --bind 127.0.0.1
```

Open `http://127.0.0.1:4317/my-page/`. Edit HTML/JS and reload—no CSS compilation step.
Before publishing, test the page with agent-browser at the intended viewport sizes,
including its interactive controls, validation, and any share links.

After pushing, confirm the page is deployed:

```bash
curl -I https://akhil3645.github.io/my-page/
```
