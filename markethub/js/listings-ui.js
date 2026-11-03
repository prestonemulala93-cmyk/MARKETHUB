import { state, allItems, findItem, persistSaved } from './state.js';
import { escapeHtml, money, toast, mapEmbedUrl } from './utils.js';
import { addToCart, updateBasketDock } from './cart.js';
import { getClient } from './auth.js';
import * as cloud from './cloud.js';
import { openCheckout } from './orders.js';

let photoObjectUrls = [];
let selectedPhotos = [];

export function render() {
  const town = document.getElementById('townFilter')?.value || '';
  let items = allItems().filter(x =>
    x.status !== 'sold' &&
    (!state.activeCat || x.category === state.activeCat) &&
    (!state.savedOnly || state.saved.has(x.id)) &&
    (!town || x.location === town) &&
    (!state.searchText ||
      (x.title + ' ' + x.category + ' ' + x.location + ' ' + x.seller)
        .toLowerCase()
        .includes(state.searchText.toLowerCase()))
  );
  const sort = document.getElementById('sortSelect').value;
  if (sort === 'low') items.sort((a, b) => a.price - b.price);
  else if (sort === 'high') items.sort((a, b) => b.price - a.price);
  else items.sort((a, b) => b.time - a.time);

  document.getElementById('listingTitle').textContent = state.savedOnly
    ? 'Saved items'
    : (town ? town + ' listings' : (state.activeCat || 'Explore listings'));
  document.getElementById('listingSub').textContent =
    items.length + ' item' + (items.length === 1 ? '' : 's') + ' available' + (town ? ' in ' + town : '') + ' · Prices in Zambian kwacha';
  document.getElementById('savedCount').textContent = state.saved.size;

  const orderCount =
    (state.cloudOrders?.length || 0) + (state.localOrders?.length || 0);
  const ordersCount = document.getElementById('ordersCount');
  if (ordersCount) ordersCount.textContent = orderCount;
  updateBasketDock();

  const grid = document.getElementById('listingGrid');
  if (!items.length) {
    grid.innerHTML =
      '<div class="empty"><div style="font-size:40px">🔎</div><h3>No listings found</h3><p>Try another search, location or category.</p><button class="primary" id="resetFiltersBtn">Show all items</button></div>';
    return;
  }
  grid.innerHTML = items
    .map(
      x => `<article class="card">
      <div class="photo" role="button" tabindex="0" data-detail="${x.id}">
        ${
          x.imageUrls?.length
            ? `<img src="${escapeHtml(x.imageUrls[0])}" alt="${escapeHtml(x.title)}" loading="lazy" onerror="this.style.display='none'">`
            : x.emoji || '📦'
        }
        <span class="tag">${escapeHtml(x.condition || 'Listed')}</span>
        <button class="heart ${state.saved.has(x.id) ? 'on' : ''}" aria-label="Save item" data-save="${x.id}">${state.saved.has(x.id) ? '♥' : '♡'}</button>
      </div>
      <div class="info" role="button" tabindex="0" data-detail="${x.id}">
        <h3>${escapeHtml(x.title)}</h3>
        <div class="price">${money(x.price)}</div>
        <div class="meta"><span>📍 ${escapeHtml(x.location)}</span><span>${escapeHtml(x.category)}</span></div>
        <div class="seller"><span class="avatar">${escapeHtml((x.seller || '?').charAt(0).toUpperCase())}</span><span>${escapeHtml(x.seller)}</span><span style="margin-left:auto">View →</span></div>
      </div>
    </article>`
    )
    .join('');
}

export function resetFilters() {
  state.activeCat = '';
  state.savedOnly = false;
  state.searchText = '';
  document.getElementById('searchInput').value = '';
  const town = document.getElementById('townFilter');
  if (town) town.value = '';
  document.querySelectorAll('.cat').forEach(b => b.classList.toggle('active', !b.dataset.cat));
  render();
}

export function toggleSave(id) {
  const numId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id;
  if (state.saved.has(numId)) state.saved.delete(numId);
  else state.saved.add(numId);
  persistSaved();
  render();
  toast(state.saved.has(numId) ? 'Added to saved items' : 'Removed from saved items');
}

export function showDetail(id) {
  const x = findItem(id);
  if (!x) return;
  const gallery = x.imageUrls?.length
    ? `<img class="detail-main-image" src="${escapeHtml(x.imageUrls[0])}" alt="${escapeHtml(x.title)}" onerror="this.style.display='none'">
       <div class="detail-gallery">${x.imageUrls
         .slice(1)
         .map(
           (url, i) =>
             `<img src="${escapeHtml(url)}" alt="${escapeHtml(x.title)} photo ${i + 2}" loading="lazy" onerror="this.style.display='none'">`
         )
         .join('')}</div>`
    : `<div class="detail-emoji">${x.emoji || '📦'}</div>`;

  document.getElementById('detailContent').innerHTML = `
    ${gallery}
    <h2 style="margin-bottom:5px">${escapeHtml(x.title)}</h2>
    <div class="price" style="font-size:26px">${money(x.price)}</div>
    <p style="color:#617067">📍 ${escapeHtml(x.location)} · ${escapeHtml(x.category)} · ${escapeHtml(x.condition || 'Condition not specified')}</p>
    <p>${escapeHtml(x.desc || 'No description provided.')}</p>
    <div style="background:#f3f6f1;border-radius:12px;padding:14px;margin:15px 0">
      <b>Seller: ${escapeHtml(x.seller)}</b>
      <p style="margin:4px 0;color:#68756b">Contact the seller directly to ask questions or arrange a viewing.</p>
      <div style="font-size:18px;font-weight:800">${escapeHtml(x.phone)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <a class="ghost" href="tel:${escapeHtml(String(x.phone || '').replace(/[^\d+]/g, ''))}" style="text-decoration:none">Call</a>
        <a class="ghost" href="https://wa.me/${escapeHtml(String(x.phone || '').replace(/\D/g, '').replace(/^0/, '260'))}?text=${encodeURIComponent(`Hello ${x.seller}, I'm interested in your listing: ${x.title}. Is it still available?`)}" target="_blank" rel="noopener" style="text-decoration:none">WhatsApp</a>
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="primary" data-contact="${x.id}">Chat</button>
      <button class="primary" style="background:#2454a6" data-buy="${x.id}">Buy now</button>
      <button class="ghost" data-add-cart="${x.id}">＋ Add to basket</button>
      <button class="ghost" data-save-detail="${x.id}">${state.saved.has(x.id) ? '♥ Saved' : '♡ Save item'}</button>
    </div>
    <div style="margin-top:12px;border:1px solid #e0e8de;border-radius:12px;padding:12px">
      <b>📍 Seller location</b>
      <p style="margin:4px 0 10px;color:#647267">${escapeHtml(x.address || x.location + ', Zambia')}</p>
      <iframe title="Seller location map" width="100%" height="200" style="border:0;border-radius:9px" loading="lazy"
        src="${mapEmbedUrl(x.lat != null ? x.lat + ',' + x.lng : x.address || x.location + ', Zambia')}"></iframe>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
        <button class="ghost" data-directions="${x.id}">Get directions ↗</button>
        <button class="ghost" data-mapsearch="${x.id}">Open full map ↗</button>
      </div>
    </div>
    <p style="font-size:12px;color:#7a857d;margin-bottom:0">Safety tip: meet in a public place, inspect the item, and never pay a stranger's advance fee or share your PIN/OTP.</p>`;
  document.getElementById('detailModal').classList.add('show');
}

function contactSeller(id) {
  import('./chat.js').then(m => m.openChatForItem(id));
}

function openDirections(id) {
  const x = findItem(id);
  if (!x) return;
  import('./nav.js').then(m => m.openInAppNav([x]));
}

function openMapSearch(id) {
  const x = findItem(id);
  if (!x) return;
  window.open(
    'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(x.lat != null ? x.lat + ',' + x.lng : x.address || x.location + ', Zambia'),
    '_blank',
    'noopener'
  );
}

export async function openSell() {
  try {
    const client = getClient();
    if (!client) {
      toast('Account service is still loading. Please refresh and try again.');
      return;
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data?.session?.user) {
      window.marketHubAuth?.open();
      toast('Please sign in before publishing a listing.');
      return;
    }
    state.editingListingId = null;
    state.editingCloudDbId = null;
    document.getElementById('listingForm').reset();
    clearPhotoPreview();
    state.sellerPin = null;
    const profile = JSON.parse(localStorage.getItem('mh_seller_profile') || 'null') || {};
    if (profile.name) document.getElementById('sellerName').value = profile.name;
    if (profile.phone) document.getElementById('sellerPhone').value = profile.phone;
    if (profile.location) document.getElementById('itemLocation').value = profile.location;
    if (profile.address) document.getElementById('itemAddress').value = profile.address;
    document.getElementById('sellerPinStatus').textContent = 'Using your shop profile where available. You can still change any field.';
    document.querySelector('#listingModal .modalhead h2').textContent = 'List an item for sale';
    document.querySelector('#listingForm button[type="submit"]').textContent = 'Publish listing';
    document.getElementById('listingModal').classList.add('show');
  } catch (err) {
    console.error('MarketHub sign-in check failed:', err);
    toast('Could not verify sign-in. Please sign in again.');
  }
}

export function fillEditForm(item) {
  state.editingListingId = item.id;
  state.editingCloudDbId = item.cloudDbId || null;
  document.getElementById('itemTitle').value = item.title || '';
  document.getElementById('itemPrice').value = item.price || '';
  document.getElementById('itemCategory').value = item.category || '';
  document.getElementById('itemLocation').value = item.location || '';
  document.getElementById('itemAddress').value = item.address || '';
  document.getElementById('itemCondition').value = item.condition || 'Used - good';
  document.getElementById('itemEmoji').value = item.emoji || '📦';
  document.getElementById('itemDescription').value = item.desc || '';
  document.getElementById('sellerName').value = item.seller || '';
  document.getElementById('sellerPhone').value = item.phone || '';
  state.sellerPin = item.lat != null ? { lat: item.lat, lng: item.lng } : null;
  document.getElementById('sellerPinStatus').textContent = state.sellerPin
    ? `Pickup pin saved: ${state.sellerPin.lat.toFixed(5)}, ${state.sellerPin.lng.toFixed(5)}`
    : 'No map pin selected yet.';
  clearPhotoPreview();
  document.querySelector('#listingModal .modalhead h2').textContent = 'Edit listing';
  document.querySelector('#listingForm button[type="submit"]').textContent = 'Save changes';
  document.getElementById('listingModal').classList.add('show');
}

function clearPhotoPreview() {
  photoObjectUrls.forEach(u => {
    try { URL.revokeObjectURL(u); } catch {}
  });
  photoObjectUrls = [];
  selectedPhotos = [];
  const box = document.getElementById('itemPhotoPreview');
  if (box) box.innerHTML = '';
  const input = document.getElementById('itemPhotos');
  if (input) input.value = '';
}

function renderPhotoPreview() {
  const box = document.getElementById('itemPhotoPreview');
  if (!box) return;
  photoObjectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
  photoObjectUrls = [];
  box.innerHTML = selectedPhotos.map((file, i) => {
    const url = URL.createObjectURL(file);
    photoObjectUrls.push(url);
    return `<div style="position:relative;width:76px;height:76px">
      <img src="${url}" alt="${escapeHtml(file.name)}" style="width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid #dce4da">
      <button type="button" data-remove-photo="${i}" aria-label="Remove photo" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:#c62828;color:#fff;font-weight:800;line-height:1">×</button>
    </div>`;
  }).join('');
}

export function bindListingsUI() {
  document.getElementById('sellBtn')?.addEventListener('click', openSell);
  document.getElementById('heroSell').onclick = openSell;

  document.getElementById('categories').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.activeCat = b.dataset.cat;
    state.savedOnly = false;
    document.querySelectorAll('.cat').forEach(c => c.classList.toggle('active', c === b));
    render();
  });

  document.getElementById('searchBtn').onclick = () => {
    state.searchText = document.getElementById('searchInput').value.trim();
    state.savedOnly = false;
    render();
  };
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      state.searchText = e.target.value.trim();
      state.savedOnly = false;
      render();
    }
  });
  document.getElementById('sortSelect').onchange = render;
  document.getElementById('townFilter').onchange = render;
  document.getElementById('savedBtn').onclick = () => {
    state.savedOnly = !state.savedOnly;
    state.activeCat = '';
    document.querySelectorAll('.cat').forEach(c => c.classList.toggle('active', c.dataset.cat === ''));
    render();
  };

  document.getElementById('listingGrid').addEventListener('click', e => {
    if (e.target.closest('#resetFiltersBtn')) {
      resetFilters();
      return;
    }
    const saveBtn = e.target.closest('[data-save]');
    if (saveBtn) {
      e.stopPropagation();
      toggleSave(Number(saveBtn.dataset.save) || saveBtn.dataset.save);
      return;
    }
    const detail = e.target.closest('[data-detail]');
    if (detail) showDetail(Number(detail.dataset.detail) || detail.dataset.detail);
  });

  document.getElementById('detailContent').addEventListener('click', e => {
    const contact = e.target.closest('[data-contact]');
    if (contact) return contactSeller(Number(contact.dataset.contact) || contact.dataset.contact);
    const buy = e.target.closest('[data-buy]');
    if (buy) return openCheckout(Number(buy.dataset.buy) || buy.dataset.buy);
    const cart = e.target.closest('[data-add-cart]');
    if (cart) return addToCart(Number(cart.dataset.addCart) || cart.dataset.addCart);
    const save = e.target.closest('[data-save-detail]');
    if (save) {
      const id = Number(save.dataset.saveDetail) || save.dataset.saveDetail;
      toggleSave(id);
      showDetail(id);
      return;
    }
    const dir = e.target.closest('[data-directions]');
    if (dir) return openDirections(Number(dir.dataset.directions) || dir.dataset.directions);
    const ms = e.target.closest('[data-mapsearch]');
    if (ms) return openMapSearch(Number(ms.dataset.mapsearch) || ms.dataset.mapsearch);
  });

  document.getElementById('itemPhotos').addEventListener('change', function () {
    const incoming = Array.from(this.files || []);
    selectedPhotos = selectedPhotos.concat(incoming).slice(0, 4);
    this.value = '';
    renderPhotoPreview();
    if (selectedPhotos.length >= 4) toast('Only the first 4 photos can be used.');
  });
  document.getElementById('itemPhotoPreview').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-photo]');
    if (!btn) return;
    selectedPhotos.splice(Number(btn.dataset.removePhoto), 1);
    renderPhotoPreview();
  });

  document.getElementById('listingForm').onsubmit = async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    try {
      const client = getClient();
      if (!client) {
        toast('Account service is unavailable. Refresh and try again.');
        return;
      }
      const { data: authData, error: authError } = await client.auth.getSession();
      if (authError) throw authError;
      if (!authData?.session?.user) {
        document.getElementById('listingModal').classList.remove('show');
        window.marketHubAuth?.open();
        toast('Please sign in before publishing a listing.');
        return;
      }
    } catch (authCheckError) {
      console.error('MarketHub publish auth check failed:', authCheckError);
      toast('Could not verify your sign-in. Please sign in again.');
      return;
    }

    const photos = selectedPhotos.slice(0, 4);
    if (photos.length > 4) {
      toast('Please choose no more than 4 photos.');
      return;
    }
    if (photos.some(f => !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024)) {
      toast('Each photo must be JPG, PNG or WebP and no larger than 5 MB.');
      return;
    }

    const data = {
      photos,
      title: document.getElementById('itemTitle').value.trim(),
      price: Number(document.getElementById('itemPrice').value),
      category: document.getElementById('itemCategory').value,
      location: document.getElementById('itemLocation').value,
      address: document.getElementById('itemAddress').value.trim(),
      lat: state.sellerPin?.lat ?? null,
      lng: state.sellerPin?.lng ?? null,
      condition: document.getElementById('itemCondition').value,
      emoji: document.getElementById('itemEmoji').value,
      desc: document.getElementById('itemDescription').value.trim(),
      seller: document.getElementById('sellerName').value.trim(),
      phone: document.getElementById('sellerPhone').value.trim(),
      time: Date.now()
    };

    submit.disabled = true;
    const original = submit.textContent;
    submit.textContent = state.editingCloudDbId ? 'Saving…' : 'Publishing…';

    try {
      if (state.editingCloudDbId) {
        await cloud.updateCloudListing(state.editingCloudDbId, data);
        toast('Listing updated in MarketHub cloud');
      } else {
        const result = await cloud.publishListing(data);
        toast('Listing published to MarketHub cloud');
      }
      form.reset();
      clearPhotoPreview();
      state.sellerPin = null;
      state.editingListingId = null;
      state.editingCloudDbId = null;
      document.getElementById('sellerPinStatus').textContent = 'No map pin selected yet.';
      document.getElementById('listingModal').classList.remove('show');
      document.querySelector('#listingModal .modalhead h2').textContent = 'List an item for sale';
      submit.textContent = 'Publish listing';
      state.activeCat = '';
      state.savedOnly = false;
      state.searchText = '';
      document.getElementById('searchInput').value = '';
      const town = document.getElementById('townFilter');
      if (town) town.value = '';
      document.querySelectorAll('.cat').forEach(c => c.classList.toggle('active', c.dataset.cat === ''));
      await cloud.loadCloudListings();
      await cloud.loadMyCloudListings();
      render();
      window.scrollTo({ top: 500, behavior: 'smooth' });
    } catch (err) {
      console.error('MarketHub publish failed:', err);
      toast('Could not save: ' + (err.message || 'check sign-in and Supabase settings'));
    } finally {
      submit.disabled = false;
      submit.textContent = original;
    }
  };

  window.showDetail = showDetail;
  window.toggleSave = toggleSave;
  window.resetFilters = resetFilters;
  window.openSell = openSell;
}
