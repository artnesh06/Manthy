// ===== MANTHY API CLIENT =====
// Vercel rewrites /api/* to Railway backend. Works on both Vercel and Railway.
const API_BASE = window.location.origin + '/api';

const MantyAPI = {
  // Auth
  async login(wallet) {
    const r = await fetch(API_BASE + '/auth/login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet })
    });
    return r.json();
  },

  async getMe(wallet) {
    const r = await fetch(API_BASE + '/auth/me?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  // Stake
  async stake(wallet, tokenId, name, imageUrl) {
    const r = await fetch(API_BASE + '/stake', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId, name, imageUrl })
    });
    return r.json();
  },

  async unstake(wallet, tokenId) {
    const r = await fetch(API_BASE + '/stake/unstake', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId })
    });
    return r.json();
  },

  async getMyStaked(wallet) {
    const r = await fetch(API_BASE + '/stake/my?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  async getAllStaked(limit = 20, offset = 0) {
    const r = await fetch(API_BASE + `/stake/all?limit=${limit}&offset=${offset}`);
    return r.json();
  },

  // Feed
  async feed(wallet, tokenId) {
    const r = await fetch(API_BASE + '/feed', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId })
    });
    return r.json();
  },

  async feedAll(wallet) {
    const r = await fetch(API_BASE + '/feed/all', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet })
    });
    return r.json();
  },

  // Catch
  async catchNft(wallet, tokenId) {
    const r = await fetch(API_BASE + '/catch', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet, tokenId })
    });
    return r.json();
  },

  // Claim
  async claim(wallet) {
    const r = await fetch(API_BASE + '/claim', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ wallet })
    });
    return r.json();
  },

  // Leaderboard
  async getLeaderboard(sort = 'hp', limit = 20, offset = 0) {
    const r = await fetch(API_BASE + `/leaderboard?sort=${sort}&limit=${limit}&offset=${offset}`);
    return r.json();
  },

  async getUserLeaderboard(limit = 20) {
    const r = await fetch(API_BASE + `/leaderboard/users?limit=${limit}`);
    return r.json();
  },

  async getStats() {
    const r = await fetch(API_BASE + '/leaderboard/stats');
    return r.json();
  },

  // Museum
  async getMuseum(limit = 20, offset = 0) {
    const r = await fetch(API_BASE + `/museum?limit=${limit}&offset=${offset}`);
    return r.json();
  },

  // Wallet NFTs (proxied through backend to avoid CORS)
  async getWalletNFTs(wallet) {
    const r = await fetch(API_BASE + '/auth/nfts?wallet=' + encodeURIComponent(wallet));
    return r.json();
  },

  // Heatmap data
  async getHeatmap(wallet) {
    const r = await fetch(API_BASE + '/auth/heatmap?wallet=' + encodeURIComponent(wallet));
    return r.json();
  }
};
