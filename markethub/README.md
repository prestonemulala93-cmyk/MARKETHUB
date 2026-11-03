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
| `SCHEMA.md` | Tables, RLS and the order/chat functions |
| `supabase/001_orders_chat_hardening.sql` | **Run this once** (orders, status rules, chat policies) |
| `supabase/002_add_condition.sql` | **Run this** — adds `listings.condition` column |

## What was implemented

### A — Cloud edit / mark sold / delete
- Seller dashboard loads **your** listings from Supabase (`shops.owner_id`).
- **Edit** updates the cloud row (optional new photos append).
- **Mark sold / Relist** sets `status` (+ stock).
- **Delete** removes image rows, storage objects, and the listing.

### B — Orders (v5: server-enforced)
- "Buy now" opens a checkout form; nothing is sent until **Send order request**.
- Orders are created by `place_order()`: price, shop and title come from the listing, repeat taps return the same order, basket items become one order each.
- Clients cannot insert/update orders directly. Status changes use `set_order_status()`:
  seller confirms, buyer sees the seller's number and pays them directly, seller taps **Payment received**, which marks the listing sold.
- No payment is processed and no PIN is collected. To add a gateway later, call `mark_order_paid()` from an Edge Function with the service-role key.
- Sample listings and failed cloud calls no longer create fake local orders.

### Chat (v5)
- Threads are `(listing uuid, buyer uuid)`. Sellers open buyer threads from **Messages** and can reply.
- Polling stops when the chat closes. Only thread participants can post (see migration).

### C — Modules
- Logic split into ES modules; one `index.html` entrypoint.
- Deploy the whole `markethub/` folder (HTML + `js/`).

## Supabase checklist

1. Create the tables from `SCHEMA.md`, then run `supabase/001_orders_chat_hardening.sql`.
2. Run `supabase/002_add_condition.sql` (adds the `condition` column).
3. In the Supabase Dashboard → Storage, make the `product-images` bucket **public** (or keep private and accept signed-URL cost). The app now prefers public URLs.
4. Ensure owners can `select/update/delete` their listings and manage `listing_images`.
5. Storage policies for `product-images` (upload/delete under own shop path).

## Fixes applied (v5.1)

- Removed the localStorage `userItems` mirror. Cloud UUIDs are now the item ids. Sold/deleted items no longer linger on the seller’s device.
- Map picker “Use my current location” no longer throws ReferenceError (`pickerMode` is no longer referenced from inline HTML).
- Nominatim searches are debounced (500 ms) to respect rate limits.
- Condition is collected and saved (requires the new column).
- Seller name and phone are updated on every publish (no longer frozen at the first listing).
- Publishing is atomic: insert as draft → upload photos → set active. Photo failure cleans up the draft.
- Photos are compressed to ~1280 px WebP before upload. Public URLs are preferred over signed URLs.
- Service worker now caches the app shell for basic offline support.
- Password reset (“Forgot password?”) added to the auth modal.
- Demo listings with fake phone numbers are no longer shown in the browse grid.
- Footer buttons call the dashboard functions directly (more reliable than clicking hidden buttons).
- Hard-refresh login issues should be reduced by the improved service worker; clear site data once after deploying the new `sw.js`.
