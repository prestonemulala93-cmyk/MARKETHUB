import { state, findItem, persistLocalOrders } from './state.js';
import { escapeHtml, money, toast } from './utils.js';
import * as cloud from './cloud.js';
import { getClient } from './auth.js';

export function setFulfilment(mode) {
  try {
    const val = mode === 'rider' ? 'Deliver it to me' : "I'll collect it / meet seller";
    const hidden = document.getElementById('fulfilmentValue');
    if (hidden) hidden.value = val;
    const collect = document.getElementById('fulfilCollect');
    const rider = document.getElementById('fulfilRider');
    if (collect) {
      collect.style.background = mode === 'collect' ? '#e3f5df' : '';
      collect.style.color = mode === 'collect' ? '#176b45' : '';
    }
    if (rider) {
      rider.style.background = mode === 'rider' ? '#e3f5df' : '';
      rider.style.color = mode === 'rider' ? '#176b45' : '';
    }
    toggleDropAddress();
  } catch (e) {
    console.warn('setFulfilment failed', e);
  }
}
window.setFulfilment = setFulfilment;

export function toggleDropAddress() {
  try {
    const delivery = document.getElementById('fulfilmentValue')?.value === 'Deliver it to me';
    const wrap = document.getElementById('dropAddressWrap');
    const addr = document.getElementById('dropAddress');
    if (wrap) wrap.style.display = delivery ? 'block' : 'none';
    if (addr) addr.required = delivery;
  } catch (e) {
    console.warn('toggleDropAddress failed', e);
  }
}

function profileKey() {
  return 'mh_profile_' + (state.session?.user?.id || 'guest');
}

export function getBuyerProfile() {
  try { return JSON.parse(localStorage.getItem(profileKey()) || 'null'); } catch { return null; }
}

export function openProfile() {
  if (!state.session?.user) {
    window.marketHubAuth?.open();
    toast('Sign in before saving a profile.');
    return;
  }
  const p = getBuyerProfile() || {};
  document.getElementById('profileName').value = p.name || state.session.user.user_metadata?.full_name || '';
  document.getElementById('profilePhone').value = p.phone || '';
  document.getElementById('profileTown').value = p.town || '';
  document.getElementById('profileArea').value = p.area || '';
  document.getElementById('profileModal').classList.add('show');
}

function saveProfile(e) {
  e.preventDefault();
  const profile = {
    name: document.getElementById('profileName').value.trim(),
    phone: document.getElementById('profilePhone').value.trim(),
    town: document.getElementById('profileTown').value,
    area: document.getElementById('profileArea').value.trim()
  };
  localStorage.setItem(profileKey(), JSON.stringify(profile));
  document.getElementById('profileModal').classList.remove('show');
  toast('Profile saved. Orders will use these details.');
}

export async function openCheckout(id) {
  const x = findItem(id);
  if (!x) return;
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
  if (state.session?.user && x.seller) {
    const isMine = (state.myCloudListings || []).some(l => l.cloudDbId && l.cloudDbId === x.cloudDbId);
    if (isMine) {
      toast('You cannot order your own listing.');
      return;
    }
  }

  const order = {
    item: x.title,
    price: x.price,
    buyer: profile.name,
    phone: profile.phone,
    town: profile.town,
    fulfilment: null,
    address: profile.area || '',
    pin: '',
    payment: 'Mobile Money',
    notes: '',
    time: new Date().toISOString(),
    listingCloudId: x.cloudDbId || null,
    shopId: x.shopId || null
  };

  try {
    if (getClient() && x.cloudDbId) {
      await cloud.createCloudOrder(order);
      await cloud.loadBuyerOrders();
    } else {
      state.localOrders.unshift(order);
      persistLocalOrders();
    }
  } catch (err) {
    state.localOrders.unshift(order);
    persistLocalOrders();
    toast('Saved on this device. Cloud order failed: ' + (err.message || 'check orders table'));
  }

  document.getElementById('checkoutItem').innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;background:#f2f6f0;border-radius:12px;padding:12px">
      <div style="font-size:42px">${x.emoji || '📦'}</div>
      <div><b>${escapeHtml(x.title)}</b>
        <div style="color:#176b45;font-weight:900;font-size:20px">${money(x.price)}</div>
        <small>Seller: ${escapeHtml(x.seller)} · ${escapeHtml(x.location || '')}</small>
      </div>
    </div>`;
  document.getElementById('detailModal').classList.remove('show');
  document.getElementById('cartModal')?.classList.remove('show');
  document.getElementById('checkoutModal').classList.add('show');
  toast('Seller notified: Do you still have ' + x.title + '?');
}

export async function openOrders() {
  await cloud.loadBuyerOrders();
  const box = document.getElementById('ordersList');
  const cloudRows = state.cloudOrders || [];
  const localRows = state.localOrders || [];

  if (!cloudRows.length && !localRows.length) {
    box.innerHTML =
      '<div class="empty"><div style="font-size:38px">📦</div><h3>No orders yet</h3><p>When you use Buy now and submit an order request, it will appear here.</p></div>';
  } else {
    let html = '';
    if (cloudRows.length) {
      html += '<h3 style="margin:0 0 8px">Your cloud orders</h3>';
      html += cloudRows
        .map(
          o => `<div style="border:1px solid #e1e8df;border-radius:12px;padding:14px;margin:10px 0">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <b>${escapeHtml(o.item_title)}</b>
            <b style="color:#176b45">${money(o.price_zmw)}</b>
          </div>
          <p style="margin:6px 0;color:#637067;font-size:13px">
            ${o.status === 'confirmed' ? 'Confirmed, you can pay now' : escapeHtml(o.status || 'pending')} · ${o.created_at ? new Date(o.created_at).toLocaleString() : ''}
          </p>
          ${o.status === 'confirmed' ? `<div style="display:flex;gap:8px;margin-top:8px"><button class="primary" data-pay-order="${o.id}" data-title="${escapeHtml(o.item_title)}" data-price="${o.price_zmw}" data-listing="${o.listing_id || ''}">Pay now</button><button class="ghost" data-cancel-order="${o.id}" style="background:#ffcdd2;color:#c62828;border-color:#ef9a9a">Cancel order</button></div>` : ''}
          ${o.status === 'pending' ? `<button class="ghost" data-cancel-order="${o.id}" style="background:#ffcdd2;color:#c62828;border-color:#ef9a9a;margin-top:8px">Cancel order</button>` : ''}
          <div style="font-size:13px">
            Getting it: ${escapeHtml(o.fulfilment || 'Not specified')}<br>
            Payment: ${escapeHtml(o.payment_method || 'Not specified')}<br>
            Town: ${escapeHtml(o.buyer_town || 'Not specified')}
          </div>
          ${o.drop_address ? `<p style="font-size:13px">Drop-off: ${escapeHtml(o.drop_address)}</p>` : ''}
        </div>`
        )
        .join('');
    }
    if (localRows.length) {
      html += '<h3 style="margin:16px 0 8px">Local demo orders (this device)</h3>';
      html += localRows
        .map(
          (o, i) => `<div style="border:1px solid #e1e8df;border-radius:12px;padding:14px;margin:10px 0">
          <div style="display:flex;justify-content:space-between;gap:10px"><b>${escapeHtml(o.item)}</b><b style="color:#176b45">${money(o.price)}</b></div>
          <p style="margin:6px 0;color:#637067;font-size:13px">Demo #${localRows.length - i} · ${new Date(o.time).toLocaleString()}</p>
          <div style="font-size:13px">Getting it: ${escapeHtml(o.fulfilment || 'Not specified')}<br>Payment: ${escapeHtml(o.payment || 'Not specified')}</div>
          <p style="font-size:12px;color:#7b867e;margin-bottom:0">Saved on this device only.</p>
        </div>`
        )
        .join('');
    }
    box.innerHTML = html;
  }
  document.getElementById('ordersModal').classList.add('show');
}

export function bindOrdersUI(render) {
  document.getElementById('ordersBtn').onclick = openOrders;
  document.getElementById('buyerDashboardBtn')?.addEventListener('click', () => {
    const oc = document.getElementById('ordersCount')?.textContent || '0';
    const sc = document.getElementById('savedCount')?.textContent || '0';
    const boc = document.getElementById('buyerOrdersCount');
    const bsc = document.getElementById('buyerSavedCount');
    if (boc) boc.textContent = oc;
    if (bsc) bsc.textContent = sc;
    document.getElementById('buyerDashboardModal')?.classList.add('show');
  });
  document.getElementById('buyerOrdersBtn')?.addEventListener('click', () => {
    document.getElementById('buyerDashboardModal')?.classList.remove('show');
    openOrders();
  });
  document.getElementById('profileBtn')?.addEventListener('click', openProfile);
  document.getElementById('profileForm')?.addEventListener('submit', saveProfile);
  document.getElementById('profileLogin')?.addEventListener('click', () => {
    document.getElementById('profileModal')?.classList.remove('show');
    window.marketHubAuth?.open();
  });
  document.getElementById('profileSignOut')?.addEventListener('click', () => {
    document.getElementById('authSignOut')?.click();
    document.getElementById('profileModal')?.classList.remove('show');
  });
  document.getElementById('ordersList')?.addEventListener('click', async e => {
    const pay = e.target.closest('[data-pay-order]');
    if (pay) {
      state.payingOrderId = pay.dataset.payOrder;
      state.payingListingId = pay.dataset.listing || '';
      state.payingTitle = pay.dataset.title || '';
      document.getElementById('pinPayText').textContent =
        `Pay for ${pay.dataset.title || 'this item'} (${money(pay.dataset.price || 0)}). Enter your mobile money PIN.`;
      document.getElementById('momoPin').value = '';
      document.getElementById('pinModal').classList.add('show');
      return;
    }
    const cancel = e.target.closest('[data-cancel-order]');
    if (cancel) {
      await cloud.updateOrderStatus(cancel.dataset.cancelOrder, 'cancelled');
      toast('Order cancelled.');
      await openOrders();
      return;
    }
    const collect = e.target.closest('[data-collect]');
    if (collect) {
      const item = findItem(collect.dataset.collect);
      const { openInAppNav } = await import('./nav.js');
      if (item) openInAppNav([item]);
      else toast('Shop location will show when the listing has a map pin.');
      return;
    }
    const rider = e.target.closest('[data-rider]');
    if (rider) {
      document.getElementById('riderModal')?.classList.add('show');
    }
  });
  document.getElementById('pinForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const pin = document.getElementById('momoPin').value.trim();
    if (pin.length < 4) {
      toast('Enter at least 4 digits.');
      return;
    }
    if (!state.payingOrderId) return;
    try {
      await cloud.updateOrderStatus(state.payingOrderId, 'completed');
    } catch (err) {
      toast('Could not mark paid: ' + (err.message || err) + '. Run the buyer update SQL.');
      return;
    }
    document.getElementById('pinModal').classList.remove('show');
    document.getElementById('ordersModal')?.classList.remove('show');
    document.getElementById('collectItemText').textContent =
      (state.payingTitle || 'Your item') + ' is paid. How do you want to get it?';
    document.getElementById('collectModal').classList.add('show');
    toast('Payment confirmed. Order marked completed.');
    state.payingOrderId = null;
  });

  document.getElementById('collectBtn')?.addEventListener('click', async () => {
    const item = findItem(state.payingListingId);
    if (!item || item.lat == null || item.lng == null) {
      toast('This listing has no pickup pin. Ask the seller to set one.');
      return;
    }
    const { openInAppNav } = await import('./nav.js');
    openInAppNav([item]);
  });
  document.getElementById('riderBtn')?.addEventListener('click', () => {
    document.getElementById('riderModal')?.classList.add('show');
  });
  document.getElementById('openYangoBtn')?.addEventListener('click', () => {
    const item = findItem(state.payingListingId);
    if (!item || item.lat == null || item.lng == null) {
      toast('This listing has no pickup pin.');
      return;
    }
    const { lat, lng } = item;
    window.location.href = `intent://route?start_lat=${lat}&start_lon=${lng}#Intent;scheme=yango;package=com.yandex.yango;end`;
  });

  window.buyNow = openCheckout;
  window.openProfile = openProfile;
}

function mapEmbedSafe(v) {
  return 'https://maps.google.com/maps?q=' + encodeURIComponent(v + ', Zambia') + '&output=embed';
}

function showDetailSafe(id) {
  import('./listings-ui.js').then(m => m.showDetail(id)).catch(() => {});
}
