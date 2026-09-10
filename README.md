# akhil3645.github.io

Static pages hosted on GitHub Pages. GitHub is the store, Pages is the egress.

Live at: https://akhil3645.github.io/

## Add a new page

1. Create a folder in the repo root, e.g. `my-page/`, containing an `index.html`
   (plus any assets, referenced with relative paths).
2. Append an entry to `pages.js` so it shows up on the home page:

   ```js
   {
     title: "My Page",
     desc: "Short description",
     url: "my-page/",
     date: "Sep 10, 2026",
   }
   ```

3. Commit and push to `main`. Pages rebuilds automatically.

The page goes live at `https://akhil3645.github.io/my-page/`.
