import { state } from './state.js';
import { escapeHtml, toast } from './utils.js';

let pickerMode = 'seller';
let pickMap = null;
let pickMarker = null;
let pendingPin = null;
let selectedSellerPlaceName = '';
let routeOriginCoords = null;
let routeOriginSearchResults = [];

export function openMapPicker(mode) {
  pickerMode = mode;
  pendingPin = mode === 'seller' ? state.sellerPin : state.buyerPin;
  const title = document.getElementById('mapPickerTitle');
  if (title) {
    title.textContent = mode === 'seller'
      ? (selectedSellerPlaceName || 'Choose your shop / pickup point')
      : 'Choose delivery drop-off point';
  }
  document.getElementById('mapPickerModal').classList.add('show');
  setTimeout(() => {
    if (!pickMap) {
      pickMap = L.map('pickMap').setView(
        pendingPin ? [pendingPin.lat, pendingPin.lng] : [-15.4167, 28.2833],
        pendingPin ? 16 : 12
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(pickMap);
      pickMap.on('click', e => setPendingPin(e.latlng.lat, e.latlng.lng));
    } else {
      pickMap.invalidateSize();
      if (pendingPin) pickMap.setView([pendingPin.lat, pendingPin.lng], 16);
    }
    if (pendingPin) setPendingPin(pendingPin.lat, pendingPin.lng);
    else document.getElementById('pickMapStatus').textContent = 'Tap the map to drop a pin.';
  }, 250);
}

export async function searchMapPlace() {
  const q = document.getElementById('mapPlaceSearch').value.trim();
  const box = document.getElementById('mapSearchResults');
  if (!q) {
    box.innerHTML = '<small>Type a place or landmark to search.</small>';
    return;
  }
  box.innerHTML = '<small>Searching places…</small>';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=zm&q=' + encodeURIComponent(q);
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('Search unavailable');
    const rows = await res.json();
    if (!rows.length) {
      box.innerHTML = '<small>No matches found. Try a nearby landmark or tap the map.</small>';
      return;
    }
    window.__mhMapResults = rows;
    box.innerHTML = rows.map((r, i) =>
      `<button type="button" class="ghost" style="text-align:left;white-space:normal" data-map-result="${i}">${escapeHtml(r.display_name)}</button>`
    ).join('');
  } catch {
    box.innerHTML = '<small>Could not search right now. You can still tap the map to place a pin.</small>';
  }
}

export function chooseSearchResult(i) {
  const r = window.__mhMapResults?.[i];
  if (!r || !pickMap) return;
  const lat = Number(r.lat), lng = Number(r.lon);
  const full = String(r.display_name || '').trim();
  selectedSellerPlaceName = full.split(',')[0].trim() || full;
  if (pickerMode === 'seller') {
    const title = document.getElementById('mapPickerTitle');
    if (title) title.textContent = selectedSellerPlaceName;
  }
  pickMap.setView([lat, lng], 16);
  setPendingPin(lat, lng);
  document.getElementById('mapSearchResults').innerHTML = '<small>Selected: ' + escapeHtml(r.display_name) + '</small>';
}

function setPendingPin(lat, lng) {
  pendingPin = { lat: Number(lat), lng: Number(lng) };
  if (!pickMap) return;
  if (pickMarker) pickMarker.setLatLng([lat, lng]);
  else {
    pickMarker = L.marker([lat, lng], { draggable: true }).addTo(pickMap);
    pickMarker.on('dragend', e => {
      const p = e.target.getLatLng();
      setPendingPin(p.lat, p.lng);
    });
  }
  const status = document.getElementById('pickMapStatus');
  if (status) {
    if (selectedSellerPlaceName && pickerMode === 'seller') {
      status.textContent = `${selectedSellerPlaceName} — selected on map (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`;
    } else {
      status.textContent = `Selected pin: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    }
  }
}

export function confirmMapPin() {
  if (!pendingPin) {
    toast('Tap the map first to choose a spot');
    return;
  }
  if (pickerMode === 'seller') {
    state.sellerPin = { ...pendingPin };
    const status = document.getElementById('sellerPinStatus');
    if (status) {
      status.textContent = selectedSellerPlaceName
        ? `${selectedSellerPlaceName} — pickup location saved`
        : `Pickup pin saved: ${state.sellerPin.lat.toFixed(5)}, ${state.sellerPin.lng.toFixed(5)}`;
    }
  } else {
    state.buyerPin = { ...pendingPin };
    document.getElementById('buyerPinStatus').textContent =
      `Drop-off pin saved: ${state.buyerPin.lat.toFixed(5)}, ${state.buyerPin.lng.toFixed(5)}`;
    document.getElementById('dropPin').value = `${state.buyerPin.lat}, ${state.buyerPin.lng}`;
  }
  document.getElementById('mapPickerModal').classList.remove('show');
  toast('Map pin saved');
}

export function useMyLocation(mode) {
  if (!navigator.geolocation) {
    toast('Location is not available in this browser');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (mode === 'seller') {
        state.sellerPin = p;
        document.getElementById('sellerPinStatus').textContent =
          `Pickup pin saved: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
      } else if (mode === 'buyer') {
        state.buyerPin = p;
        document.getElementById('buyerPinStatus').textContent =
          `Drop-off pin saved: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
        document.getElementById('dropPin').value = `${p.lat}, ${p.lng}`;
      } else {
        document.getElementById('routeStart').value = `${p.lat}, ${p.lng}`;
        routeOriginCoords = p;
      }
      if (mode === pickerMode && pickMap) {
        pickMap.setView([p.lat, p.lng], 16);
        setPendingPin(p.lat, p.lng);
      }
      toast('Location added');
    },
    () => toast('Please allow location access, or tap your location on the map'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

export async function searchRouteStart() {
  const q = document.getElementById('routeStart').value.trim();
  const box = document.getElementById('routeStartSuggestions');
  routeOriginCoords = null;
  if (q.length < 3) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<small>Searching for places…</small>';
  try {
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=zm&q=' + encodeURIComponent(q),
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!r.ok) throw new Error();
    routeOriginSearchResults = await r.json();
    if (!routeOriginSearchResults.length) {
      box.innerHTML = '<small>No places found. You can still use the address you typed.</small>';
      return;
    }
    routeOriginCoords = {
      lat: Number(routeOriginSearchResults[0].lat),
      lng: Number(routeOriginSearchResults[0].lon)
    };
    box.innerHTML =
      '<small>✓ Map starting point set to the closest search match. Choose another result below if needed.</small>' +
      routeOriginSearchResults.map((x, i) =>
        `<button type="button" class="ghost" style="text-align:left;white-space:normal" data-route-start="${i}">${escapeHtml(x.display_name)}</button>`
      ).join('');
  } catch {
    box.innerHTML = '<small>Place search is unavailable right now. You can still enter a starting address.</small>';
  }
}

export function selectRouteStart(i) {
  const r = routeOriginSearchResults[i];
  if (!r) return;
  routeOriginCoords = { lat: Number(r.lat), lng: Number(r.lon) };
  document.getElementById('routeStart').value = r.display_name;
  document.getElementById('routeStartSuggestions').innerHTML = '<small>✓ Starting point selected and mapped</small>';
}

export function getRouteOrigin() {
  return routeOriginCoords;
}

export function bindMapUI() {
  document.getElementById('mapPlaceSearch')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchMapPlace();
    }
  });
  document.getElementById('mapSearchResults')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-map-result]');
    if (btn) chooseSearchResult(Number(btn.dataset.mapResult));
  });
  document.getElementById('routeStart')?.addEventListener('input', () => {
    routeOriginCoords = null;
    searchRouteStart();
  });
  document.getElementById('routeStartSuggestions')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-route-start]');
    if (btn) selectRouteStart(Number(btn.dataset.routeStart));
  });
}

// Expose for inline onclick handlers still in HTML
window.openMapPicker = openMapPicker;
window.searchMapPlace = searchMapPlace;
window.confirmMapPin = confirmMapPin;
window.useMyLocation = useMyLocation;
window.openPinHelp = () => window.open('https://support.google.com/maps/answer/18539?hl=en', '_blank', 'noopener');
