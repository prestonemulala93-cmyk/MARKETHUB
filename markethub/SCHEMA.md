# MarketHub Zambia — Supabase schema & RLS

Run these in the Supabase SQL editor if the tables/policies do not already exist.

## Existing tables (already used by the app)

### shops
- id (uuid, pk)
- owner_id (uuid → auth.users)
- name, phone, email, status

### listings
- id (uuid, pk)
- shop_id (uuid → shops)
- title, description, category
- condition (text) — item condition (New, Used - good, etc.)
- price_zmw (numeric)
- stock_quantity (int)
- status (text: active | sold | draft)
- location_name, address
- latitude, longitude
- created_at

### listing_images
- id (optional)
- listing_id (uuid → listings)
- storage_path
- alt_text, sort_order, display_order, is_primary

### Storage bucket
- `product-images` (private) — app uses createSignedUrl

## New table: orders

```sql
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  shop_id uuid references public.shops(id) on delete set null,
  buyer_id uuid references auth.users(id) on delete set null,
  buyer_name text not null,
  buyer_phone text not null,
  buyer_town text,
  fulfilment text,
  drop_address text,
  drop_pin text,
  payment_method text,
  notes text,
  item_title text not null,
  price_zmw numeric not null default 0,
  status text not null default 'pending'
    check (status in ('pending','confirmed','completed','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists orders_buyer_id_idx on public.orders(buyer_id);
create index if not exists orders_shop_id_idx on public.orders(shop_id);
create index if not exists orders_status_idx on public.orders(status);
```

## Orders & chat security (apply `supabase/001_orders_chat_hardening.sql`)

Run the migration file instead of hand-writing policies. In short:

**Orders are read-only for clients.** Keep only the two select policies:

```sql
alter table public.orders enable row level security;

create policy "buyers_read_own_orders" on public.orders
  for select to authenticated using (buyer_id = auth.uid());

create policy "sellers_read_shop_orders" on public.orders
  for select to authenticated
  using (shop_id in (select id from public.shops where owner_id = auth.uid()));
```

All writes go through functions (the migration creates them and revokes direct insert/update):

| Function | Who | What |
|---|---|---|
| `place_order(listing_id, name, phone, town, fulfilment, drop_address, drop_pin, notes)` | signed-in buyer | Takes price, shop and title from the listing; refuses own/unavailable listings; returns the existing open order on a repeat tap |
| `set_order_status(order_id, status)` | buyer or seller | pending→confirmed (seller), confirmed→completed (seller, once paid), pending/confirmed→cancelled (either) |
| `mark_order_paid(order_id)` | `service_role` only | For a payment-gateway webhook; same effect as the seller marking paid |

Completing an order marks the listing `sold` (stock 0) and cancels other open orders on it.

**Messages**

```sql
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  buyer_id uuid,
  sender_id uuid,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;

create policy "chat_read" on public.messages
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or sender_id = auth.uid()
    or listing_id in (
      select l.id from public.listings l
      join public.shops s on s.id = l.shop_id
      where s.owner_id = auth.uid()
    )
  );

-- Insert only into threads you belong to (migration defines can_post_message):
-- a buyer starts a thread as themselves; a seller can reply only on their own listing,
-- and only to a buyer who has already written in that thread.
create policy "chat_insert" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_post_message(listing_id, buyer_id));
```

### Listings policies needed for edit / sold / delete

```sql
-- Owner can update own listings (via shop)
create policy "owners_update_listings" on public.listings
  for update to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  )
  with check (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

-- Owner can delete own listings
create policy "owners_delete_listings" on public.listings
  for delete to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

-- Owner can manage listing_images for own listings
create policy "owners_manage_listing_images" on public.listing_images
  for all to authenticated
  using (
    listing_id in (
      select l.id from public.listings l
      join public.shops s on s.id = l.shop_id
      where s.owner_id = auth.uid()
    )
  )
  with check (
    listing_id in (
      select l.id from public.listings l
      join public.shops s on s.id = l.shop_id
      where s.owner_id = auth.uid()
    )
  );
```

### Public read of active listings (already expected)

```sql
create policy "public_read_active_listings" on public.listings
  for select to anon, authenticated
  using (status = 'active' and stock_quantity > 0);
```

Owners also need to **select** their non-active listings:

```sql
create policy "owners_read_own_listings" on public.listings
  for select to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );
```

## Guest checkout

Not supported. `place_order` requires a signed-in buyer, and the app no longer saves "demo" orders locally.
