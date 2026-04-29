// ===== MANTHY API CLIENT =====
// Vercel rewrites /api/* to Railway backend. Works on both Vercel and Railway.
const API_BASE = window.location.origin + '/api';

// Session token — set after login, sent with all write requests
let _sessionToken = sessionStorage.getItem('manthy_session') || '';
function setSessionToken(token) {
  _sessionToken = token || '';
  if (token) sessionStorage.setItem('manthy_session', token);
  else sessionStorage.removeItem('manthy_session');
}

// Fetch with timeout + auto-attach session token for all requests
function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  // Auto-attach session token to all requests if available
  if (_sessionToken) {
    options.headers = { ...options.headers, 'X-Session-Token': _sessionToken };
  }
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

const MantyAPI = {
  // Auth
  async login(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/auth/login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet })
    });
    const data = await r.json();
    // Save session token from login response
    if (data.sessionToken) setSessionToken(data.sessionToken);
    return data;
  },

  async getMe(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/auth/me?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  // Stake
  async stake(wallet, tokenId, name, imageUrl) {
    const r = await fetchWithTimeout(API_BASE + '/stake', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId, name, imageUrl })
    });
    return r.json();
  },

  async unstake(wallet, tokenId) {
    const r = await fetchWithTimeout(API_BASE + '/stake/unstake', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId })
    });
    return r.json();
  },

  async getMyStaked(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/stake/my?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  async getAllStaked(limit = 20, offset = 0) {
    const r = await fetchWithTimeout(API_BASE + `/stake/all?limit=${limit}&offset=${offset}`);
    return r.json();
  },

  // Feed
  async feed(wallet, tokenId) {
    const r = await fetchWithTimeout(API_BASE + '/feed', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId })
    });
    return r.json();
  },

  async feedAll(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/feed/all', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet })
    });
    return r.json();
  },

  // Catch
  async catchNft(wallet, tokenId) {
    const r = await fetchWithTimeout(API_BASE + '/catch', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId })
    });
    return r.json();
  },

  // Claim
  async claim(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/claim', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet })
    });
    return r.json();
  },

  // Leaderboard
  async getLeaderboard(sort = 'hp', limit = 20, offset = 0) {
    const r = await fetchWithTimeout(API_BASE + `/leaderboard?sort=${sort}&limit=${limit}&offset=${offset}`);
    return r.json();
  },

  async getUserLeaderboard(limit = 20) {
    const r = await fetchWithTimeout(API_BASE + `/leaderboard/users?limit=${limit}`);
    return r.json();
  },

  async getStats() {
    const r = await fetchWithTimeout(API_BASE + '/leaderboard/stats');
    return r.json();
  },

  // Museum
  async getMuseum(limit = 20, offset = 0) {
    const r = await fetchWithTimeout(API_BASE + `/museum?limit=${limit}&offset=${offset}`);
    return r.json();
  },

  // Wallet NFTs (proxied through backend to avoid CORS)
  async getWalletNFTs(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/auth/nfts?wallet=' + encodeURIComponent(wallet), {}, 30000);
    return r.json();
  },

  // Heatmap data
  async getHeatmap(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/auth/heatmap?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  // Recent catches (for ticker)
  async getRecentCatches(limit = 10) {
    const r = await fetchWithTimeout(API_BASE + '/leaderboard/catches?limit=' + limit);
    return r.json();
  },

  // Catch stats per day (for garden chart)
  async getCatchStats() {
    const r = await fetchWithTimeout(API_BASE + '/leaderboard/catch-stats');
    return r.json();
  },

  // Winners
  async getWinners() {
    const r = await fetchWithTimeout(API_BASE + '/leaderboard/winners');
    return r.json();
  },

  async getMyWinners(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/winners/my?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  async claimPrize(wallet, tokenId, claimWallet, claimAddress, discord, twitter) {
    const r = await fetchWithTimeout(API_BASE + '/winners/claim', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId, claimWallet, claimAddress, discord, twitter })
    });
    return r.json();
  },

  // Get public config (collection addresses)
  async getConfig() {
    const r = await fetchWithTimeout(API_BASE + '/leaderboard/config');
    return r.json();
  },

  // Profile
  async getProfile(wallet) {
    const r = await fetchWithTimeout(API_BASE + '/auth/profile?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  async updateAvatar(wallet, avatar) {
    const r = await fetchWithTimeout(API_BASE + '/auth/avatar', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, avatar })
    });
    return r.json();
  },

  async updateName(wallet, name) {
    const r = await fetchWithTimeout(API_BASE + '/auth/name', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, name })
    });
    return r.json();
  }
};
