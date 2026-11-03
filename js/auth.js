import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';

let supabaseClient = null;
let authMode = 'signin';
let onSessionChange = () => {};

export function getClient() {
  return supabaseClient;
}

export function setOnSessionChange(fn) {
  onSessionChange = fn;
}

export function initAuth() {
  if (!window.supabase?.createClient) {
    const btn = document.getElementById('accountBtn');
    if (btn) btn.title = 'Supabase client could not load';
    return null;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const accountBtn = document.getElementById('accountBtn');
  const authModal = document.getElementById('authModal');
  const authForm = document.getElementById('authForm');
  const authTitle = document.getElementById('authTitle');
  const authIntro = document.getElementById('authIntro');
  const authNameWrap = document.getElementById('authNameWrap');
  const authName = document.getElementById('authName');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authMessage = document.getElementById('authMessage');
  const authSubmit = document.getElementById('authSubmit');
  const authSwitch = document.getElementById('authSwitch');
  const authSwitchText = document.getElementById('authSwitchText');
  const authSignedIn = document.getElementById('authSignedIn');
  const authUserLabel = document.getElementById('authUserLabel');
  const authSignOut = document.getElementById('authSignOut');

  function authNotice(message, kind) {
    authMessage.textContent = message || '';
    authMessage.style.color = kind === 'error' ? '#b42318' : kind === 'success' ? '#176b45' : '#66736b';
  }

  function setAuthMode(mode) {
    authMode = mode;
    const signedIn = !!state.session;
    authForm.style.display = signedIn ? 'none' : 'block';
    authSignedIn.style.display = signedIn ? 'block' : 'none';
    authNameWrap.style.display = (!signedIn && mode === 'signup') ? 'flex' : 'none';
    authTitle.textContent = signedIn ? 'Your MarketHub account' : (mode === 'signup' ? 'Create your account' : 'Log in');
    authIntro.textContent = signedIn
      ? 'You are signed in to MarketHub Zambia.'
      : (mode === 'signup' ? 'Create an account with your email address.' : 'Log in with your email and password.');
    authSubmit.textContent = mode === 'signup' ? 'Create account' : 'Log in';
    authSwitchText.textContent = mode === 'signup' ? 'Already have an account?' : 'New to MarketHub?';
    authSwitch.textContent = mode === 'signup' ? 'Log in' : 'Create account';
    authSwitch.style.display = signedIn ? 'none' : 'inline-flex';
    authNotice('');
  }

  function renderAuthState(session) {
    state.session = session;
    if (session?.user) {
      const user = session.user;
      const display = user.user_metadata?.full_name || user.email;
      accountBtn.textContent = '👤 ' + (display && display.length > 16 ? display.slice(0, 13) + '…' : display || 'My account');
      const profileBtn = document.getElementById('profileBtn');
      if (profileBtn) profileBtn.textContent = '👤 Profile';
      const loginBtn = document.getElementById('profileLogin');
      const outBtn = document.getElementById('profileSignOut');
      if (loginBtn) loginBtn.style.display = 'none';
      if (outBtn) outBtn.style.display = 'block';
      authUserLabel.textContent = 'Signed in as ' + (user.email || 'your account');
      authNotice('Your account is connected.', 'success');
      setAuthMode(authMode);
    } else {
      accountBtn.textContent = '👤 Log in';
      const profileBtn = document.getElementById('profileBtn');
      if (profileBtn) profileBtn.textContent = '👤 Profile';
      const loginBtn = document.getElementById('profileLogin');
      const outBtn = document.getElementById('profileSignOut');
      if (loginBtn) loginBtn.style.display = 'block';
      if (outBtn) outBtn.style.display = 'none';
      setAuthMode(authMode);
    }
    onSessionChange(session);
  }

  function openAuth() {
    authNotice('');
    authModal.classList.add('show');
    if (state.session) renderAuthState(state.session);
    else setAuthMode(authMode);
  }

  accountBtn.addEventListener('click', openAuth);
  authSwitch.addEventListener('click', () => setAuthMode(authMode === 'signup' ? 'signin' : 'signup'));

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) {
      authNotice('Connection library did not load. Check your internet connection and reload.', 'error');
      return;
    }
    const email = authEmail.value.trim();
    const password = authPassword.value;
    authSubmit.disabled = true;
    authSubmit.textContent = authMode === 'signup' ? 'Creating account…' : 'Logging in…';
    authNotice('');
    try {
      if (authMode === 'signup') {
        const fullName = authName.value.trim();
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        if (data.session) {
          renderAuthState(data.session);
          authNotice('Account created and signed in successfully.', 'success');
        } else {
          setAuthMode('signin');
          authNotice('Account created. Check your email and click the confirmation link before signing in.', 'success');
        }
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        renderAuthState(data.session);
        authNotice('You are signed in successfully.', 'success');
      }
    } catch (error) {
      authNotice(error?.message || 'We could not complete that request. Please try again.', 'error');
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = authMode === 'signup' ? 'Create account' : 'Log in';
    }
  });

  authSignOut.addEventListener('click', async () => {
    if (!supabaseClient) return;
    authSignOut.disabled = true;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      authNotice('You have signed out.', 'success');
    } catch (error) {
      authNotice(error.message || 'Sign out failed.', 'error');
    } finally {
      authSignOut.disabled = false;
    }
  });

  authModal.querySelector('[data-close="authModal"]').addEventListener('click', () => authModal.classList.remove('show'));
  authModal.addEventListener('click', (e) => { if (e.target === authModal) authModal.classList.remove('show'); });

  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.warn('MarketHub auth session check:', error.message);
      return;
    }
    renderAuthState(data.session);
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => renderAuthState(session));

  return {
    client: () => supabaseClient,
    open: openAuth,
    getSession: () => state.session
  };
}

export async function requireSession() {
  if (!supabaseClient) throw new Error('Account service is unavailable. Refresh and try again.');
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (!data?.session?.user) {
    throw new Error('AUTH_REQUIRED');
  }
  return data.session;
}
