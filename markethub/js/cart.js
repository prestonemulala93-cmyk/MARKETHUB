import { state, persistCart, allItems, findItem } from './state.js';
import { escapeHtml, money, toast } from './utils.js';
import { getRouteOrigin } from './maps.js';

export function updateBasketDock() {
  const items = state.cart.map(id => findItem(id)).filter(Boolean);
  const c = document.getElementById('dockBasketCount');
  const n = document.getElementById('cartCount');
  if (c) c.textContent = String(items.length);
  if (n) n.textContent = String(items.length);
}

export function saveCart() {
  persistCart();
  updateBasketDock();
}

export function addToCart(id) {
  if (!state.cart.includes(id)) state.cart.push(id);
  saveCart();
  toast('Added to your basket');
}

export function removeFromCart(id) {
  state.cart = state.cart.filter(x => x !== id);
  saveCart();
  openCart();
}

export function openCart() {
  const box = document.getElementById('cartItems');
  const items = state.cart.map(id => findItem(id)).filter(Boolean);
  if (!items.length) {
    box.innerHTML = '<div class="empty"><h3>Your basket is empty</h3><p>Browse products and tap “Add to basket” to collect items here.</p></div>';
  } else {
    box.innerHTML =
      items.map(x =>
        `<div style="display:flex;align-items:center;gap:12px;border:1px solid #e2e8e0;border-radius:10px;padding:10px;margin:8px 0">
          <div style="font-size:32px">${x.emoji || '📦'}</div>
          <div style="flex:1"><b>${escapeHtml(x.title)}</b>
            <div style="color:#176b45;font-weight:800">${money(x.price)}</div>
            <small>📍 ${escapeHtml(x.address || x.location)}${x.lat != null ? ' · map pin saved' : ''}</small>
          </div>
          <button class="ghost" data-remove-cart="${x.id}">Remove</button>
        </div>`
      ).join('') +
      `<p><b>Items total: ${money(items.reduce((s, x) => s + x.price, 0))}</b></p>
       <div id="basketMap" style="height:240px;border-radius:12px;margin:12px 0;border:1px solid #dce4da"></div>
       <button class="primary" style="width:100%;margin-top:8px" data-basket-buy>Buy now</button>`;
  }
  document.getElementById('routeResult').innerHTML = '';
  document.getElementById('cartModal').classList.add('show');
  if (items.length) setTimeout(() => renderBasketMap(items), 50);
}

function renderBasketMap(items) {
  const el = document.getElementById('basketMap');
  if (!el || !window.L) return;
  el.innerHTML = '';
  const map = L.map(el).setView([-15.4, 28.3], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);
  const bounds = [];
  items.forEach((x, i) => {
    if (x.lat == null || x.lng == null) return;
    const label = escapeHtml(x.title);
    const icon = L.divIcon({
      className: 'basket-pin',
      html: `<div style="background:#176b45;color:#fff;padding:4px 8px;border-radius:8px;font-size:12px;font-weight:800;white-space:nowrap;box-shadow:0 2px 6px #0004;border:2px solid #fff">${label}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 20]
    });
    const m = L.marker([x.lat, x.lng], { icon }).addTo(map);
    m.bindPopup(`<b>${label}</b><br>${escapeHtml(x.address || x.location)}`);
    bounds.push([x.lat, x.lng]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
  else map.setView([-15.4, 28.3], 6);
  setTimeout(() => map.invalidateSize(), 200);
}

export function planShoppingRoute() {
  const items = state.cart.map(id => findItem(id)).filter(Boolean);
  if (!items.length) {
    toast('Add items to your basket first');
    return;
  }
  const start = document.getElementById('routeStart').value.trim();
  if (!start) {
    toast('Enter your starting point or use your current location');
    document.getElementById('routeStart').focus();
    return;
  }
  const locs = items.map(x =>
    x.lat != null ? `${x.lat},${x.lng}` : (x.address || x.location + ', Zambia')
  );
  const unique = [...new Set(locs)];
  const originCoords = getRouteOrigin();
  const origin = originCoords ? `${originCoords.lat},${originCoords.lng}` : start;
  let url;
  if (unique.length === 1) {
    url = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(origin) +
      '&destination=' + encodeURIComponent(unique[0]);
  } else {
    url = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(start) +
      '&destination=' + encodeURIComponent(unique[unique.length - 1]) +
      '&waypoints=' + encodeURIComponent(unique.slice(0, -1).join('|')) +
      '&travelmode=driving';
  }
  document.getElementById('routeResult').innerHTML =
    `<div style="background:#e7f4e2;border-radius:12px;padding:14px">
      <b>Suggested shopping stops</b>
      <ol>${items.map(x =>
        `<li>${escapeHtml(x.title)} — ${escapeHtml(x.address || x.location)}${x.lat != null ? ' (pinned location)' : ''}</li>`
      ).join('')}</ol>
      <p style="font-size:12px">Stops stay labeled by product so you know what to collect at each place.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="primary" type="button" data-inapp-nav>Navigate in app</button>
        <button class="ghost" data-open-route="${encodeURIComponent(url)}">Open in Google Maps ↗</button>
      </div>
    </div>`;
}

export function bindCartUI(render) {
  document.getElementById('cartBtn').onclick = openCart;
  document.getElementById('cartItems')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-cart]');
    if (btn) removeFromCart(Number(btn.dataset.removeCart) || btn.dataset.removeCart);
    const buy = e.target.closest('[data-basket-buy]');
    if (buy) {
      const items = state.cart.map(id => findItem(id)).filter(Boolean);
      if (items.length) {
        import('./orders.js').then(m => m.openCheckout(items[0].id, items));
      }
    }
  });
  document.getElementById('routeResult')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-open-route]');
    if (btn) window.open(decodeURIComponent(btn.dataset.openRoute), '_blank', 'noopener');
    const nav = e.target.closest('[data-inapp-nav]');
    if (nav) {
      const items = state.cart.map(id => findItem(id)).filter(Boolean);
      const { openInAppNav } = await import('./nav.js');
      openInAppNav(items);
    }
  });
  window.planShoppingRoute = planShoppingRoute;
  window.addToCart = addToCart;
  window.removeFromCart = removeFromCart;
  window.toggleBasketDock = openCart;
  const dockBtn = document.getElementById('basketDockButton');
  if (dockBtn) dockBtn.onclick = openCart;
}

function initDraggableBasket() {
  const dock = document.getElementById('basketDock');
  const btn = document.getElementById('basketDockButton');
  if (!dock || !btn) return;
  let startX = 0, startY = 0, origX = 0, origY = 0, dragging = false, moved = false, pointerId = null;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function place(left, top, save) {
    const r = dock.getBoundingClientRect(), w = r.width || 54, h = r.height || 54;
    left = clamp(left, 6, Math.max(6, window.innerWidth - w - 6));
    top = clamp(top, 6, Math.max(6, window.innerHeight - h - 6));
    dock.style.left = left + 'px';
    dock.style.top = top + 'px';
    dock.style.right = 'auto';
    dock.style.bottom = 'auto';
    if (save) {
      try { localStorage.setItem('mh_basket_position', JSON.stringify({ left, top })); } catch {}
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem('mh_basket_position') || 'null');
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      dock.style.left = saved.left + 'px';
      dock.style.top = saved.top + 'px';
      dock.style.right = 'auto';
      dock.style.bottom = 'auto';
    }
  } catch {}

  btn.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    const r = dock.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY; origX = r.left; origY = r.top;
    dragging = true; moved = false; pointerId = e.pointerId;
    dock.classList.add('dragging');
    try { btn.setPointerCapture(pointerId); } catch {}
  });
  btn.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    if (moved) {
      e.preventDefault();
      place(origX + dx, origY + dy, false);
    }
  });
  function end(e) {
    if (!dragging || (e.pointerId !== undefined && e.pointerId !== pointerId)) return;
    dragging = false;
    dock.classList.remove('dragging');
    if (moved) {
      const r = dock.getBoundingClientRect();
      place(r.left, r.top, true);
      dock.dataset.justDragged = '1';
      setTimeout(() => { delete dock.dataset.justDragged; }, 250);
    }
    pointerId = null;
  }
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => {
    const r = dock.getBoundingClientRect();
    place(r.left, r.top, true);
  });
  document.addEventListener('click', e => {
    if (dock && !dock.contains(e.target) && dock.classList.contains('expanded')) {
      dock.classList.remove('expanded');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}
