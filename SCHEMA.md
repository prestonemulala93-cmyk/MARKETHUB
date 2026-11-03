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

## RLS (adjust to your security model)

```sql
alter table public.orders enable row level security;

-- Buyers can insert their own orders (or anonymous insert if you allow guest checkout)
create policy "buyers_insert_orders" on public.orders
  for insert to authenticated
  with check (buyer_id = auth.uid());

-- Buyers read their own orders
create policy "buyers_read_own_orders" on public.orders
  for select to authenticated
  using (buyer_id = auth.uid());

-- Sellers read orders for shops they own
create policy "sellers_read_shop_orders" on public.orders
  for select to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

-- Buyer can mark their own order completed or cancelled
create policy "buyers_update_own_orders" on public.orders
  for update to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid,
  buyer_id uuid,
  sender_id uuid,
  body text not null,
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

create policy "chat_insert" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid());

-- Sellers update status on their shop orders
create policy "sellers_update_shop_orders" on public.orders
  for update to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  )
  with check (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );
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

## Guest checkout note

If you want orders without sign-in, add an anon insert policy and leave `buyer_id` null. The app currently prefers signed-in buyers when a session exists, and still allows demo-local fallback if the orders table is missing.
