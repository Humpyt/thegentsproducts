# The Gents product catalog

33 products with source comparisons, 4K PNG downloads, and shared product-price entry in UGX. `/` and `/review.html` serve the same catalog.

Each card has a price field and **Save price** button. A blank saved field clears that product's price; zero is a valid price. Saved prices are visible to everyone with the site link. **Export saved prices (CSV)** downloads all 33 product IDs and their latest saved prices. Unsaved drafts are kept in the browser when storage is available.

## Storage

The Netlify Function at `/.netlify/functions/prices` reads and writes the Google Sheet configured by `GOOGLE_SHEET_ID`. The `Product prices` tab shows all 33 products and their latest prices; `Price entries` keeps the submission history. `CLEARED` records an intentional blank price. Save is confirmed only after the entry can be read back from Google Sheets. Prices survive redeployments.

A dedicated service account has editor access to this sheet and no project-wide IAM role. Its JSON key is stored in the Netlify Functions environment variable `GOOGLE_SERVICE_ACCOUNT_JSON`. No credentials are committed or sent to visitors. Changing these environment variables requires a redeployment. The sheet remains private to its owner and the service account; visitors submit through the website.

Each journal entry includes its previous revision. In append order, only the first child of each revision is accepted. Stale edits receive a conflict response, including when viewers submit simultaneously. The overview formulas mirror this rule. Keep the journal in its original order and do not delete or edit journal rows; submit corrections using the website. The viewer interface is intentionally editable by visitors, as requested; it is not an authenticated store administration panel.

## Run and deploy

Use Node 22 or newer, then run `npm ci`, `npm test`, and `npm run build`. Deploy from this repository with `netlify deploy --build --prod`. The `public` directory is the publish directory and `netlify/functions` contains the API. Link the intended Netlify site first with `netlify link`.

Google CLI setup: use `gws sheets spreadsheets create` to create the workbook, `gws sheets spreadsheets values batchUpdate` to seed product details/formulas, and `gws drive permissions create` to share it with the dedicated service account. Set the two environment variables above using the Netlify CLI. The Google Sheets API must be enabled in the service account's project.

The original product photographs are included for comparison; the generated PNGs are upscaled 4K exports, not native 4K captures. Product fabric and size readings come from the photographed labels. Styling accessories are not additional products.
