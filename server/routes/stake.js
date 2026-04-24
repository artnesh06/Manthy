const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const COLLECTION_ADDR = 'stars1sxcf8dghtq9qprulmfy4f898d0rn0xzmhle83rqmtpm00j0smhes93wsys';

router.post('/', (req, res) => {
  const { wallet, tokenId, name, imageUrl } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });
  if (!get('SELECT * FROM users WHERE wallet = ?', [wallet])) return res.status(404).json({ error: 'Login first' });
  if (get('SELECT * FROM staked_nfts WHERE token_id = ? AND collection_addr = ?', [tokenId, COLLECTION_ADDR])) return res.status(400).json({ error: 'Already staked' });
  if (get('SELECT * FROM museum WHERE token_id = ? AND collection_addr = ?', [tokenId, COLLECTION_ADDR])) return res.status(400).json({ error: 'In museum' });

  run('INSERT INTO staked_nfts (wallet, token_id, collection_addr, name, image_url) VALUES (?, ?, ?, ?, ?)', [wallet, tokenId, COLLECTION_ADDR, name||'', imageUrl||'']);
  res.json({ success: true, message: `${name||tokenId} staked!` });
});

router.post('/unstake', (req, res) => {
  const { wallet, tokenId } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });
  if (!get('SELECT * FROM staked_nfts WHERE wallet = ? AND token_id = ? AND collection_addr = ?', [wallet, tokenId, COLLECTION_ADDR])) return res.status(404).json({ error: 'Not staked by you' });
  run('DELETE FROM staked_nfts WHERE wallet = ? AND token_id = ? AND collection_addr = ?', [wallet, tokenId, COLLECTION_ADDR]);
  res.json({ success: true, message: 'Unstaked' });
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
