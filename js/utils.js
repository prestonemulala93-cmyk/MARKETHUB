export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function money(n) {
  return 'K' + Number(n).toLocaleString('en-US');
}

export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

export function hashId(v) {
  let h = 0;
  for (let i = 0; i < String(v).length; i++) h = ((h << 5) - h + String(v).charCodeAt(i)) | 0;
  return 1000000000 + Math.abs(h);
}

export function mapEmbedUrl(place) {
  return 'https://maps.google.com/maps?q=' + encodeURIComponent(place || 'Lusaka, Zambia') + '&output=embed';
}

export function loadJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
