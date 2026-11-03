-- MarketHub migration 001: lock down orders + chat
-- Run once in the Supabase SQL editor (safe to re-run).
-- Fixes: forged orders/prices/status, fake "payment", open chat inserts, double-sold items.
--
-- BEHAVIOUR AFTER THIS MIGRATION
--   * Clients can only READ orders. Writes go through place_order() / set_order_status().
--   * Price, shop and item title are taken from the listing on the server (never from the browser).
--   * Status machine:  pending -> confirmed (seller) -> completed (seller, after being paid)
--                      pending|confirmed -> cancelled (buyer or seller)
--   * Completing an order marks the listing sold and cancels other open orders on it.
--   * mark_order_paid() is for a payment gateway webhook (service_role only) - see bottom.

begin;

-- 0. Clean existing duplicate open orders (old "Buy now" created one per tap) --------
update public.orders o
   set status = 'cancelled'
 where o.status in ('pending','confirmed')
   and o.buyer_id is not null and o.listing_id is not null
   and exists (
     select 1 from public.orders n
      where n.buyer_id = o.buyer_id and n.listing_id = o.listing_id
        and n.status in ('pending','confirmed')
        and (n.created_at > o.created_at or (n.created_at = o.created_at and n.id > o.id))
   );

create unique index if not exists orders_one_open_per_buyer_listing
  on public.orders (buyer_id, listing_id) where status in ('pending','confirmed');

-- 1. ORDERS: read-only for clients ---------------------------------------------------
drop policy if exists "buyers_insert_orders"       on public.orders;
drop policy if exists "buyers_update_own_orders"   on public.orders;
drop policy if exists "sellers_update_shop_orders" on public.orders;
revoke insert, update, delete on public.orders from anon, authenticated;

-- Internal helper: finish an order (called only by the functions below).
create or replace function public._finish_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  update public.orders set status = 'completed' where id = p_order_id returning * into o;
  if o.listing_id is not null then
    update public.listings set status = 'sold', stock_quantity = 0 where id = o.listing_id;
    update public.orders set status = 'cancelled'
     where listing_id = o.listing_id and id <> o.id and status in ('pending','confirmed');
  end if;
  return o;
end $$;
revoke all on function public._finish_order(uuid) from public, anon, authenticated;

-- Place an order. Idempotent: a second tap returns the existing open order.
create or replace function public.place_order(
  p_listing_id   uuid,
  p_buyer_name   text,
  p_buyer_phone  text,
  p_buyer_town   text default null,
  p_fulfilment   text default null,
  p_drop_address text default null,
  p_drop_pin     text default null,
  p_notes        text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  l public.listings%rowtype;
  s public.shops%rowtype;
  o public.orders%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if coalesce(btrim(p_buyer_name), '') = '' or coalesce(btrim(p_buyer_phone), '') = '' then
    raise exception 'Name and phone are required' using errcode = '22023';
  end if;

  select * into l from public.listings where id = p_listing_id;
  if not found or l.status <> 'active' or coalesce(l.stock_quantity, 0) <= 0 then
    raise exception 'This item is no longer available' using errcode = 'P0001';
  end if;

  select * into s from public.shops where id = l.shop_id;
  if s.owner_id = uid then
    raise exception 'You cannot order your own listing' using errcode = 'P0001';
  end if;

  select * into o from public.orders
   where buyer_id = uid and listing_id = l.id and status in ('pending','confirmed') limit 1;
  if found then return o; end if;

  begin
    insert into public.orders (
      listing_id, shop_id, buyer_id, buyer_name, buyer_phone, buyer_town,
      fulfilment, drop_address, drop_pin, payment_method, notes,
      item_title, price_zmw, status
    ) values (
      l.id, l.shop_id, uid, left(btrim(p_buyer_name), 80), left(btrim(p_buyer_phone), 30),
      left(nullif(btrim(coalesce(p_buyer_town, '')), ''), 60),
      left(nullif(btrim(coalesce(p_fulfilment, '')), ''), 60),
      left(nullif(btrim(coalesce(p_drop_address, '')), ''), 200),
      left(nullif(btrim(coalesce(p_drop_pin, '')), ''), 60),
      'Pay seller directly',
      left(nullif(btrim(coalesce(p_notes, '')), ''), 300),
      l.title, coalesce(l.price_zmw, 0), 'pending'
    ) returning * into o;
  exception when unique_violation then
    select * into o from public.orders
     where buyer_id = uid and listing_id = l.id and status in ('pending','confirmed') limit 1;
  end;
  return o;
end $$;
revoke all on function public.place_order(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.place_order(uuid,text,text,text,text,text,text,text) to authenticated;

-- Change an order's status (server enforces who may do what).
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  o public.orders%rowtype;
  is_buyer boolean;
  is_seller boolean;
  l public.listings%rowtype;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;

  is_buyer  := (o.buyer_id = uid);
  is_seller := exists (select 1 from public.shops where id = o.shop_id and owner_id = uid);
  if not (is_buyer or is_seller) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_status = o.status then return o; end if;

  if o.status = 'pending' and p_status = 'confirmed' and is_seller then
    select * into l from public.listings where id = o.listing_id;
    if not found or l.status <> 'active' or coalesce(l.stock_quantity, 0) <= 0 then
      raise exception 'This item is no longer available' using errcode = 'P0001';
    end if;
    update public.orders set status = 'confirmed' where id = o.id returning * into o;
  elsif o.status in ('pending','confirmed') and p_status = 'cancelled' and (is_seller or is_buyer) then
    update public.orders set status = 'cancelled' where id = o.id returning * into o;
  elsif o.status = 'confirmed' and p_status = 'completed' and is_seller then
    o := public._finish_order(o.id);
  else
    raise exception 'Cannot change an order from % to %', o.status, p_status using errcode = 'P0001';
  end if;
  return o;
end $$;
revoke all on function public.set_order_status(uuid,text) from public, anon;
grant execute on function public.set_order_status(uuid,text) to authenticated;

-- For a payment-gateway webhook / Edge Function using the service_role key.
create or replace function public.mark_order_paid(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if o.status <> 'confirmed' then
    raise exception 'Order is % (must be confirmed)', o.status using errcode = 'P0001';
  end if;
  return public._finish_order(o.id);
end $$;
revoke all on function public.mark_order_paid(uuid) from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid) to service_role;

-- 2. MESSAGES: only post into threads you belong to ----------------------------------
-- A buyer starts a thread (buyer_id = themselves). A seller may reply only on their own
-- listing and only to a buyer who has already written in that thread.
create or replace function public.can_post_message(p_listing uuid, p_buyer uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and p_buyer is not null and (
    p_buyer = auth.uid()
    or exists (
      select 1
        from public.listings l join public.shops s on s.id = l.shop_id
       where l.id = p_listing and s.owner_id = auth.uid()
         and exists (
           select 1 from public.messages m
            where m.listing_id = p_listing and m.buyer_id = p_buyer and m.sender_id = p_buyer
         )
    )
  );
$$;
revoke all on function public.can_post_message(uuid,uuid) from public, anon;
grant execute on function public.can_post_message(uuid,uuid) to authenticated;

drop policy if exists "chat_insert" on public.messages;
create policy "chat_insert" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_post_message(listing_id, buyer_id));

alter table public.messages drop constraint if exists messages_body_len;
alter table public.messages
  add constraint messages_body_len check (char_length(body) between 1 and 2000) not valid;

alter table public.messages drop constraint if exists messages_listing_fk;
alter table public.messages
  add constraint messages_listing_fk foreign key (listing_id)
  references public.listings(id) on delete cascade not valid;

create index if not exists messages_thread_idx
  on public.messages (listing_id, buyer_id, created_at);

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------------
-- VERIFY (run as an authenticated test user via the app / supabase-js, not the SQL editor):
--   1. supabase.from('orders').insert({...})                -> must FAIL (permission denied)
--   2. supabase.from('orders').update({status:'completed'}) -> must FAIL
--   3. rpc('place_order', {p_listing_id: <someone else's listing>, ...}) twice
--        -> same order id both times, price = listing price
--   4. buyer rpc('set_order_status', {p_status:'completed'}) -> must FAIL
--   5. seller: pending->confirmed->completed works; listing becomes 'sold'
--   6. insert a message with someone else's buyer_id as sender -> must FAIL
