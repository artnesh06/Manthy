const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');

const COSMOS_CONTRACT = 'cosmos1ptcdmtejupzy4nj5jx5mld9fvn98psk096mdrn820j7dj3xdmu6sy3vr7a';
const COSMOS_LCD_ENDPOINTS = [
  'https://lcd-cosmoshub.keplr.app',
  'https://cosmos-rest.publicnode.com'
];

// DB-backed wallet NFT cache
function getCachedWalletNFTs(wallet) {
  const row = get("SELECT nfts, cached_at FROM wallet_nft_cache WHERE wallet = ?", [wallet]);
  if (!row) return null;
  // Cache valid for 10 minutes
  const age = Date.now() - new Date(row.cached_at + 'Z').getTime();
  if (age > 600000) return null;
  try { return JSON.parse(row.nfts); } catch(e) { return null; }
}

function setCachedWalletNFTs(wallet, nfts) {
  const json = JSON.stringify(nfts);
  run("INSERT OR REPLACE INTO wallet_nft_cache (wallet, nfts, cached_at) VALUES (?, ?, datetime('now'))", [wallet, json]);
}

// In-memory metadata cache
const metaCache = new Map();

router.post('/login', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'Wallet address required' });
  const existing = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (existing) {
    run("UPDATE users SET last_seen = datetime('now') WHERE wallet = ?", [wallet]);
    return res.json({ user: existing, isNew: false });
  }
  run('INSERT INTO users (wallet, mthy_balance) VALUES (?, ?)', [wallet, 0]);
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  res.json({ user, isNew: true });
});

router.get('/me', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'Wallet required' });
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const staked = all('SELECT * FROM staked_nfts WHERE wallet = ?', [wallet]);
  res.json({ user, staked, earnRate: staked.length * 80 });
});

router.get('/nfts', async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });

  // Check DB cache first — instant response
  const cached = getCachedWalletNFTs(wallet);
  if (cached) {
    return res.json({ nfts: cached, total: cached.length, cached: true });
  }

  // Fetch from Cosmos Hub
  const query = Buffer.from(JSON.stringify({tokens:{owner:wallet,limit:30}})).toString('base64');
  
  for (const endpoint of COSMOS_LCD_ENDPOINTS) {
    try {
      const resp = await fetch(`${endpoint}/cosmwasm/wasm/v1/contract/${COSMOS_CONTRACT}/smart/${query}`, {
        signal: AbortSignal.timeout(5000) // 5s timeout
      });
      if (resp.ok) {
        const data = await resp.json();
        const tokenIds = data?.data?.tokens || [];
        
        // Fetch metadata in parallel
        const nfts = await Promise.all(tokenIds.map(async (tokenId) => {
          const mc = metaCache.get(tokenId);
          if (mc) return { tokenId, name: mc.name, imageUrl: mc.imageUrl };
          try {
            const gql = await fetch('https://graphql.mainnet.stargaze-apis.com/graphql', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({query:`{ token(collectionAddr:"stars1sxcf8dghtq9qprulmfy4f898d0rn0xzmhle83rqmtpm00j0smhes93wsys", tokenId:"${tokenId}") { name imageUrl } }`}),
              signal: AbortSignal.timeout(4000)
            });
            const gqlData = await gql.json();
            const meta = gqlData?.data?.token;
            const r = { tokenId, name: meta?.name || `Seals #${tokenId}`, imageUrl: meta?.imageUrl || '' };
            metaCache.set(tokenId, r);
            return r;
          } catch(e) {
            return { tokenId, name: `Seals #${tokenId}`, imageUrl: '' };
          }
        }));

        // Save to DB cache
        setCachedWalletNFTs(wallet, nfts);
        return res.json({ nfts, total: nfts.length });
      }
    } catch(e) {
      continue;
    }
  }
  res.json({ nfts: [], total: 0, error: 'Could not fetch from Cosmos Hub' });
});

module.exports = router;
