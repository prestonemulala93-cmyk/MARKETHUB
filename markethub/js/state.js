import { loadJSON, saveJSON } from './utils.js';

export const state = {
  // Local mirror removed — cloud listings are the source of truth.
  // userItems kept only as an empty array for any remaining legacy references.
  userItems: [],
  cloudItems: [],
  myCloudListings: [],
  saved: new Set(loadJSON('mh_saved', [])),
  cart: loadJSON('mh_cart', []),
  localOrders: loadJSON('mh_orders', []),
  cloudOrders: [],
  sellerOrders: [],
  activeCat: '',
  savedOnly: false,
  searchText: '',
  sellerTab: 'active',
  sellerScreen: 'home',
  editingListingId: null,
  editingCloudDbId: null,
  sellerPin: null,
  buyerPin: null,
  checkoutId: null,
  session: null
};

export function persistUserItems() {
  // No-op: local mirror removed.
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

/** Browse grid: cloud listings only (demo items removed for production). */
export function allItems() {
  return [...state.cloudItems];
}

export function findItem(id) {
  const key = String(id);
  return (
    state.cloudItems.find(a => a.id === key || a.cloudDbId === key) ||
    state.myCloudListings.find(a => a.id === key || a.cloudDbId === key) ||
    null
  );
}

export function sellerProfile() {
  return loadJSON('mh_seller_profile', {});
}

export function saveSellerProfile(p) {
  saveJSON('mh_seller_profile', p);
}
