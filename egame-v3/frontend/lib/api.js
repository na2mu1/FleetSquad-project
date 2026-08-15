const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function authHeaders() {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('egm_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const mediaUrl = (p) => `${API_BASE}/uploads/${(p||'').split('/').pop()}`;

export const api = {
  // ── Auth ────────────────────────────────────────────────────────────────
  getChallenge: () => fetch(`${API_BASE}/api/auth/challenge`).then(handle),
  walletConnect: (walletAddress, displayName, message, signature) =>
    fetch(`${API_BASE}/api/auth/wallet-connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, displayName, message, signature }),
    }).then(handle),
  signup: (email, password, displayName) =>
    fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    }).then(handle),
  login: (email, password) =>
    fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handle),
  loginWithGoogle: (credential) =>
    fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    }).then(handle),

  // ── Leaderboard ────────────────────────────────────────────────────────
  getLeaderboard: () => fetch(`${API_BASE}/api/leaderboard`).then(handle),

  // ── Wallet balance ───────────────────────────────────────────────────────
  getBalance: () => fetch(`${API_BASE}/api/payment/balance`, { headers: authHeaders() }).then(handle),

  // ── Manual Deposit (bKash/Nagad/Rocket) ─────────────────────────────────
  getRandomAccount: (provider) => fetch(`${API_BASE}/api/payment/random-account/${provider}`).then(handle),
  submitDeposit: (formData) =>
    fetch(`${API_BASE}/api/payment/deposit`, { method: 'POST', headers: authHeaders(), body: formData }).then(handle),
  getMyDeposits: () => fetch(`${API_BASE}/api/payment/my-deposits`, { headers: authHeaders() }).then(handle),

  // ── Withdraw ─────────────────────────────────────────────────────────────
  submitWithdraw: (payload) =>
    fetch(`${API_BASE}/api/payment/withdraw`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  getMyWithdrawals: () => fetch(`${API_BASE}/api/payment/my-withdrawals`, { headers: authHeaders() }).then(handle),

  // ── Tournament V2 (anyone can create) ────────────────────────────────────
  listTournaments: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v))).toString();
    return fetch(`${API_BASE}/api/t2?${qs}`).then(handle);
  },
  getTournament: (id) => fetch(`${API_BASE}/api/t2/${id}`).then(handle),
  createTournament: (payload) =>
    fetch(`${API_BASE}/api/t2`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  editTournament: (id, payload) =>
    fetch(`${API_BASE}/api/t2/${id}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  joinTournament: (id, payload) =>
    fetch(`${API_BASE}/api/t2/${id}/join`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  leaveTournament: (id) =>
    fetch(`${API_BASE}/api/t2/${id}/leave`, { method: 'DELETE', headers: authHeaders() }).then(handle),
  startTournament: (id) =>
    fetch(`${API_BASE}/api/t2/${id}/start`, { method: 'POST', headers: authHeaders() }).then(handle),
  declareResult: (id, matchId, payload) =>
    fetch(`${API_BASE}/api/t2/${id}/match/${matchId}/result`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  cancelTournament: (id) =>
    fetch(`${API_BASE}/api/t2/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle),
  myCreatedTournaments: () =>
    fetch(`${API_BASE}/api/t2/my/created`, { headers: authHeaders() }).then(handle),
  myJoinedTournaments: () =>
    fetch(`${API_BASE}/api/t2/my/joined`, { headers: authHeaders() }).then(handle),

  // ── Admin: payment accounts ───────────────────────────────────────────────
  adminGetAccounts: () => fetch(`${API_BASE}/api/payment/accounts`, { headers: authHeaders() }).then(handle),
  adminAddAccount: (payload) =>
    fetch(`${API_BASE}/api/payment/accounts`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  adminToggleAccount: (id, isActive) =>
    fetch(`${API_BASE}/api/payment/accounts/${id}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    }).then(handle),
  adminDeleteAccount: (id) =>
    fetch(`${API_BASE}/api/payment/accounts/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle),

  // ── Admin: deposits ───────────────────────────────────────────────────────
  adminPendingDeposits: () =>
    fetch(`${API_BASE}/api/payment/deposits/pending`, { headers: authHeaders() }).then(handle),
  adminAllDeposits: (status='') =>
    fetch(`${API_BASE}/api/payment/deposits/all${status?`?status=${status}`:''}`, { headers: authHeaders() }).then(handle),
  adminApproveDeposit: (id, note='') =>
    fetch(`${API_BASE}/api/payment/deposits/${id}/approve`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }).then(handle),
  adminRejectDeposit: (id, note='') =>
    fetch(`${API_BASE}/api/payment/deposits/${id}/reject`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }).then(handle),

  // ── Admin: withdrawals ────────────────────────────────────────────────────
  adminPendingWithdrawals: () =>
    fetch(`${API_BASE}/api/payment/withdrawals/pending`, { headers: authHeaders() }).then(handle),
  adminAllWithdrawals: (status='') =>
    fetch(`${API_BASE}/api/payment/withdrawals/all${status?`?status=${status}`:''}`, { headers: authHeaders() }).then(handle),
  adminApproveWithdrawal: (id, trxId, note='') =>
    fetch(`${API_BASE}/api/payment/withdrawals/${id}/approve`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ trxId, note }),
    }).then(handle),
  adminRejectWithdrawal: (id, note='') =>
    fetch(`${API_BASE}/api/payment/withdrawals/${id}/reject`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }).then(handle),

  // ── Admin: disputes & fraud ───────────────────────────────────────────────
  adminDisputes: () => fetch(`${API_BASE}/api/admin/disputes`, { headers: authHeaders() }).then(handle),
  adminResolveDispute: (id, resolution, note) =>
    fetch(`${API_BASE}/api/admin/disputes/${id}/resolve`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution, note }),
    }).then(handle),
  adminFraudLogs: () => fetch(`${API_BASE}/api/admin/fraud-logs`, { headers: authHeaders() }).then(handle),

  // ── Marketplace listings ──────────────────────────────────────────────────
  getListings: (filters = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v])=>v))).toString();
    return fetch(`${API_BASE}/api/listings?${qs}`).then(handle);
  },
  getListing: (id) => fetch(`${API_BASE}/api/listings/${id}`).then(handle),
  getInventory: (accountId) => fetch(`${API_BASE}/api/accounts/${accountId}/inventory`).then(handle),
  submitAccount: (fd) =>
    fetch(`${API_BASE}/api/accounts`, { method: 'POST', headers: authHeaders(), body: fd }).then(handle),
  analyzeAccount: (id) =>
    fetch(`${API_BASE}/api/accounts/${id}/analyze`, { method: 'POST', headers: authHeaders() }).then(handle),
  createListing: (payload) =>
    fetch(`${API_BASE}/api/listings`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handle),
  myListings: () =>
    fetch(`${API_BASE}/api/listings/mine/all`, { headers: authHeaders() }).then(handle),
  uploadInventoryProof: (accountId, fd) =>
    fetch(`${API_BASE}/api/accounts/${accountId}/inventory/proof`, { method: 'POST', headers: authHeaders(), body: fd }).then(handle),

  // ── Escrow ────────────────────────────────────────────────────────────────
  createInvoice: (listingId) =>
    fetch(`${API_BASE}/api/payments/invoice`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId }),
    }).then(handle),
  fundEscrow: (escrowId, txHash) =>
    fetch(`${API_BASE}/api/escrow`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: escrowId, chainTxHash: txHash }),
    }).then(handle),
  myEscrows: () => fetch(`${API_BASE}/api/escrow/mine`, { headers: authHeaders() }).then(handle),
  confirmEscrow: (id) =>
    fetch(`${API_BASE}/api/escrow/${id}/confirm`, { method: 'POST', headers: authHeaders() }).then(handle),
  releaseEscrow: (id) =>
    fetch(`${API_BASE}/api/escrow/${id}/release`, { method: 'POST', headers: authHeaders() }).then(handle),
  markTransferComplete: (id) =>
    fetch(`${API_BASE}/api/escrow/${id}/transfer-complete`, { method: 'POST', headers: authHeaders() }).then(handle),
  disputeEscrow: (id, fd) =>
    fetch(`${API_BASE}/api/escrow/${id}/dispute`, { method: 'POST', headers: authHeaders(), body: fd }).then(handle),
  repriceListing: (id, askingPrice) =>
    fetch(`${API_BASE}/api/listings/${id}/price`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ askingPrice }),
    }).then(handle),
  cancelListing: (id) =>
    fetch(`${API_BASE}/api/listings/${id}/cancel`, { method: 'POST', headers: authHeaders() }).then(handle),
};
