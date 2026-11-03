import { state, findItem } from './state.js';
import { escapeHtml, toast } from './utils.js';
import { getClient } from './auth.js';

// Chat is a thread per (listing uuid, buyer uuid). Both ids are always passed explicitly,
// never derived from the demo/hash ids used by the browse grid.

const POLL_MS = 5000;
const $ = id => document.getElementById(id);

let view = 'closed'; // 'thread' | 'list' | 'closed'
let thread = null; // { listingId, buyerId, title }
let pollTimer = null;
let renderSeq = 0; // drops out-of-order responses
let lastSig = '';
let sending = false;

function me() {
  return state.session?.user?.id || null;
}

function stopPoll() {
  clearInterval(pollTimer);
  pollTimer = null;
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    if (!document.hidden) renderThread();
  }, POLL_MS);
}

function closeChat() {
  view = 'closed';
  thread = null;
  renderSeq++;
  stopPoll();
}

function setSub(text) {
  const sub = $('chatSub');
  if (!sub) return;
  sub.textContent = text;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'ghost';
  back.dataset.chatBack = '1';
  back.textContent = '← All chats';
  back.style.cssText = 'padding:4px 8px;margin-left:8px';
  sub.appendChild(back);
}

async function loadCloudThread(listingId, buyerId) {
  const client = getClient();
  if (!client || !listingId || !buyerId) return { rows: [], error: new Error('missing thread') };
  const { data, error } = await client
    .from('messages')
    .select('id,listing_id,buyer_id,sender_id,body,created_at')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) console.warn('Chat load failed:', error.message);
  return { rows: data || [], error };
}

async function renderThread() {
  const box = $('chatMessages');
  if (view !== 'thread' || !thread || !box) return;
  const uid = me();
  if (!uid) {
    stopPoll();
    return;
  }
  const seq = ++renderSeq;
  const { rows, error } = await loadCloudThread(thread.listingId, thread.buyerId);
  if (seq !== renderSeq || view !== 'thread') return; // closed, switched, or superseded
  if (error) {
    if (!lastSig) box.innerHTML = '<p style="color:#c62828">Messages could not load. Check your connection.</p>';
    return;
  }
  const sig = rows.length + ':' + (rows[rows.length - 1]?.id || '');
  if (sig === lastSig) return; // nothing new, avoid flicker
  const nearBottom = !lastSig || box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  lastSig = sig;
  if (!rows.length) {
    box.innerHTML = '<p style="color:#66736b">No messages yet. Say hello.</p>';
    return;
  }
  box.innerHTML = rows
    .map(m => {
      const mine = m.sender_id === uid;
      return `<div style="margin:8px 0;text-align:${mine ? 'right' : 'left'}">
      <div style="display:inline-block;max-width:80%;padding:8px 12px;border-radius:12px;text-align:left;white-space:pre-wrap;word-break:break-word;background:${mine ? '#176b45' : '#eef3ec'};color:${mine ? '#fff' : '#17211b'}">${escapeHtml(m.body)}</div>
      <div style="font-size:11px;color:#7a857d">${escapeHtml(new Date(m.created_at).toLocaleString())}</div>
    </div>`;
    })
    .join('');
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

async function openThread({ listingId, buyerId, title, sub }) {
  thread = { listingId, buyerId, title };
  view = 'thread';
  renderSeq++;
  lastSig = '';
  $('chatTitle').textContent = `Chat · ${title}`;
  setSub(sub || '');
  $('chatForm').style.display = 'flex';
  $('chatMessages').innerHTML = '<p style="color:#66736b">Loading…</p>';
  $('chatModal').classList.add('show');
  await renderThread();
  $('chatInput')?.focus();
  if (view === 'thread') startPoll();
}

/** Buyer-side entry point: "Chat" button on a listing. */
export async function openChatForItem(id) {
  const x = findItem(id);
  if (!x) return;
  const uid = me();
  if (!uid) {
    window.marketHubAuth?.open('signin');
    toast('Sign in to chat.');
    return;
  }
  if (!x.cloudDbId) {
    toast('Chat works on live listings only. Use Call or WhatsApp for this one.');
    return;
  }
  if ((state.myCloudListings || []).some(l => l.cloudDbId === x.cloudDbId)) {
    toast('This is your own listing. Open Messages to reply to buyers.');
    return;
  }
  await openThread({
    listingId: x.cloudDbId,
    buyerId: uid,
    title: x.title,
    sub: `Seller: ${x.seller}`
  });
}

async function showThreadList() {
  const uid = me();
  if (!uid) {
    window.marketHubAuth?.open('signin');
    toast('Sign in to see your chats.');
    return;
  }
  view = 'list';
  thread = null;
  renderSeq++;
  stopPoll();
  $('chatTitle').textContent = 'Your chats';
  $('chatSub').textContent = 'Tap a chat to continue';
  $('chatForm').style.display = 'none';
  const box = $('chatMessages');
  box.innerHTML = '<p style="color:#66736b">Loading…</p>';
  $('chatModal').classList.add('show');

  const client = getClient();
  const { data, error } = await client
    .from('messages')
    .select('listing_id,buyer_id,sender_id,body,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (view !== 'list') return;
  if (error) {
    box.innerHTML = '<p style="color:#c62828">Chats could not load. Check your connection.</p>';
    return;
  }

  const seen = new Set();
  const threads = [];
  for (const row of data || []) {
    const key = `${row.listing_id}:${row.buyer_id}`;
    if (seen.has(key)) continue; // rows are newest-first, so the first per thread is the latest
    seen.add(key);
    threads.push(row);
  }
  if (!threads.length) {
    box.innerHTML = '<p style="color:#66736b">No chats yet. Open a listing and tap Chat.</p>';
    return;
  }

  const titles = new Map();
  const ids = [...new Set(threads.map(t => t.listing_id))];
  const { data: listings } = await client.from('listings').select('id,title').in('id', ids);
  for (const l of listings || []) titles.set(l.id, l.title);
  if (view !== 'list') return;

  box.innerHTML = threads
    .map(t => {
      const title = titles.get(t.listing_id) || 'Listing chat';
      const asBuyer = t.buyer_id === uid;
      const preview = (t.sender_id === uid ? 'You: ' : '') + String(t.body || '').slice(0, 80);
      return `<button class="ghost" data-open-thread="${escapeHtml(t.listing_id)}" data-buyer="${escapeHtml(t.buyer_id)}" data-title="${escapeHtml(title)}" style="width:100%;text-align:left;margin:6px 0">
        <b>${escapeHtml(title)}</b> <small style="color:#176b45">${asBuyer ? 'You → seller' : 'Buyer enquiry'}</small><br>
        <span style="color:#66736b">${escapeHtml(preview)}</span></button>`;
    })
    .join('');
}

async function sendChat() {
  if (sending || view !== 'thread' || !thread) return;
  const input = $('chatInput');
  const body = input.value.trim().slice(0, 2000);
  if (!body) return;
  const uid = me();
  const client = getClient();
  if (!client || !uid) {
    toast('Sign in to send a message.');
    return;
  }
  sending = true;
  const btn = $('chatForm').querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    const { error } = await client.from('messages').insert({
      listing_id: thread.listingId,
      buyer_id: thread.buyerId,
      sender_id: uid,
      body
    });
    if (error) {
      toast('Message not sent: ' + error.message);
      return;
    }
    input.value = '';
    lastSig = '';
    await renderThread();
  } finally {
    sending = false;
    if (btn) btn.disabled = false;
  }
}

export function bindChatUI() {
  $('messagesBtn')?.addEventListener('click', showThreadList);
  $('chatForm')?.addEventListener('submit', e => {
    e.preventDefault();
    sendChat();
  });
  $('chatModal')?.addEventListener('click', e => {
    if (e.target.closest('[data-chat-back]')) {
      showThreadList();
      return;
    }
    const btn = e.target.closest('[data-open-thread]');
    if (!btn) return;
    const asBuyer = btn.dataset.buyer === me();
    openThread({
      listingId: btn.dataset.openThread,
      buyerId: btn.dataset.buyer,
      title: btn.dataset.title || 'Listing chat',
      sub: asBuyer ? 'Chat with the seller' : 'Buyer enquiry'
    });
  });

  // Stop polling the moment the modal is closed (X button, backdrop tap, anything).
  const modal = $('chatModal');
  if (modal && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      if (!modal.classList.contains('show')) closeChat();
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  window.openChatForItem = openChatForItem;
}
