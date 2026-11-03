-- MarketHub migration 002: add condition column + make product-images public-friendly
-- Run in Supabase SQL editor.

-- 1. Persist item condition
alter table public.listings
  add column if not exists condition text;

-- 2. Optional: make the storage bucket public (or do this in the Dashboard → Storage)
-- update storage.buckets set public = true where id = 'product-images';

-- 3. Recommended index
create index if not exists listings_status_stock_idx
  on public.listings (status, stock_quantity) where status = 'active';

comment on column public.listings.condition is 'Item condition (New, Used - good, Like new, etc.)';
