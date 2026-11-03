import { state, findItem } from './state.js';
import { escapeHtml, toast } from './utils.js';
import { getClient } from './auth.js';

async function loadThread(listingId, buyerId) {
  const client = getClient();
  if (!client || !listingId || !buyerId) return [];
  const { data, error } = await client
    .from('messages')
    .select('id,listing_id,buyer_id,sender_id,body,created_at')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.warn('Chat load failed:', error.message);
    return [];
  }
  return data || [];
}

export async function openChatForItem(id) {
  const x = findItem(id);
  if (!x) return;
  if (!state.session?.user) {
    window.marketHubAuth?.open();
    toast('Sign in to chat.');
    return;
  }
  state.chatListingId = x.cloudDbId || id;
  state.chatBuyerId = state.session.user.id;
  document.getElementById('chatTitle').textContent = `Chat · ${x.title}`;
  document.getElementById('chatSub').textContent = `Seller: ${x.seller}`;
  await renderThread();
  document.getElementById('chatModal').classList.add('show');
  document.getElementById('chatInput')?.focus();
  clearInterval(state.chatPoll);
  state.chatPoll = setInterval(renderThread, 4000);
}

async function renderThread() {
  const me = state.session?.user?.id;
  const box = document.getElementById('chatMessages');
  if (!box || !me) return;
  const rows = await loadThread(state.chatListingId, state.chatBuyerId || me);
  if (!rows.length) {
    box.innerHTML = '<p style="color:#66736b">No messages yet. Say hello.</p>';
    return;
  }
  box.innerHTML = rows.map(m => `
    <div style="margin:8px 0;text-align:${m.sender_id === me ? 'right' : 'left'}">
      <div style="display:inline-block;max-width:80%;padding:8px 12px;border-radius:12px;background:${m.sender_id === me ? '#176b45' : '#eef3ec'};color:${m.sender_id === me ? '#fff' : '#17211b'}">
        ${escapeHtml(m.body)}
      </div>
      <div style="font-size:11px;color:#7a857d">${new Date(m.created_at).toLocaleString()}</div>
    </div>`).join('');
  box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const body = input.value.trim();
  if (!body) return;
  const client = getClient();
  const me = state.session?.user?.id;
  if (!client || !me) {
    toast('Sign in to send a message.');
    return;
  }
  const { error } = await client.from('messages').insert({
    listing_id: state.chatListingId,
    buyer_id: state.chatBuyerId || me,
    sender_id: me,
    body
  });
  if (error) {
    toast('Message not sent: ' + error.message);
    return;
  }
  input.value = '';
  await renderThread();
}

export function bindChatUI() {
  document.getElementById('messagesBtn')?.addEventListener('click', async () => {
    if (!state.session?.user) {
      window.marketHubAuth?.open();
      toast('Sign in to see your chats.');
      return;
    }
    const client = getClient();
    const { data, error } = await client
      .from('messages')
      .select('listing_id,buyer_id,body,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    document.getElementById('chatTitle').textContent = 'Your chats';
    document.getElementById('chatSub').textContent = 'Tap a chat to continue';
    const box = document.getElementById('chatMessages');
    if (error) {
      box.innerHTML = '<p style="color:#c62828">Chats could not load. Run the messages SQL in Supabase.</p>';
    } else {
      const seen = new Set();
      const threads = [];
      for (const row of data || []) {
        const key = `${row.listing_id}:${row.buyer_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        threads.push(row);
      }
      box.innerHTML = threads.length
        ? threads.map(t => `<button class="ghost" data-open-thread="${t.listing_id}" data-buyer="${t.buyer_id}" style="width:100%;text-align:left;margin:6px 0"><b>Listing chat</b><br><span style="color:#66736b">${escapeHtml(t.body)}</span></button>`).join('')
        : '<p style="color:#66736b">No chats yet. Open a listing and tap Chat.</p>';
    }
    document.getElementById('chatModal').classList.add('show');
  });
  document.getElementById('chatForm')?.addEventListener('submit', e => {
    e.preventDefault();
    sendChat();
  });
  document.getElementById('chatMessages')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-open-thread]');
    if (!btn) return;
    state.chatBuyerId = btn.dataset.buyer;
    openChatForItem(btn.dataset.openThread);
  });
  window.openChatForItem = openChatForItem;
}
