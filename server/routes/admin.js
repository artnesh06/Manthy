const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');

router.get('/users', (req, res) => {
  res.json({ users: all('SELECT * FROM users ORDER BY last_seen DESC') });
});

router.post('/add-mthy', (req, res) => {
  const { wallet, amount } = req.body;
  if (!wallet || !amount) return res.status(400).json({ error: 'wallet and amount required' });
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (!user) {
    run('INSERT INTO users (wallet, mthy_balance) VALUES (?, ?)', [wallet, amount]);
  } else {
    run('UPDATE users SET mthy_balance = mthy_balance + ? WHERE wallet = ?', [amount, wallet]);
  }
  res.json({ success: true, message: `Added ${amount} $MTHY` });
});

router.post('/force-catch', (req, res) => {
  const { tokenId } = req.body;
  if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
  const nft = get('SELECT * FROM staked_nfts WHERE token_id = ?', [tokenId]);
  if (!nft) return res.status(404).json({ error: 'Not found' });
  run('INSERT INTO museum (token_id, collection_addr, name, image_url, original_owner, caught_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nft.token_id, nft.collection_addr, nft.name, nft.image_url, nft.wallet, 'ADMIN', 'Force caught']);
  run('DELETE FROM staked_nfts WHERE token_id = ? AND collection_addr = ?', [nft.token_id, nft.collection_addr]);
  res.json({ success: true, message: `Caught ${nft.name}` });
});

router.post('/reset', (req, res) => {
  const { confirm } = req.body;
  if (confirm !== 'RESET_GAME') return res.status(400).json({ error: 'Send confirm: "RESET_GAME"' });
  run('DELETE FROM staked_nfts');
  run('DELETE FROM museum');
  run('DELETE FROM feed_history');
  run('DELETE FROM users');
  res.json({ success: true, message: 'Game reset' });
});

module.exports = router;
