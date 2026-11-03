import { getClient, requireSession } from './auth.js';
import { state } from './state.js';
import { toast } from './utils.js';

function rowToItem(row, imageUrls = []) {
  return {
    id: row.id,               // Use the real UUID as the item id
    cloudDbId: row.id,
    shopId: row.shop_id || row.shops?.id || null,
    title: row.title,
    price: Number(row.price_zmw || 0),
    category: row.category || 'Other',
    location: row.location_name || 'Zambia',
    address: row.address || '',
    lat: row.latitude == null ? null : Number(row.latitude),
    lng: row.longitude == null ? null : Number(row.longitude),
    condition: row.condition || (row.status === 'sold' ? 'Sold' : 'Listed'),
    emoji: '📦',
    seller: row.shops?.name || 'MarketHub seller',
    phone: row.shops?.phone || '',
    desc: row.description || '',
    time: Date.parse(row.created_at || '') || 0,
    status: row.status || 'active',
    stock_quantity: row.stock_quantity,
    imageUrls,
    isCloudListing: true
  };
}

async function attachImages(client, listingRows) {
  const imageMap = new Map();
  if (!listingRows.length) return imageMap;
  const listingIds = listingRows.map(r => r.id);
  const { data: imageRows, error: imageRowsError } = await client
    .from('listing_images')
    .select('listing_id,storage_path,sort_order,display_order,is_primary')
    .in('listing_id', listingIds)
    .order('display_order', { ascending: true });
  if (imageRowsError) console.warn('Listing images metadata unavailable:', imageRowsError.message);
  for (const imageRow of imageRowsError ? [] : (imageRows || [])) {
    if (!imageMap.has(imageRow.listing_id)) imageMap.set(imageRow.listing_id, []);
    imageMap.get(imageRow.listing_id).push(imageRow);
  }
  await Promise.all([...imageMap.entries()].map(async ([listingId, rows]) => {
    rows.sort((a, b) =>
      Number(!!b.is_primary) - Number(!!a.is_primary) ||
      Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0)
    );
    const signed = await Promise.all(rows.map(async imageRow => {
      // Prefer public URL (make the bucket public in Supabase dashboard).
      const { data: pub } = client.storage.from('product-images').getPublicUrl(imageRow.storage_path);
      if (pub?.publicUrl) return pub.publicUrl;
      try {
        const { data: signedData } = await client.storage
          .from('product-images')
          .createSignedUrl(imageRow.storage_path, 60 * 60 * 24 * 7);
        return signedData?.signedUrl || null;
      } catch {
        return null;
      }
    }));
    imageMap.set(listingId, signed.filter(Boolean));
  }));
  return imageMap;
}

export async function loadCloudListings() {
  const client = getClient();
  const note = document.getElementById('cloudListingNotice');
  if (!client) {
    if (note) note.textContent = 'Cloud client not ready.';
    return;
  }
  try {
    const { data, error } = await client
      .from('listings')
      .select('id,shop_id,title,description,category,condition,price_zmw,stock_quantity,status,location_name,address,latitude,longitude,created_at,shops(id,name,phone)')
      .eq('status', 'active')
      .gt('stock_quantity', 0)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const listingRows = data || [];
    const imageMap = await attachImages(client, listingRows);
    state.cloudItems = listingRows.map(row => rowToItem(row, imageMap.get(row.id) || []));
    if (note) {
      note.textContent = state.cloudItems.length
        ? `Connected to Supabase · ${state.cloudItems.length} live listing${state.cloudItems.length === 1 ? '' : 's'} loaded`
        : 'Connected to Supabase · no active cloud listings yet';
    }
  } catch (err) {
    console.warn('Could not load MarketHub cloud listings:', err.message || err);
    if (note) note.textContent = 'Cloud listings could not load. Check Supabase table permissions.';
  }
}

/** All statuses for the signed-in seller's shop(s). */
export async function loadMyCloudListings() {
  const client = getClient();
  state.myCloudListings = [];
  if (!client || !state.session?.user) return;
  try {
    const { data: shops, error: shopErr } = await client
      .from('shops')
      .select('id')
      .eq('owner_id', state.session.user.id);
    if (shopErr) throw shopErr;
    const shopIds = (shops || []).map(s => s.id);
    if (!shopIds.length) return;

    const { data, error } = await client
      .from('listings')
      .select('id,shop_id,title,description,category,condition,price_zmw,stock_quantity,status,location_name,address,latitude,longitude,created_at,shops(id,name,phone)')
      .in('shop_id', shopIds)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const listingRows = data || [];
    const imageMap = await attachImages(client, listingRows);
    state.myCloudListings = listingRows.map(row => rowToItem(row, imageMap.get(row.id) || []));
  } catch (err) {
    console.warn('Could not load seller listings:', err.message || err);
  }
}

async function ensureShop(client, user, item) {
  const shopName = (item.seller || user.user_metadata?.full_name || user.email || 'MarketHub Seller').trim();
  const phone = (item.phone || '').trim() || null;
  let { data: shop, error: shopError } = await client
    .from('shops')
    .select('id,name,phone')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle();
  if (shopError) throw new Error('Could not check your seller shop: ' + shopError.message);
  if (!shop) {
    const { data: newShop, error: newShopError } = await client
      .from('shops')
      .insert({
        owner_id: user.id,
        name: shopName,
        phone,
        email: user.email || null,
        status: 'active'
      })
      .select('id,name,phone')
      .single();
    if (newShopError) throw new Error('Could not create your seller shop: ' + newShopError.message);
    shop = newShop;
  } else if (shop.name !== shopName || shop.phone !== phone) {
    // Update name/phone so they don't freeze at the first listing.
    const { error: upErr } = await client
      .from('shops')
      .update({ name: shopName, phone })
      .eq('id', shop.id);
    if (!upErr) {
      shop.name = shopName;
      shop.phone = phone;
    }
  }
  return shop;
}

/** Compress an image File to ~1280px WebP (quality 0.78). Falls back to original on error. */
async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1280;
    let w = bitmap.width, h = bitmap.height;
    if (w > max || h > max) {
      const scale = max / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.78));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch (e) {
    console.warn('Image compress failed, using original:', e);
    return file;
  }
}

async function uploadPhotos(client, shopId, listingId, title, photos) {
  const { data: existingPrimary } = await client
    .from('listing_images')
    .select('id')
    .eq('listing_id', listingId)
    .eq('is_primary', true)
    .limit(1);
  let hasPrimary = Array.isArray(existingPrimary) && existingPrimary.length > 0;

  for (let i = 0; i < photos.length; i++) {
    const original = photos[i];
    const file = await compressImage(original);
    const ext = file.type === 'image/webp' ? 'webp' : { 'image/jpeg': 'jpg', 'image/png': 'png' }[file.type] || 'jpg';
    const path = `${shopId}/${listingId}/${Date.now()}_${i}.${ext}`;
    const { error: uploadError } = await client.storage
      .from('product-images')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      throw new Error(`Listing saved, but photo ${i + 1} upload failed: ${uploadError.message}`);
    }
    const imageRow = {
      listing_id: listingId,
      storage_path: path,
      alt_text: `${title} photo ${i + 1}`,
      sort_order: i + 1,
      display_order: i + 1,
      is_primary: !hasPrimary && i === 0
    };
    let { error: imageError } = await client.from('listing_images').insert(imageRow);
    if (imageError && /one_primary|is_primary|duplicate key/i.test(imageError.message)) {
      imageRow.is_primary = false;
      const retry = await client.from('listing_images').insert(imageRow);
      imageError = retry.error;
    }
    if (imageError) {
      throw new Error(`Listing and photo uploaded, but photo record ${i + 1} could not be saved: ${imageError.message}`);
    }
    if (imageRow.is_primary) hasPrimary = true;
  }
}

export async function publishListing(item) {
  const session = await requireSession();
  const client = getClient();
  const user = session.user;
  const shop = await ensureShop(client, user, item);

  // Atomic: insert as draft, upload photos, then set active.
  const row = {
    shop_id: shop.id,
    title: item.title,
    description: item.desc || null,
    category: item.category,
    condition: item.condition || null,
    price_zmw: Number(item.price),
    stock_quantity: 1,
    status: 'draft',
    location_name: item.location || 'Zambia',
    address: item.address || null,
    latitude: item.lat == null ? null : Number(item.lat),
    longitude: item.lng == null ? null : Number(item.lng)
  };
  const { data: listing, error: listingError } = await client
    .from('listings')
    .insert(row)
    .select('id')
    .single();
  if (listingError) throw new Error('Shop is ready, but the product could not be saved: ' + listingError.message);

  try {
    const photos = Array.isArray(item.photos) ? item.photos : [];
    await uploadPhotos(client, shop.id, listing.id, item.title, photos);
    // Promote to active only after photos succeed.
    const { error: actErr } = await client
      .from('listings')
      .update({ status: 'active' })
      .eq('id', listing.id);
    if (actErr) throw actErr;
  } catch (err) {
    // Best-effort cleanup of the draft on failure.
    try { await client.from('listings').delete().eq('id', listing.id); } catch {}
    throw err;
  }
  return listing;
}

export async function updateCloudListing(cloudDbId, item) {
  await requireSession();
  const client = getClient();
  const patch = {
    title: item.title,
    description: item.desc || null,
    category: item.category,
    condition: item.condition || null,
    price_zmw: Number(item.price),
    location_name: item.location || 'Zambia',
    address: item.address || null,
    latitude: item.lat == null ? null : Number(item.lat),
    longitude: item.lng == null ? null : Number(item.lng)
  };
  const { error } = await client.from('listings').update(patch).eq('id', cloudDbId);
  if (error) throw new Error('Could not update listing: ' + error.message);

  const photos = Array.isArray(item.photos) ? item.photos : [];
  if (photos.length) {
    // Resolve shop_id for storage path
    const { data: listingRow } = await client.from('listings').select('shop_id').eq('id', cloudDbId).single();
    if (listingRow?.shop_id) {
      await uploadPhotos(client, listingRow.shop_id, cloudDbId, item.title, photos);
    }
  }
  return { id: cloudDbId };
}

export async function setCloudListingStatus(cloudDbId, status) {
  await requireSession();
  const client = getClient();
  const patch = { status };
  if (status === 'sold') patch.stock_quantity = 0;
  if (status === 'active') patch.stock_quantity = 1;
  const { error } = await client.from('listings').update(patch).eq('id', cloudDbId);
  if (error) throw new Error('Could not update status: ' + error.message);
}

export async function deleteCloudListing(cloudDbId) {
  await requireSession();
  const client = getClient();
  // Remove image rows + storage objects best-effort
  const { data: images } = await client
    .from('listing_images')
    .select('storage_path')
    .eq('listing_id', cloudDbId);
  if (images?.length) {
    const paths = images.map(i => i.storage_path).filter(Boolean);
    if (paths.length) {
      await client.storage.from('product-images').remove(paths).catch(() => {});
    }
    await client.from('listing_images').delete().eq('listing_id', cloudDbId);
  }
  const { error } = await client.from('listings').delete().eq('id', cloudDbId);
  if (error) throw new Error('Could not delete listing: ' + error.message);
}

// ——— Orders ———
// Every order write goes through a Postgres function (supabase/001_orders_chat_hardening.sql).
// The server takes price / shop / title from the listing and enforces who may change status,
// so nothing the browser sends can forge an order.

function friendlyRpcError(error) {
  const msg = String(error?.message || error || '');
  if (/AUTH_REQUIRED/.test(msg)) return 'Please sign in first.';
  if (/Could not find the function|schema cache/i.test(msg)) {
    return 'Orders are not set up on the server yet (run supabase/001_orders_chat_hardening.sql).';
  }
  return msg || 'Something went wrong.';
}

async function rpc(name, args) {
  try {
    await requireSession();
  } catch (e) {
    throw new Error(friendlyRpcError(e));
  }
  const { data, error } = await getClient().rpc(name, args);
  if (error) throw new Error(friendlyRpcError(error));
  return data;
}

/** Place (or re-fetch, if one is already open) an order for a live listing. */
export async function createCloudOrder(order) {
  if (!order.listingCloudId) throw new Error('This listing cannot be ordered online.');
  return rpc('place_order', {
    p_listing_id: order.listingCloudId,
    p_buyer_name: order.buyer,
    p_buyer_phone: order.phone,
    p_buyer_town: order.town || null,
    p_fulfilment: order.fulfilment || null,
    p_drop_address: order.address || null,
    p_drop_pin: order.pin || null,
    p_notes: order.notes || null
  });
}

/** Select orders; embeds the seller's contact, and falls back to plain rows if the embed fails. */
async function selectOrders(client, apply) {
  let res = await apply(client.from('orders').select('*, shops(name,phone)'));
  if (res.error) res = await apply(client.from('orders').select('*'));
  if (res.error) throw res.error;
  return res.data || [];
}

export async function loadBuyerOrders() {
  const client = getClient();
  state.cloudOrders = [];
  if (!client || !state.session?.user) return;
  try {
    state.cloudOrders = await selectOrders(client, q =>
      q.eq('buyer_id', state.session.user.id).order('created_at', { ascending: false }).limit(50)
    );
  } catch (err) {
    console.warn('Buyer orders unavailable:', err.message || err);
  }
}

export async function loadSellerOrders() {
  const client = getClient();
  state.sellerOrders = [];
  if (!client || !state.session?.user) return;
  try {
    const { data: shops, error: shopErr } = await client
      .from('shops')
      .select('id')
      .eq('owner_id', state.session.user.id);
    if (shopErr) throw shopErr;
    const shopIds = (shops || []).map(s => s.id);
    if (!shopIds.length) return;
    state.sellerOrders = await selectOrders(client, q =>
      q.in('shop_id', shopIds).order('created_at', { ascending: false }).limit(100)
    );
  } catch (err) {
    console.warn('Seller orders unavailable:', err.message || err);
  }
}

/** status: confirmed | cancelled | completed. The server decides whether the caller may do it. */
export async function updateOrderStatus(orderId, status) {
  return rpc('set_order_status', { p_order_id: orderId, p_status: status });
}
