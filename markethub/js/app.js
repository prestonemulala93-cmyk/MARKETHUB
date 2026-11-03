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
  document.getElementById('appFooter')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-footer]');
    if (!btn) return;
    document.querySelectorAll('#appFooter button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Prefer direct function calls so hidden buttons are not required
    if (btn.dataset.footer === 'seller') {
      if (window.openSellerDashboard) window.openSellerDashboard();
      else document.getElementById('sellerDashboardBtn')?.click();
    }
    if (btn.dataset.footer === 'buyer') {
      if (window.openOrders) window.openOrders();
      else document.getElementById('ordersBtn')?.click();
    }
    if (btn.dataset.footer === 'profile') {
      if (window.openProfile) window.openProfile();
      else document.getElementById('profileBtn')?.click();
    }
  });
  document.getElementById('welcomeLoginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const client = window.marketHubAuth?.client?.();
    const msg = document.getElementById('welcomeMessage');
    if (!client) {
      if (msg) msg.textContent = 'Account service did not load. Refresh the page.';
      return;
    }
    const email = document.getElementById('welcomeEmail').value.trim();
    const password = document.getElementById('welcomePassword').value;
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      document.getElementById('welcomeScreen')?.classList.add('hide');
    } catch (err) {
      if (msg) msg.textContent = err.message || 'Could not log in.';
    }
  });
  document.getElementById('welcomeSignup')?.addEventListener('click', () => {
    window.marketHubAuth?.open?.('signup');
  });
  document.getElementById('profileSignOut')?.addEventListener('click', () => {
    document.getElementById('authSignOut')?.click();
  });
}

async function onAuthSession(session) {
  const welcome = document.getElementById('welcomeScreen');
  if (session?.user) {
    welcome?.classList.add('hide');
    await cloud.loadMyCloudListings();
    await cloud.loadBuyerOrders();
    await cloud.loadSellerOrders();
  } else {
    welcome?.classList.remove('hide');
    const { state } = await import('./state.js');
    state.myCloudListings = [];
    state.cloudOrders = [];
    state.sellerOrders = [];
  }
  render();
}

export async function boot() {
  const note = document.getElementById('cloudListingNotice');
  try {
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
    render();
    if (auth?.getSession?.()) {
      await onAuthSession(auth.getSession());
    }
  } catch (err) {
    console.error('MarketHub boot failed:', err);
    if (note) note.textContent = 'App failed to start: ' + (err.message || err);
  }
}

boot().catch(err => {
  console.error('MarketHub boot failed:', err);
  const note = document.getElementById('cloudListingNotice');
  if (note) note.textContent = 'App failed to start: ' + (err.message || err);
});
