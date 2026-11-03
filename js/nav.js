import { escapeHtml, toast } from './utils.js';
import { getRouteOrigin } from './maps.js';

let navMap = null;

export async function openInAppNav(items) {
  const stops = (items || []).filter(x => x.lat != null && x.lng != null);
  if (!stops.length) {
    toast('These items have no map pins yet. Ask the seller to set a pickup pin.');
    return;
  }
  document.getElementById('navStopList').innerHTML = stops.map((x, i) =>
    `<li><b>${i + 1}. ${escapeHtml(x.title)}</b><br><span style="color:#66736b">${escapeHtml(x.address || x.location)}</span></li>`
  ).join('');
  document.getElementById('navModal').classList.add('show');
  setTimeout(() => drawNav(stops), 80);
}

async function drawNav(stops) {
  const el = document.getElementById('navMap');
  if (!el || !window.L) return;
  if (navMap) {
    navMap.remove();
    navMap = null;
  }
  navMap = L.map(el).setView([stops[0].lat, stops[0].lng], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(navMap);

  const origin = getRouteOrigin();
  const points = [];
  if (origin) points.push([origin.lat, origin.lng]);
  stops.forEach(x => points.push([x.lat, x.lng]));

  if (origin) {
    L.circleMarker([origin.lat, origin.lng], { radius: 8, color: '#2454a6', fillColor: '#2454a6', fillOpacity: 1 })
      .addTo(navMap)
      .bindPopup('You start here');
  }
  stops.forEach((x, i) => {
    const icon = L.divIcon({
      className: 'nav-pin',
      html: `<div style="background:#176b45;color:#fff;padding:4px 8px;border-radius:8px;font-size:12px;font-weight:800;white-space:nowrap;border:2px solid #fff">${i + 1}. ${escapeHtml(x.title)}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 18]
    });
    L.marker([x.lat, x.lng], { icon }).addTo(navMap)
      .bindPopup(`<b>${escapeHtml(x.title)}</b><br>${escapeHtml(x.address || x.location)}`);
  });

  try {
    const coords = points.map(p => `${p[1]},${p[0]}`).join(';');
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    const data = await res.json();
    const line = data?.routes?.[0]?.geometry?.coordinates;
    if (line?.length) {
      const latlngs = line.map(c => [c[1], c[0]]);
      L.polyline(latlngs, { color: '#176b45', weight: 5 }).addTo(navMap);
      navMap.fitBounds(latlngs, { padding: [30, 30] });
      const mins = Math.round((data.routes[0].duration || 0) / 60);
      const km = ((data.routes[0].distance || 0) / 1000).toFixed(1);
      document.getElementById('navSummary').textContent = `${km} km · about ${mins} min · labeled by product`;
      return;
    }
  } catch {
    // fall through to pins only
  }
  navMap.fitBounds(points, { padding: [30, 30] });
  document.getElementById('navSummary').textContent = 'Pins labeled by product. Road line unavailable, so stops only.';
  setTimeout(() => navMap.invalidateSize(), 200);
}
