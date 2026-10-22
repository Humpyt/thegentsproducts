# The Gents product catalog

33 products with source comparisons, 4K PNG downloads, and shared product-price entry in UGX. `/` and `/review.html` serve the same catalog.

Each card has a price field and **Save price** button. A blank saved field clears that product's price; zero is a valid price. Saved prices are visible to everyone with the site link. **Export saved prices (CSV)** downloads all 33 product IDs and their latest saved prices. Unsaved drafts are kept in the browser when storage is available.

## Storage

The Netlify Function at `/.netlify/functions/prices` stores prices in the site-wide `the-gents-product-prices-v1` Netlify Blobs store. No credentials are shipped to the browser. Strong reads and conditional writes prevent stale edits from silently overwriting another viewer's change. Prices survive redeployments. The viewer interface is intentionally editable by visitors, as requested; it is not an authenticated store administration panel.

## Run and deploy

Use Node 22 or newer, then run `npm ci`, `npm test`, and `npm run build`. Deploy from this repository with `netlify deploy --build --prod`. The `public` directory is the publish directory and `netlify/functions` contains the API. Link the intended Netlify site first with `netlify link`.

The original product photographs are included for comparison; the generated PNGs are upscaled 4K exports, not native 4K captures. Product fabric and size readings come from the photographed labels. Styling accessories are not additional products.
