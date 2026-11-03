import {
  state,
  persistCart,
  sellerProfile,
  saveSellerProfile,
  findItem
} from './state.js';
import { escapeHtml, money, toast } from './utils.js';
import * as cloud from './cloud.js';
import { fillEditForm, openSell, render } from './listings-ui.js';
import { openOrders } from './orders.js';

function sellerManagedItems() {
  // Cloud listings are the source of truth for the signed-in seller.
  return [...state.myCloudListings];
}

function sellerListingRow(x) {
  const status = x.status || 'active';
  return `<div class="seller-row" data-title="${escapeHtml((x.title + ' ' + x.category + ' ' + x.location).toLowerCase())}">
    <div class="seller-row-icon">${x.emoji || '📦'}</div>
    <div class="seller-row-main">
      <b>${escapeHtml(x.title)}</b>
      <div style="font-weight:900;color:#176b45">${money(x.price)}</div>
      <small style="color:#66736b">${escapeHtml(x.location || 'Zambia')} · ${escapeHtml(x.category || 'Other')} ·
        <span class="status-label ${status === 'sold' ? 'sold' : ''}">${status === 'sold' ? 'Sold' : status === 'draft' ? 'Draft' : 'Active'}</span>
        ${x.cloudDbId ? ' · cloud' : ' · local'}
      </small>
    </div>
    <div class="seller-actions">
      <button class="ghost" data-seller-view="${x.id}">Details</button>
      ${
        status === 'sold'
          ? `<button class="ghost" data-seller-status="${x.id}" data-status="active">Relist</button>`
          : `<button class="ghost" data-seller-edit="${x.id}">✏️ Edit</button>
             <button class="ghost" data-seller-status="${x.id}" data-status="sold">Mark sold</button>`
      }
      <button class="ghost seller-danger" data-seller-delete="${x.id}">🗑 Delete</button>
    </div>
  </div>`;
}

export function sellerGo(screen) {
  state.sellerScreen = screen;
  renderSellerDashboard();
}

export async function openSellerDashboard() {
  if (state.session?.user) {
    await cloud.loadMyCloudListings();
    await cloud.loadSellerOrders();
  }
  renderSellerDashboard();
  document.getElementById('sellerDashboardModal').classList.add('show');
  promptPendingOrder();
}

function promptPendingOrder() {
  const pending = (state.sellerOrders || []).find(o => o.status === 'pending');
  if (!pending) return;
  state.askingOrderId = pending.id;
  document.getElementById('sellerAskText').textContent =
    `Do you still have ${pending.item_title || 'this item'}?`;
  document.getElementById('sellerAskModal').classList.add('show');
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

export function renderSellerDashboard() {
  const box = document.getElementById('sellerDashboardContent');
  const items = sellerManagedItems();
  // Seller dashboard must only show orders for the seller's shop, never the seller's own purchases
  const orders = state.sellerOrders || [];
  const profile = sellerProfile();
  const active = items.filter(x => x.status !== 'sold' && x.status !== 'draft').length;
  const sold = items.filter(x => x.status === 'sold').length;
  const drafts = items.filter(x => x.status === 'draft').length;
  const name = profile.name || items[0]?.seller || 'Your seller profile';
  const totalSales = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((n, o) => n + Number(o.price_zmw || 0), 0);
  const tabs = [
    ['home', 'Dashboard'],
    ['listings', 'My Listings'],
    ['orders', 'Orders'],
    ['earnings', 'Earnings'],
    ['profile', 'Profile & Shop']
  ];

  let html = `<div style="display:flex;gap:12px;align-items:center;background:#f4f8f2;padding:14px;border-radius:14px;flex-wrap:wrap">
    <div style="width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#dcefd5;color:#176b45;font-weight:900;font-size:22px">${escapeHtml(name.charAt(0).toUpperCase())}</div>
    <div style="flex:1"><b>${escapeHtml(name)}</b>
      <div style="font-size:13px;color:#66736b">${escapeHtml(profile.shop || 'MarketHub Seller')} · ${escapeHtml(profile.location || 'Zambia')}</div>
    </div>
    <button class="primary" data-seller-sell>＋ Sell item</button>
  </div>
  <div class="seller-nav">${tabs
    .map(
      t =>
        `<button class="${state.sellerScreen === t[0] ? 'active' : ''}" data-seller-go="${t[0]}">${t[1]}</button>`
    )
    .join('')}</div>`;

  if (state.sellerScreen === 'home') {
    html += `<div class="seller-stats">
      <div class="seller-stat"><b>${active}</b><span>Active listings</span></div>
      <div class="seller-stat"><b>${orders.length}</b><span>Orders</span></div>
      <div class="seller-stat"><b>${sold}</b><span>Sold items</span></div>
      <div class="seller-stat"><b>—</b><span>Rating</span></div>
    </div>
    <div class="seller-panel"><h3 style="margin:0 0 6px">Manage your shop</h3>
      <p style="margin:0;color:#66736b">Edit products, track orders, and keep your seller information up to date.</p>
      <div class="seller-nav">
        <button data-seller-go="listings">🛍 My Listings (${active + sold + drafts})</button>
        <button data-seller-go="orders">📦 Orders (${orders.length})</button>
        <button data-seller-go="earnings">💰 Earnings</button>
        <button data-seller-go="profile">🏪 Profile & Shop</button>
      </div>
    </div>
    <div class="seller-panel"><h3 style="margin-top:0">Recently listed</h3>
      ${items.slice(0, 3).map(x => sellerListingRow(x)).join('') || '<p>You have not published a listing yet.</p>'}
    </div>`;
  } else if (state.sellerScreen === 'listings') {
    const visible = items.filter(x =>
      state.sellerTab === 'active'
        ? x.status !== 'sold' && x.status !== 'draft'
        : state.sellerTab === 'sold'
          ? x.status === 'sold'
          : x.status === 'draft'
    );
    html += `<div class="seller-stats">
      <div class="seller-stat"><b>${active}</b><span>Active</span></div>
      <div class="seller-stat"><b>${sold}</b><span>Sold</span></div>
      <div class="seller-stat"><b>${drafts}</b><span>Drafts</span></div>
    </div>
    <div class="seller-tabs">
      <button class="seller-tab ${state.sellerTab === 'active' ? 'active' : ''}" data-seller-tab="active">Active (${active})</button>
      <button class="seller-tab ${state.sellerTab === 'sold' ? 'active' : ''}" data-seller-tab="sold">Sold (${sold})</button>
      <button class="seller-tab ${state.sellerTab === 'draft' ? 'active' : ''}" data-seller-tab="draft">Drafts (${drafts})</button>
    </div>
    <div class="seller-field"><input id="sellerListingSearch" placeholder="Search your listings…"></div>
    <div id="sellerListingRows">${
      visible.length
        ? visible.map(x => sellerListingRow(x)).join('')
        : `<div class="empty"><h3>No ${state.sellerTab} listings yet</h3><p>Publish an item to see it here.</p></div>`
    }</div>`;
  } else if (state.sellerScreen === 'orders') {
    const cloudOrders = state.sellerOrders || [];
    html += `<h3>Orders for your shop</h3>
      <p style="color:#66736b">Incoming orders from buyers for your listings. Your own purchases appear under “My Orders” in the header.</p>
      <div class="seller-tabs"><span class="seller-tab active">All (${cloudOrders.length})</span></div>`;
    if (cloudOrders.length) {
      html += cloudOrders
        .map(
          o => `<div class="seller-panel">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <b>${escapeHtml(o.item_title || 'Order')}</b>
            <span class="status-label" style="${
              (o.status || 'pending') === 'confirmed' ? 'background:#fff3e0;color:#e65100;border:1px solid #ffcc80' :
              (o.status || 'pending') === 'completed' ? 'background:#c8e6c9;color:#1b5e20;border:1px solid #81c784' :
              (o.status || 'pending') === 'cancelled' ? 'background:#ffcdd2;color:#c62828;border:1px solid #ef9a9a' :
              'background:#e8f5e9;color:#2e7d32'
            }">${escapeHtml(o.status || 'pending')}</span>
          </div>
          <p style="margin:6px 0;font-size:13px;color:#66736b">
            ${escapeHtml(o.buyer_name || '')} · ${escapeHtml(o.buyer_phone || '')} · ${escapeHtml(o.buyer_town || '')}
          </p>
          <b style="color:#176b45">${money(o.price_zmw || 0)}</b>
          <p style="font-size:12px;color:#66736b">${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</p>
          <p style="font-size:13px">${escapeHtml(o.fulfilment || '')}${o.drop_address ? ' · ' + escapeHtml(o.drop_address) : ''}</p>
          ${(o.status || 'pending') === 'pending' ? `<p style="font-size:14px;margin:8px 0"><b>Do you still have ${escapeHtml(o.item_title || 'this item')}?</b></p>` : ''}
          <div class="seller-actions" style="margin-top:8px">
            ${o.status === 'pending' ? `<button class="primary" data-order-status="${escapeHtml(o.id)}" data-status="confirmed">Yes</button><button class="ghost seller-danger" data-order-status="${escapeHtml(o.id)}" data-status="cancelled">No</button>` : ''}
            ${o.status === 'confirmed' ? `<span style="font-size:13px;color:#e65100;flex-basis:100%">Buyer will pay you directly. Tap once you have received the money.</span><button class="primary" data-order-status="${escapeHtml(o.id)}" data-status="completed">Payment received</button><button class="ghost seller-danger" data-order-status="${escapeHtml(o.id)}" data-status="cancelled">Cancel</button>` : ''}
            ${o.status === 'completed' ? `<span style="font-size:13px;color:#1b5e20">Paid. Order completed and item marked sold.</span>` : ''}
          </div>
        </div>`
        )
        .join('');
    } else {
      html +=
        '<div class="empty"><h3>No shop orders yet</h3><p>Orders placed by buyers for your listings will appear here.</p></div>';
    }
  } else if (state.sellerScreen === 'earnings') {
    const completed = (state.sellerOrders || []).filter(o =>
      ['completed', 'delivered'].includes(String(o.status || '').toLowerCase())
    );
    const gross = completed.reduce((n, o) => n + Number(o.price_zmw || 0), 0);
    html += `<h3>Earnings</h3>
      <p style="color:#66736b">Based on shop orders in Supabase. Not a verified payment ledger.</p>
      <div class="seller-metric-grid">
        <div class="seller-metric"><span>Total order value</span><strong>${money(totalSales)}</strong></div>
        <div class="seller-metric"><span>Completed order value</span><strong>${money(gross)}</strong></div>
        <div class="seller-metric"><span>Completed orders</span><strong>${completed.length}</strong></div>
      </div>
      <div class="seller-panel">
        <h3 style="margin-top:0">Earnings breakdown</h3>
        <p>Product sales <b style="float:right">${money(gross)}</b></p>
        <p>Platform fees <b style="float:right">Not configured</b></p>
        <p style="border-top:1px solid #e4e9e3;padding-top:10px">Net earnings <b style="float:right">${money(gross)}</b></p>
        <button class="primary" data-toast="Withdrawals will be available after secure payment integration">Withdraw</button>
      </div>`;
  } else if (state.sellerScreen === 'profile') {
    const p = profile;
    html += `<h3>Profile & Shop</h3>
      <p style="color:#66736b">Public details buyers see. Saved on this device (shop name on cloud is set when you publish).</p>
      <form id="sellerProfileForm">
        <div class="seller-field"><label>Seller name *</label>
          <input name="name" required maxlength="70" value="${escapeHtml(p.name || items[0]?.seller || '')}" placeholder="Your name"></div>
        <div class="seller-field"><label>Shop name</label>
          <input name="shop" maxlength="80" value="${escapeHtml(p.shop || '')}" placeholder="e.g. Mwape Electronics"></div>
        <div class="seller-field"><label>Phone number</label>
          <input name="phone" value="${escapeHtml(p.phone || items[0]?.phone || '')}" placeholder="09XXXXXXXX"></div>
        <div class="seller-field"><label>Shop description</label>
          <textarea name="bio" rows="3" maxlength="400" placeholder="Tell buyers about your shop">${escapeHtml(p.bio || '')}</textarea></div>
        <div class="seller-field"><label>Location</label>
          <select name="location">
            ${['Lusaka','Kitwe','Ndola','Livingstone','Kabwe','Chipata']
              .map(c => `<option ${p.location === c ? 'selected' : ''}>${c}</option>`)
              .join('')}
          </select>
        </div>
        <button class="primary" type="submit">Save profile</button>
      </form>
      <p style="font-size:12px;color:#78847b">Seller verification and ratings require completed transaction data.</p>`;
  }

  box.innerHTML = html;

  const pf = document.getElementById('sellerProfileForm');
  if (pf) {
    pf.onsubmit = e => {
      e.preventDefault();
      const f = new FormData(pf);
      const p = {
        name: String(f.get('name') || '').trim(),
        shop: String(f.get('shop') || '').trim(),
        phone: String(f.get('phone') || '').trim(),
        bio: String(f.get('bio') || '').trim(),
        location: String(f.get('location') || 'Lusaka')
      };
      saveSellerProfile(p);
      toast('Seller profile saved');
      renderSellerDashboard();
    };
  }

  document.getElementById('sellerListingSearch')?.addEventListener('input', e => {
    const v = (e.target.value || '').toLowerCase();
    document.querySelectorAll('#sellerListingRows .seller-row').forEach(r => {
      r.style.display = r.dataset.title.includes(v) ? 'flex' : 'none';
    });
  });
}

async function changeListingStatus(id, status) {
  const items = sellerManagedItems();
  const x = items.find(a => a.id === id || String(a.id) === String(id));
  if (!x || !x.cloudDbId) return;
  try {
    await cloud.setCloudListingStatus(x.cloudDbId, status);
    toast(status === 'sold' ? 'Listing marked as sold' : 'Listing relisted');
    await cloud.loadMyCloudListings();
    await cloud.loadCloudListings();
    render();
    renderSellerDashboard();
  } catch (err) {
    toast('Could not update status: ' + (err.message || err));
  }
}

async function deleteListing(id) {
  const items = sellerManagedItems();
  const x = items.find(a => a.id === id || String(a.id) === String(id));
  if (!x || !x.cloudDbId) return;
  if (!confirm(`Delete “${x.title}” from MarketHub? This cannot be undone.`)) return;
  try {
    await cloud.deleteCloudListing(x.cloudDbId);
    toast('Listing deleted');
    await cloud.loadMyCloudListings();
    await cloud.loadCloudListings();
    state.cart = state.cart.filter(a => a !== x.id);
    persistCart();
    render();
    renderSellerDashboard();
  } catch (err) {
    toast('Could not delete: ' + (err.message || err));
  }
}

function editListing(id) {
  const items = sellerManagedItems();
  const x = items.find(a => a.id === id || String(a.id) === String(id));
  if (!x) return;
  document.getElementById('sellerDashboardModal').classList.remove('show');
  fillEditForm(x);
}

function viewSellerListing(id) {
  const items = sellerManagedItems();
  const x = items.find(a => a.id === id || String(a.id) === String(id));
  if (!x) return;
  const box = document.getElementById('sellerDashboardContent');
  box.innerHTML = `<button class="ghost" data-seller-go="listings">← Back to My Listings</button>
    <div class="seller-panel" style="margin-top:12px">
      <div style="font-size:64px;background:#f2f6f0;border-radius:12px;text-align:center;padding:20px">${x.emoji || '📦'}</div>
      <h2>${escapeHtml(x.title)}</h2>
      <h2 style="color:#176b45;margin:0">${money(x.price)}</h2>
      <p>${escapeHtml(x.desc || 'No description provided.')}</p>
      <p><b>Category:</b> ${escapeHtml(x.category || 'Other')}<br>
         <b>Condition:</b> ${escapeHtml(x.condition || 'Not specified')}<br>
         <b>Location:</b> ${escapeHtml(x.location || 'Zambia')}<br>
         <b>Pickup address:</b> ${escapeHtml(x.address || 'Not specified')}<br>
         <b>Status:</b> ${escapeHtml(x.status || 'active')}
         ${x.cloudDbId ? '<br><b>Cloud id:</b> ' + escapeHtml(String(x.cloudDbId).slice(0, 8)) + '…' : ''}
      </p>
      <div class="seller-nav">
        <button data-seller-edit="${x.id}">✏️ Edit listing</button>
        ${
          x.status === 'sold'
            ? `<button data-seller-status="${x.id}" data-status="active">Relist</button>`
            : `<button data-seller-status="${x.id}" data-status="sold">Mark as Sold</button>`
        }
        <button class="seller-danger" data-seller-delete="${x.id}">🗑 Delete</button>
      </div>
    </div>`;
}

export function bindSellerUI() {
  document.getElementById('sellerDashboardBtn').onclick = openSellerDashboard;
  async function answerAsk(status, okMessage) {
    if (!state.askingOrderId) return;
    try {
      await cloud.updateOrderStatus(state.askingOrderId, status);
      toast(okMessage);
    } catch (err) {
      toast('Could not update order: ' + (err.message || err));
    }
    document.getElementById('sellerAskModal').classList.remove('show');
    await cloud.loadSellerOrders();
    renderSellerDashboard();
  }
  document.getElementById('sellerAskYes')?.addEventListener('click', () =>
    answerAsk('confirmed', 'Order confirmed. The buyer can now see your number to pay you.')
  );
  document.getElementById('sellerAskNo')?.addEventListener('click', () =>
    answerAsk('cancelled', 'Order cancelled.')
  );

  document.getElementById('sellerDashboardContent').addEventListener('click', async e => {
    const go = e.target.closest('[data-seller-go]');
    if (go) return sellerGo(go.dataset.sellerGo);

    const tab = e.target.closest('[data-seller-tab]');
    if (tab) {
      state.sellerTab = tab.dataset.sellerTab;
      return renderSellerDashboard();
    }

    if (e.target.closest('[data-seller-sell]')) {
      document.getElementById('sellerDashboardModal').classList.remove('show');
      return openSell();
    }

    const view = e.target.closest('[data-seller-view]');
    if (view) return viewSellerListing(Number(view.dataset.sellerView) || view.dataset.sellerView);

    const edit = e.target.closest('[data-seller-edit]');
    if (edit) return editListing(Number(edit.dataset.sellerEdit) || edit.dataset.sellerEdit);

    const st = e.target.closest('[data-seller-status]');
    if (st) {
      return changeListingStatus(
        Number(st.dataset.sellerStatus) || st.dataset.sellerStatus,
        st.dataset.status
      );
    }

    const del = e.target.closest('[data-seller-delete]');
    if (del) return deleteListing(Number(del.dataset.sellerDelete) || del.dataset.sellerDelete);

    const ostatus = e.target.closest('[data-order-status]');
    if (ostatus) {
      const next = ostatus.dataset.status;
      if (next === 'completed' && !confirm('Confirm you have received the payment? The item will be marked sold and any other open orders for it cancelled.')) return;
      try {
        await cloud.updateOrderStatus(ostatus.dataset.orderStatus, next);
        toast('Order marked ' + next);
        await cloud.loadSellerOrders();
        if (next === 'completed') {
          // The server marks the listing sold; refresh both views.
          await cloud.loadMyCloudListings();
          await cloud.loadCloudListings();
          render();
        }
        renderSellerDashboard();
      } catch (err) {
        toast('Could not update order: ' + (err.message || err));
      }
      return;
    }

    const t = e.target.closest('[data-toast]');
    if (t) toast(t.dataset.toast);
  });

  window.sellerGo = sellerGo;
  window.openSellerDashboard = openSellerDashboard;
}
