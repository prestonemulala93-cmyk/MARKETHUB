import { initAuth, setOnSessionChange } from './auth.js';
import * as cloud from './cloud.js';
import { bindMapUI } from './maps.js';
import { bindCartUI, updateBasketDock } from './cart.js';
import { bindListingsUI, render } from './listings-ui.js';
import { bindOrdersUI } from './orders.js';
import { bindSellerUI } from './seller.js';
import { bindChatUI } from './chat.js';

function bindModals() {
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => document.getElementById(b.dataset.close)?.classList.remove('show');
  });
  document.querySelectorAll('.modalback').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.remove('show');
    });
  });
}

async function onAuthSession(session) {
  if (session?.user) {
    await cloud.loadMyCloudListings();
    await cloud.loadBuyerOrders();
    await cloud.loadSellerOrders();
  } else {
    // keep public listings; clear seller-scoped caches
    const { state } = await import('./state.js');
    state.myCloudListings = [];
    state.cloudOrders = [];
    state.sellerOrders = [];
  }
  render();
}

export async function boot() {
  bindModals();
  bindMapUI();
  bindCartUI(render);
  bindListingsUI();
  bindOrdersUI(render);
  bindSellerUI();
  bindChatUI();

  setOnSessionChange(onAuthSession);
  const auth = initAuth();
  window.marketHubAuth = auth;
  const { state } = await import('./state.js');
  window.marketHubCloud = {
    reload: cloud.loadCloudListings,
    getListings: () => state.cloudItems.slice(),
    publishListing: cloud.publishListing
  };

  updateBasketDock();
  render();
  await cloud.loadCloudListings();
  if (auth?.getSession?.()) {
    await onAuthSession(auth.getSession());
  }
}

boot().catch(err => console.error('MarketHub boot failed:', err));
