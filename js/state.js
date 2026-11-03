import { DEMO_ITEMS } from './config.js';
import { loadJSON, saveJSON } from './utils.js';

export const state = {
  userItems: loadJSON('mh_items', []).map(x => ({ ...x, status: x.status || 'active' })),
  cloudItems: [],
  myCloudListings: [], // signed-in seller's listings (all statuses)
  saved: new Set(loadJSON('mh_saved', [])),
  cart: loadJSON('mh_cart', []),
  localOrders: loadJSON('mh_orders', []),
  cloudOrders: [], // buyer's cloud orders
  sellerOrders: [], // seller's shop orders
  activeCat: '',
  savedOnly: false,
  searchText: '',
  sellerTab: 'active',
  sellerScreen: 'home',
  editingListingId: null, // front-end id
  editingCloudDbId: null, // supabase uuid when editing cloud listing
  sellerPin: null,
  buyerPin: null,
  checkoutId: null,
  session: null
};

export function persistUserItems() {
  saveJSON('mh_items', state.userItems);
}

export function persistSaved() {
  saveJSON('mh_saved', [...state.saved]);
}

export function persistCart() {
  saveJSON('mh_cart', state.cart);
}

export function persistLocalOrders() {
  saveJSON('mh_orders', state.localOrders);
}

/** Browse grid: de-dupe local vs cloud by cloudDbId; prefer cloud (signed images). */
export function allItems() {
  const cloudDbIds = new Set(state.cloudItems.map(x => x.cloudDbId).filter(Boolean));
  const localOnly = state.userItems.filter(x => !x.cloudDbId || !cloudDbIds.has(x.cloudDbId));
  return [...localOnly, ...state.cloudItems, ...DEMO_ITEMS];
}

export function findItem(id) {
  const key = String(id);
  return allItems().find(a => String(a.id) === key || String(a.cloudDbId) === key) ||
    state.myCloudListings.find(a => String(a.id) === key || String(a.cloudDbId) === key) ||
    state.userItems.find(a => String(a.id) === key || String(a.cloudDbId) === key);
}

export function sellerProfile() {
  return loadJSON('mh_seller_profile', {});
}

export function saveSellerProfile(p) {
  saveJSON('mh_seller_profile', p);
}
