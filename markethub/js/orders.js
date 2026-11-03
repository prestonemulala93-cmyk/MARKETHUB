import { state, findItem, persistCart } from './state.js';
import { escapeHtml, money, toast, hashId } from './utils.js';
import * as cloud from './cloud.js';
import { updateBasketDock } from './cart.js';

const $ = id => document.getElementById(id);

let rerender = () => {};
let checkoutItems = [];
let submitting = false;

// ——— Buyer profile ———

function profileKey() {
  return 'mh_profile_' + (state.session?.user?.id || 'guest');
}

export function getBuyerProfile() {
  try {
    return JSON.parse(localStorage.getItem(profileKey()) || 'null');
  } catch {
    return null;
  }
}

export function openProfile() {
  if (!state.session?.user) {
    window.marketHubAuth?.open();
    toast('Sign in before saving a profile.');
    return;
  }
  const p = getBuyerProfile() || {};
  $('profileName').value = p.name || state.session.user.user_metadata?.full_name || '';
  $('profilePhone').value = p.phone || '';
  $('profileTown').value = p.town || '';
  $('profileArea').value = p.area || '';
  $('profileModal').classList.add('show');
}

function saveProfile(e) {
  e.preventDefault();
  const profile = {
    name: $('profileName').value.trim(),
    phone: $('profilePhone').value.trim(),
    town: $('profileTown').value,
    area: $('profileArea').value.trim()
  };
  localStorage.setItem(profileKey(), JSON.stringify(profile));
  $('profileModal').classList.remove('show');
  toast('Profile saved. Orders will use these details.');
}

// ——— Checkout ———
// Opening checkout shows a form only. Nothing is sent until the buyer taps "Send order request".

function fulfilmentMode() {
  return document.querySelector('input[name="fulfilment"]:checked')?.value === 'delivery' ? 'delivery' : 'collect';
}

export function toggleDropAddress() {
  const delivery = fulfilmentMode() === 'delivery';
  const wrap = $('dropAddressWrap');
  const addr = $('dropAddress');
  if (wrap) wrap.style.display = delivery ? 'block' : 'none';
  if (addr) addr.required = delivery;
}

function checkoutItemHtml(x) {
  return `<div style="display:flex;gap:12px;align-items:center;background:#f2f6f0;border-radius:12px;padding:12px;margin-bottom:8px">
      <div style="font-size:36px">${escapeHtml(x.emoji || '📦')}</div>
      <div><b>${escapeHtml(x.title)}</b>
        <div style="color:#176b45;font-weight:900;font-size:18px">${money(x.price)}</div>
        <small>Seller: ${escapeHtml(x.seller)} · ${escapeHtml(x.location || '')}</small>
      </div>
    </div>`;
}

export async function openCheckout(id, basketItems) {
  if (!state.session?.user) {
    window.marketHubAuth?.open();
    toast('Sign in to place an order.');
    return;
  }
  const profile = getBuyerProfile();
  if (!profile?.name || !profile?.phone || !profile?.town) {
    openProfile();
    toast('Add your profile details first. They are sent with the order.');
    return;
  }

  const wanted = Array.isArray(basketItems) && basketItems.length ? basketItems : [findItem(id)].filter(Boolean);
  if (!wanted.length) return;

  const mine = new Set((state.myCloudListings || []).map(l => l.cloudDbId).filter(Boolean));
  const live = wanted.filter(x => x.cloudDbId);
  const orderable = live.filter(x => !mine.has(x.cloudDbId));

  if (!orderable.length) {
    toast(
      live.length
        ? 'You cannot order your own listing.'
        : 'This is a sample listing and cannot be ordered. Browse live listings to buy.'
    );
    return;
  }
  if (orderable.length < wanted.length) {
    toast(`${wanted.length - orderable.length} item(s) skipped (sample or your own listing).`);
  }

  checkoutItems = orderable;
  submitting = false;
  $('checkoutTitle').textContent = orderable.length > 1 ? `Order ${orderable.length} items` : 'Place order request';
  $('checkoutItem').innerHTML =
    orderable.map(checkoutItemHtml).join('') +
    (orderable.length > 1
      ? `<p style="margin:4px 0 12px"><b>Items total: ${money(orderable.reduce((s, x) => s + Number(x.price || 0), 0))}</b></p>`
      : '');
  $('checkoutForm').reset();
  toggleDropAddress();
  $('checkoutForm').style.display = 'block';
  $('checkoutDone').style.display = 'none';
  const btn = $('checkoutSubmit');
  btn.disabled = false;
  btn.textContent = 'Send order request';
  $('detailModal')?.classList.remove('show');
  $('cartModal')?.classList.remove('show');
  $('checkoutModal').classList.add('show');
}

async function submitCheckout(e) {
  e.preventDefault();
  if (submitting || !checkoutItems.length) return; // blocks double taps
  const profile = getBuyerProfile();
  if (!profile?.name || !profile?.phone) {
    openProfile();
    return;
  }
  const delivery = fulfilmentMode() === 'delivery';
  const address = $('dropAddress').value.trim();
  if (delivery && !address) {
    toast('Enter a delivery address.');
    return;
  }
  const notes = $('orderNotes').value.trim();

  submitting = true;
  const btn = $('checkoutSubmit');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const placed = [];
  const failed = [];
  for (const x of checkoutItems) {
    try {
      await cloud.createCloudOrder({
        listingCloudId: x.cloudDbId,
        buyer: profile.name,
        phone: profile.phone,
        town: profile.town,
        fulfilment: delivery ? 'Deliver it to me' : "I'll collect it / meet seller",
        address: delivery ? address : '',
        notes
      });
      placed.push(x);
    } catch (err) {
      failed.push({ x, msg: err.message || 'Could not place order.' });
    }
  }

  if (!placed.length) {
    // Nothing went through: stay on the form so the buyer can retry. No fake "Order placed".
    submitting = false;
    btn.disabled = false;
    btn.textContent = 'Send order request';
    toast(failed[0]?.msg || 'Could not place order.');
    return;
  }

  const placedIds = new Set(placed.map(p => p.id));
  state.cart = state.cart.filter(cid => !placedIds.has(cid));
  persistCart();
  updateBasketDock();
  await cloud.loadBuyerOrders();
  rerender();

  const failHtml = failed.length
    ? `<p style="color:#c62828;font-size:13px;margin:8px 0 0"><b>${failed.length} item(s) could not be ordered:</b><br>${failed
        .map(f => `${escapeHtml(f.x.title)}: ${escapeHtml(f.msg)}`)
        .join('<br>')}</p>`
    : '';
  $('checkoutDoneText').innerHTML =
    `<b>${placed.length === 1 ? 'Order request sent' : placed.length + ' order requests sent'}</b>` +
    `<p style="margin:6px 0 0;color:#6d5b2a">The seller will confirm the item is still available. Once confirmed, you will see their number under My Orders so you can pay them directly.</p>` +
    failHtml;
  $('checkoutForm').style.display = 'none';
  $('checkoutDone').style.display = 'block';
  checkoutItems = [];
  submitting = false;
  toast('Order request sent to the seller.');
}

// ——— My Orders ———

function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '').replace(/^0/, '260');
}

function sellerContactHtml(o) {
  const phone = o.shops?.phone;
  const name = o.shops?.name || 'the seller';
  const dir = o.listing_id
    ? `<button class="ghost" data-collect="${hashId(o.listing_id)}">Directions</button>`
    : '';
  if (!phone) return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${dir}</div>`;
  return `<div style="background:#e8f5e9;border-radius:10px;padding:10px;margin:8px 0;font-size:14px">
      <b>Seller confirmed.</b> Pay <b>${escapeHtml(name)}</b> ${money(o.price_zmw)} directly (Mobile Money or cash).
      <div style="font-weight:800;font-size:17px;margin-top:4px">${escapeHtml(phone)}</div>
      <small style="color:#4a5a50">Never share your PIN or OTP. The seller marks the order complete once paid.</small>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <a class="ghost" href="tel:${escapeHtml(String(phone).replace(/[^\d+]/g, ''))}" style="text-decoration:none">Call</a>
        <a class="ghost" href="https://wa.me/${escapeHtml(phoneDigits(phone))}?text=${encodeURIComponent('Hello, I am paying for my order: ' + (o.item_title || ''))}" target="_blank" rel="noopener" style="text-decoration:none">WhatsApp</a>
        ${dir}
      </div></div>`;
}

const STATUS_TEXT = {
  pending: 'Waiting for the seller to confirm',
  confirmed: 'Confirmed by seller',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

function cloudOrderHtml(o) {
  const status = o.status || 'pending';
  const open = status === 'pending' || status === 'confirmed';
  return `<div style="border:1px solid #e1e8df;border-radius:12px;padding:14px;margin:10px 0">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <b>${escapeHtml(o.item_title)}</b>
      <b style="color:#176b45">${money(o.price_zmw)}</b>
    </div>
    <p style="margin:6px 0;color:#637067;font-size:13px">
      ${escapeHtml(STATUS_TEXT[status] || status)} · ${o.created_at ? escapeHtml(new Date(o.created_at).toLocaleString()) : ''}
    </p>
    ${status === 'confirmed' ? sellerContactHtml(o) : ''}
    <div style="font-size:13px">
      Getting it: ${escapeHtml(o.fulfilment || 'Not specified')}<br>
      Town: ${escapeHtml(o.buyer_town || 'Not specified')}
    </div>
    ${o.drop_address ? `<p style="font-size:13px">Drop-off: ${escapeHtml(o.drop_address)}</p>` : ''}
    ${open ? `<button class="ghost" data-cancel-order="${escapeHtml(o.id)}" style="background:#ffcdd2;color:#c62828;border-color:#ef9a9a;margin-top:8px">Cancel order</button>` : ''}
  </div>`;
}

export async function openOrders() {
  await cloud.loadBuyerOrders();
  const box = $('ordersList');
  const cloudRows = state.cloudOrders || [];
  const localRows = state.localOrders || [];

  if (!cloudRows.length && !localRows.length) {
    box.innerHTML =
      '<div class="empty"><div style="font-size:38px">📦</div><h3>No orders yet</h3><p>When you use Buy now and send an order request, it will appear here.</p></div>';
  } else {
    let html = '';
    if (cloudRows.length) {
      html += '<h3 style="margin:0 0 8px">Your orders</h3>' + cloudRows.map(cloudOrderHtml).join('');
    }
    if (localRows.length) {
      // Legacy demo orders saved by older versions. No new ones are created.
      html += '<h3 style="margin:16px 0 8px">Old demo orders (this device only)</h3>';
      html += localRows
        .map(
          (o, i) => `<div style="border:1px solid #e1e8df;border-radius:12px;padding:14px;margin:10px 0">
          <div style="display:flex;justify-content:space-between;gap:10px"><b>${escapeHtml(o.item)}</b><b style="color:#176b45">${money(o.price)}</b></div>
          <p style="margin:6px 0;color:#637067;font-size:13px">Demo #${localRows.length - i} · ${escapeHtml(new Date(o.time).toLocaleString())}</p>
          <p style="font-size:12px;color:#7b867e;margin-bottom:0">Saved on this device only. The seller never received it.</p>
        </div>`
        )
        .join('');
    }
    box.innerHTML = html;
  }
  $('ordersModal').classList.add('show');
}

export function bindOrdersUI(render) {
  rerender = render || (() => {});
  $('ordersBtn').onclick = openOrders;
  $('profileBtn')?.addEventListener('click', openProfile);
  $('profileForm')?.addEventListener('submit', saveProfile);
  $('checkoutForm')?.addEventListener('submit', submitCheckout);
  document.querySelectorAll('input[name="fulfilment"]').forEach(r => r.addEventListener('change', toggleDropAddress));
  $('checkoutViewOrders')?.addEventListener('click', () => {
    $('checkoutModal').classList.remove('show');
    openOrders();
  });

  $('ordersList')?.addEventListener('click', async e => {
    const cancel = e.target.closest('[data-cancel-order]');
    if (cancel) {
      if (!confirm('Cancel this order?')) return;
      try {
        await cloud.updateOrderStatus(cancel.dataset.cancelOrder, 'cancelled');
        toast('Order cancelled.');
      } catch (err) {
        toast('Could not cancel: ' + (err.message || err));
      }
      await openOrders();
      return;
    }
    const collect = e.target.closest('[data-collect]');
    if (collect) {
      const item = findItem(Number(collect.dataset.collect) || collect.dataset.collect);
      if (!item || item.lat == null) {
        toast('The seller has not set a map pin for this listing.');
        return;
      }
      const { openInAppNav } = await import('./nav.js');
      openInAppNav([item]);
    }
  });

  $('collectBtn')?.addEventListener('click', async () => {
    const item = findItem(state.payingListingId);
    if (!item) {
      toast('Seller location is not available on this listing.');
      return;
    }
    const { openInAppNav } = await import('./nav.js');
    openInAppNav([item]);
  });
  $('riderBtn')?.addEventListener('click', () => $('riderModal')?.classList.add('show'));
  $('openYangoBtn')?.addEventListener('click', () => {
    const item = findItem(state.payingListingId);
    if (item?.lat == null || item?.lng == null) {
      toast('This listing has no pickup pin yet.');
      return;
    }
    window.location.href = `intent://route?start_lat=${item.lat}&start_lon=${item.lng}#Intent;scheme=yango;package=com.yandex.yango;end`;
  });

  window.buyNow = openCheckout;
  window.openProfile = openProfile;
  window.openOrders = openOrders;
}
