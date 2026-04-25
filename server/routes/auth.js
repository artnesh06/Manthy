const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');

const COSMOS_CONTRACT = 'cosmos1ptcdmtejupzy4nj5jx5mld9fvn98psk096mdrn820j7dj3xdmu6sy3vr7a';
const COSMOS_LCD_ENDPOINTS = [
  'https://lcd-cosmoshub.keplr.app',
  'https://cosmos-rest.publicnode.com',
  'https://rest.cosmos.directory/cosmoshub'
];

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

// Proxy: fetch wallet NFTs from Cosmos Hub (avoids CORS issues in browser)
router.get('/nfts', async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });

  const query = Buffer.from(JSON.stringify({tokens:{owner:wallet,limit:30}})).toString('base64');
  
  for (const endpoint of COSMOS_LCD_ENDPOINTS) {
    try {
      const resp = await fetch(`${endpoint}/cosmwasm/wasm/v1/contract/${COSMOS_CONTRACT}/smart/${query}`);
      if (resp.ok) {
        const data = await resp.json();
        const tokenIds = data?.data?.tokens || [];
        
        // Fetch metadata from Stargaze GraphQL in parallel (faster)
        const nfts = await Promise.all(tokenIds.map(async (tokenId) => {
          try {
            const gql = await fetch('https://graphql.mainnet.stargaze-apis.com/graphql', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({query:`{ token(collectionAddr:"stars1sxcf8dghtq9qprulmfy4f898d0rn0xzmhle83rqmtpm00j0smhes93wsys", tokenId:"${tokenId}") { name imageUrl } }`})
            });
            const gqlData = await gql.json();
            const meta = gqlData?.data?.token;
            return { tokenId, name: meta?.name || `Seals #${tokenId}`, imageUrl: meta?.imageUrl || '' };
          } catch(e) {
            return { tokenId, name: `Seals #${tokenId}`, imageUrl: '' };
          }
        }));
        return res.json({ nfts, total: nfts.length });
      }
    } catch(e) {
      continue;
    }
  }
  res.json({ nfts: [], total: 0, error: 'Could not fetch from Cosmos Hub' });
});

module.exports = router;
