# MarketHub Zambia (modular)

## Run locally

ES modules need an HTTP server (not `file://`):

```bash
cd markethub
python3 -m http.server 8080
```

Open http://localhost:8080/

## Layout

| Path | Role |
|------|------|
| `index.html` | Shell, CSS, markup |
| `js/config.js` | Supabase URL/key, demo data |
| `js/state.js` | Shared state + localStorage |
| `js/utils.js` | escapeHtml, money, toast |
| `js/auth.js` | Sign up / sign in / session |
| `js/cloud.js` | Listings CRUD, images, orders API |
| `js/maps.js` | Map picker, geolocation, route start search |
| `js/cart.js` | Basket + route planner |
| `js/listings-ui.js` | Grid, detail, sell/edit form |
| `js/orders.js` | Checkout + buyer orders |
| `js/seller.js` | Seller dashboard (cloud edit/sold/delete) |
| `js/app.js` | Boot + wiring |
| `SCHEMA.md` | SQL for `orders` table + RLS |

## What was implemented

### A — Cloud edit / mark sold / delete
- Seller dashboard loads **your** listings from Supabase (`shops.owner_id`).
- **Edit** updates the cloud row (optional new photos append).
- **Mark sold / Relist** sets `status` (+ stock).
- **Delete** removes image rows, storage objects, and the listing.

### B — Real orders
- Checkout inserts into `public.orders` when the listing has a `cloudDbId` and the table/RLS allow it.
- Falls back to localStorage if the table is missing or RLS blocks.
- Buyer **My Orders** shows cloud + local.
- Seller dashboard **Orders** lists shop orders with Confirm / Complete / Cancel.

### C — Modules
- Logic split into ES modules; one `index.html` entrypoint.
- Deploy the whole `markethub/` folder (HTML + `js/`).

## Supabase checklist

1. Apply SQL in `SCHEMA.md` (orders table + RLS).
2. Ensure owners can `select/update/delete` their listings and manage `listing_images`.
3. Storage policies for `product-images` (upload/delete under own shop path).

Without the orders table, listings/auth still work; orders stay local-only.
