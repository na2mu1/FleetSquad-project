import { useState, useEffect } from 'react';
import { api } from './api';

// NOTE: kept the name `useWallet` (and the same returned shape) so every
// page that already calls wallet.isConnected / wallet.token / wallet.address
// / wallet.disconnect keeps working unchanged — internally it's now backed
// by email+password / Google sign-in instead of a crypto wallet.
export function useWallet() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = typeof window !== 'undefined' ? window.localStorage.getItem('egm_token') : null;
    const u = typeof window !== 'undefined' ? window.localStorage.getItem('egm_user') : null;
    if (t) {
      setToken(t);
      if (u) { try { setUser(JSON.parse(u)); } catch {} }
    }
  }, []);

  async function signup(email, password, displayName) {
    setConnecting(true); setError(null);
    try {
      const result = await api.signup(email, password, displayName);
      _save(result);
    } catch (e) { setError(e.message); throw e; }
    finally { setConnecting(false); }
  }

  async function login(email, password) {
    setConnecting(true); setError(null);
    try {
      const result = await api.login(email, password);
      _save(result);
    } catch (e) { setError(e.message); throw e; }
    finally { setConnecting(false); }
  }

  async function loginWithGoogle(credential) {
    setConnecting(true); setError(null);
    try {
      const result = await api.loginWithGoogle(credential);
      _save(result);
    } catch (e) { setError(e.message); throw e; }
    finally { setConnecting(false); }
  }

  function _save(result) {
    window.localStorage.setItem('egm_token', result.token);
    window.localStorage.setItem('egm_user', JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
  }

  function disconnect() {
    window.localStorage.removeItem('egm_token');
    window.localStorage.removeItem('egm_user');
    setToken(null); setUser(null);
  }

  return {
    token,
    user,
    address: user?.display_name || user?.email || null, // kept for backward-compat display
    email: user?.email || null,
    avatarUrl: user?.avatar_url || null,
    connecting,
    error,
    isConnected: Boolean(token),
    signup,
    login,
    loginWithGoogle,
    disconnect,
  };
}
