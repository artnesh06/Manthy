const express = require('express');
const router = express.Router();
const { run, get, all, getConfig } = require('../db');
const COLLECTION_ADDR = 'stars1sxcf8dghtq9qprulmfy4f898d0rn0xzmhle83rqmtpm00j0smhes93wsys';

// Bech32 decode/encode for cosmos1 <-> stars1 conversion
function bech32Decode(addr) {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const sep = addr.lastIndexOf('1');
  const data = [];
  for (let i = sep + 1; i < addr.length; i++) {
    const v = CHARSET.indexOf(addr[i]);
    if (v === -1) return null;
    data.push(v);
  }
  // Remove checksum (last 6)
  const conv = data.slice(0, -6);
  // Convert 5-bit to 8-bit
  let acc = 0, bits = 0;
  const bytes = [];
  for (const v of conv) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
  }
  return bytes;
}

function bech32Encode(prefix, bytes) {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  // Convert 8-bit to 5-bit
  let acc = 0, bits = 0;
  const data = [];
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; data.push((acc >> bits) & 0x1f); }
  }
  if (bits > 0) data.push((acc << (5 - bits)) & 0x1f);
  // Checksum
  function polymod(values) {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
    }
    return chk;
  }
  const hrpExpand = [];
  for (const c of prefix) hrpExpand.push(c.charCodeAt(0) >> 5);
  hrpExpand.push(0);
  for (const c of prefix) hrpExpand.push(c.charCodeAt(0) & 31);
  const values = [...hrpExpand, ...data, 0, 0, 0, 0, 0, 0];
  const pm = polymod(values) ^ 1;
  const checksum = [];
  for (let i = 0; i < 6; i++) checksum.push((pm >> (5 * (5 - i))) & 31);
  return prefix + '1' + [...data, ...checksum].map(d => CHARSET[d]).join('');
}

function cosmosToStars(cosmosAddr) {
  if (!cosmosAddr || cosmosAddr.startsWith('stars1')) return cosmosAddr;
  if (!cosmosAddr.startsWith('cosmos1')) return cosmosAddr;
  const bytes = bech32Decode(cosmosAddr);
  if (!bytes) return cosmosAddr;
  return bech32Encode('stars', bytes);
}

const COSMOS_REST = 'https://rest.cosmos.directory/cosmoshub';
const COSMOS_CONTRACT = 'cosmos1ptcdmtejupzy4nj5jx5mld9fvn98psk096mdrn820j7dj3xdmu6sy3vr7a';

// Verify NFT ownership via Cosmos Hub REST API (primary) + Stargaze GraphQL (fallback)
async function verifyOwnership(wallet, tokenId) {
  // Method 1: Cosmos Hub REST API (most accurate post-migration)
  try {
    const query = Buffer.from(JSON.stringify({owner_of:{token_id:tokenId}})).toString('base64');
    const resp = await fetch(`${COSMOS_REST}/cosmwasm/wasm/v1/contract/${COSMOS_CONTRACT}/smart/${query}`);
    if (resp.ok) {
      const data = await resp.json();
      const owner = data?.data?.owner;
      if (owner === wallet) return { verified: true };
      if (owner) return { verified: false, reason: `NFT owned by ${owner.slice(0,12)}..., not you` };
    }
  } catch(e) {
    console.warn('[STAKE] Cosmos Hub check failed:', e.message);
  }

  // Method 2: Stargaze GraphQL fallback
  try {
    const starsAddr = cosmosToStars(wallet);
    const query = `{ token(collectionAddr:"${COLLECTION_ADDR}", tokenId:"${tokenId}") { owner { address } } }`;
    const resp = await fetch('https://graphql.mainnet.stargaze-apis.com/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await resp.json();
    const owner = data?.data?.token?.owner?.address;
    if (!owner) return { verified: false, reason: 'Token not found' };
    if (owner === starsAddr || owner === wallet) return { verified: true };
    return { verified: false, reason: `NFT owned by ${owner.slice(0,12)}..., not you` };
  } catch (e) {
    console.warn('[STAKE] All ownership checks failed, allowing:', e.message);
    return { verified: true, warning: 'Ownership check unavailable' };
  }
}

router.post('/', async (req, res) => {
  const { wallet, tokenId, name, imageUrl } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });
  if (getConfig('game_ended', 0) === 1) return res.status(400).json({ error: 'Game has ended. No more staking allowed.' });
  if (!get('SELECT * FROM users WHERE wallet = ?', [wallet])) return res.status(404).json({ error: 'Login first' });
  if (get('SELECT * FROM staked_nfts WHERE token_id = ? AND collection_addr = ?', [tokenId, COLLECTION_ADDR])) return res.status(400).json({ error: 'Already staked' });
  if (get('SELECT * FROM museum WHERE token_id = ? AND collection_addr = ?', [tokenId, COLLECTION_ADDR])) return res.status(400).json({ error: 'In museum' });

  // Fast path: check DB cache first (user already fetched NFTs via /nfts endpoint)
  const cached = get("SELECT nfts FROM wallet_nft_cache WHERE wallet = ?", [wallet]);
  let skipVerify = false;
  if (cached) {
    try {
      const nfts = JSON.parse(cached.nfts);
      if (nfts.some(n => n.tokenId === tokenId)) skipVerify = true;
    } catch(e) {}
  }

  if (!skipVerify) {
    const ownership = await verifyOwnership(wallet, tokenId);
    if (!ownership.verified) {
      return res.status(403).json({ error: ownership.reason || 'Not your NFT' });
    }
  }

  run('INSERT INTO staked_nfts (wallet, token_id, collection_addr, name, image_url) VALUES (?, ?, ?, ?, ?)', [wallet, tokenId, COLLECTION_ADDR, name||'', imageUrl||'']);
  // Clear wallet cache since NFT moved
  run("DELETE FROM wallet_nft_cache WHERE wallet = ?", [wallet]);
  res.json({ success: true, message: `${name||tokenId} staked!` });
});

router.post('/unstake', (req, res) => {
  const { wallet, tokenId } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });
  const nft = get('SELECT * FROM staked_nfts WHERE wallet = ? AND token_id = ? AND collection_addr = ?', [wallet, tokenId, COLLECTION_ADDR]);
  if (!nft) return res.status(404).json({ error: 'Not staked by you' });
  
  // Auto-claim pending earnings before unstake
  const EARN_PER_DAY = getConfig('earn_rate_per_day', 80);
  const lastEarned = new Date(nft.last_earned + 'Z');
  const diffDays = (Date.now() - lastEarned.getTime()) / 86400000;
  const pending = diffDays * EARN_PER_DAY;
  if (pending > 0) {
    run('UPDATE users SET mthy_balance = mthy_balance + ? WHERE wallet = ?', [pending, wallet]);
  }
  
  run('DELETE FROM staked_nfts WHERE wallet = ? AND token_id = ? AND collection_addr = ?', [wallet, tokenId, COLLECTION_ADDR]);
  const updated = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  const balance = Math.round((updated?.mthy_balance || 0) * 100) / 100;
  res.json({ success: true, message: 'Unstaked', claimed: Math.round(pending * 100) / 100, balance });
});

router.get('/my', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  res.json({ staked: all('SELECT * FROM staked_nfts WHERE wallet = ?', [wallet]) });
});

router.get('/all', (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const staked = all('SELECT * FROM staked_nfts ORDER BY hp DESC, staked_at ASC LIMIT ? OFFSET ?', [Number(limit), Number(offset)]);
  const total = get('SELECT COUNT(*) as count FROM staked_nfts');
  res.json({ staked, total: total?.count || 0 });
});

module.exports = router;
