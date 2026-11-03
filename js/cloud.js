import { getClient, requireSession } from './auth.js';
import { state } from './state.js';
import { hashId, toast } from './utils.js';

function rowToItem(row, imageUrls = []) {
  return {
    id: hashId(row.id),
    cloudDbId: row.id,
    shopId: row.shop_id || row.shops?.id || null,
    title: row.title,
    price: Number(row.price_zmw || 0),
    category: row.category || 'Other',
    location: row.location_name || 'Zambia',
    address: row.address || '',
    lat: row.latitude == null ? null : Number(row.latitude),
    lng: row.longitude == null ? null : Number(row.longitude),
    condition: row.status === 'sold' ? 'Sold' : 'Listed',
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
      const { data: pub } = client.storage.from('product-images').getPublicUrl(imageRow.storage_path);
      const publicUrl = pub?.publicUrl || null;
      try {
        const { data: signedData } = await client.storage
          .from('product-images')
          .createSignedUrl(imageRow.storage_path, 60 * 60 * 24 * 7);
        return signedData?.signedUrl || publicUrl;
      } catch {
        return publicUrl;
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
      .select('id,shop_id,title,description,category,price_zmw,stock_quantity,status,location_name,address,latitude,longitude,created_at,shops(id,name,phone)')
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
      .select('id,shop_id,title,description,category,price_zmw,stock_quantity,status,location_name,address,latitude,longitude,created_at,shops(id,name,phone)')
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
        phone: (item.phone || '').trim() || null,
        email: user.email || null,
        status: 'active'
      })
      .select('id,name,phone')
      .single();
    if (newShopError) throw new Error('Could not create your seller shop: ' + newShopError.message);
    shop = newShop;
  }
  return shop;
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
    const file = photos[i];
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    if (!ext) continue;
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
  const row = {
    shop_id: shop.id,
    title: item.title,
    description: item.desc || null,
    category: item.category,
    price_zmw: Number(item.price),
    stock_quantity: 1,
    status: 'active',
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
  const photos = Array.isArray(item.photos) ? item.photos : [];
  await uploadPhotos(client, shop.id, listing.id, item.title, photos);
  return listing;
}

export async function updateCloudListing(cloudDbId, item) {
  await requireSession();
  const client = getClient();
  const patch = {
    title: item.title,
    description: item.desc || null,
    category: item.category,
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

export async function createCloudOrder(order) {
  const client = getClient();
  if (!client) throw new Error('Cloud unavailable');
  let buyerId = null;
  try {
    const { data } = await client.auth.getSession();
    buyerId = data?.session?.user?.id || null;
  } catch { /* guest */ }

  const row = {
    listing_id: order.listingCloudId || null,
    shop_id: order.shopId || null,
    buyer_id: buyerId,
    buyer_name: order.buyer,
    buyer_phone: order.phone,
    buyer_town: order.town || null,
    fulfilment: order.fulfilment || null,
    drop_address: order.address || null,
    drop_pin: order.pin || null,
    payment_method: order.payment || null,
    notes: order.notes || null,
    item_title: order.item,
    price_zmw: Number(order.price) || 0,
    status: 'pending'
  };

  const { data, error } = await client.from('orders').insert(row).select('id,created_at,status').single();
  if (error) throw error;
  return data;
}

export async function loadBuyerOrders() {
  const client = getClient();
  state.cloudOrders = [];
  if (!client || !state.session?.user) return;
  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('buyer_id', state.session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    state.cloudOrders = data || [];
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
    const { data, error } = await client
      .from('orders')
      .select('*')
      .in('shop_id', shopIds)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    state.sellerOrders = data || [];
  } catch (err) {
    console.warn('Seller orders unavailable:', err.message || err);
  }
}

export async function updateOrderStatus(orderId, status) {
  await requireSession();
  const client = getClient();
  const { error } = await client.from('orders').update({ status }).eq('id', orderId);
  if (error) throw new Error('Could not update order: ' + error.message);
}
