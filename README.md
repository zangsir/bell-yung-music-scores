# The Bell Yung Score Library — GitHub Pages Edition

A deployable, static catalog for **49 original photographs** (48 active catalog records and one unrelated photo preserved in Trash) shared by Prof. Bell Yung. Based on the original transcribed inventory. Designed for GitHub Pages without Python, SQLite, or a server backend.

## Deploy to GitHub Pages

1. Create a GitHub repository, e.g. `bell-yung-score-archive`.
2. Extract this ZIP and put **the files/folders inside it** in your repository root, not the enclosing folder. `index.html` must be at the root. Since this bundle contains more than 100 files, use **GitHub Desktop** / Git, or upload files through GitHub in **at least two batches** (GitHub browser upload is limited to 100 files at once).
3. From your repository, go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/(root)`, then **Save**.
5. Your site will appear at `https://YOUR-USERNAME.github.io/bell-yung-score-archive/` after deployment. For a special repository named `YOUR-USERNAME.github.io`, the site will be at `https://YOUR-USERNAME.github.io/`.

All links and assets use **relative paths**, so both types of GitHub Pages URLs are supported. A `.nojekyll` file is included to serve the site unchanged.

## What is included

- 48 active catalog records (45 score covers, three publisher/catalog items) plus one unrelated item `BY-0030` in Trash; permanent IDs `BY-0001` … `BY-0049`.
- Optimized cover photographs and gallery thumbnails in `images/` and `thumbs/`.
- Static catalog data in **`data/catalog.json`** (no backend required).
- Search by composer/title/publisher/ID, filters, grid and list views, detail panels, and editable catalog fields.
- **74 curated further-reading links**, with short background notes for all 48 active entries; sources are labeled as composition, broader collection, edition or composer context. Links are external and may change over time.
- Browser-based local editing, **Delete record → Trash → Restore**, and JSON/CSV export/import. Deleted records are hidden from the gallery but preserved in the JSON backup; original photos are never deleted.
- `help.html` with visual-site instructions.

## How edits work on GitHub Pages (important)

GitHub Pages only serves static files: it cannot save user edits to the repository or run SQLite. This site therefore uses **browser localStorage** as a private editing workspace:

1. In the deployed site, open a score → **Edit record**, and make changes. Use **New record** for new scores. To delete, open any score and click **Delete record**, confirm, and use **Trash** in the header if you want to restore it. These edits are visible only in your browser; website visitors will still see the committed catalog.
2. Use **Export → Download catalog.json** to download all your records and the recoverable Trash (including local changes).
3. Commit that file to your repository, **replacing `data/catalog.json`**. If using GitHub's web interface, open the file and paste in the downloaded JSON, or upload a replacement via Git.
4. Once GitHub Pages redeploys, other visitors see your new version.

The published file contains an object with **`records`** (active records) and **`deleted_records`** (recoverable Trash). Older catalog JSON files containing a plain array are still supported for import. Every ID is reserved while its record is in Trash, even after publishing, so a newly created record will never reuse it. You can use **Export → Import JSON backup** to load a saved catalog, or **Discard browser edits** to restore the published catalog in that browser. Use CSV export for spreadsheet work. **Regularly export a JSON backup**: browser storage is not the canonical database.

**Cover photos:** Existing WebP images are already included. For a new image, upload one in Edit mode to compress and embed it into exported JSON (convenient for occasional additions). For a scalable archive, put the new photo in `images/` (optional thumbnail in `thumbs/`) and set its relative image path in the record before exporting JSON.

**Local preview:** From this directory, run `python -m http.server 8000` or `python3 -m http.server 8000`, then open `http://localhost:8000/`. No Python is needed after GitHub deployment.

## Data layout

- `index.html`: main gallery
- `app.js`: browser application and editing/export logic
- `styles.css`: responsive design
- `data/catalog.json`: the published data source; active `records` and recoverable `deleted_records`
- `data/initial_catalog.csv`: active inventory with added notes and reference links (reference only)
- `images/`: full display cover photos
- `thumbs/`: gallery thumbnails
- `help.html`: website guide
- `.nojekyll`: bypass Jekyll processing

## Review, provenance and privacy

The active inventory contains **45 photographs identified as score covers** and **3 publisher ads/catalogs**; the unrelated installation sheet remains recoverable in Trash. Some photographed covers could be multiple photos of one physical item; physical identity is not verified. Title, composer, edition, and publisher metadata were transcribed from photographs and may need checking against the actual printed scores. IDs refer to photograph records until the physical catalog is reconciled. The source filenames are retained.

All repository files can be publicly accessible when served by GitHub Pages. Before sharing the URL, consider image rights, inscription details, personal notes, and provenance information. GitHub Pages does **not** provide an authenticated private editing database.

## Music background and external reading links

Every active record includes `context_note` (an introductory description) and `reference_links` (an array of `{label,url,scope}` objects). The detail panel displays this content under **Learn about this music**, with clearly marked links for the work, broader repertoire, edition, or composer. The stories are brief editorial introductions based on independently sourced background, **not** verified descriptions of the particular physical copies or their provenance. Some anthologies do not identify the exact included compositions until a contents-page check.

To edit: open a score → **Edit record** → update **Short background for visitors** and **External sources**. Enter one source per line using `Label | https://example.com/article | work`. Allowed scopes: `work`, `collection`, `edition`, `composer`. Up to eight links per record. Save and **Export → Download catalog.json**; publish the exported file to GitHub. Links are included in JSON and CSV exports. Old catalog JSON backups without these fields remain importable.

**If you have previous unpublished browser edits:** the site offers a choice to keep those edits when the published catalog changes. It fills in newly researched fields that were absent from your older local catalog where possible. For reliable preservation, export your current JSON backup before replacing deployed files.
