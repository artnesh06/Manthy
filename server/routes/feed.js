const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const FEED_COST = 100;

router.post('/', (req, res) => {
  const { wallet, tokenId } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const nft = get('SELECT * FROM staked_nfts WHERE wallet = ? AND token_id = ?', [wallet, tokenId]);
  if (!nft) return res.status(404).json({ error: 'Not staked by you' });
  if (nft.hp >= 100) return res.status(400).json({ error: 'Already full HP' });
  if (user.mthy_balance < FEED_COST) return res.status(400).json({ error: 'Not enough $MTHY' });

  run('UPDATE users SET mthy_balance = mthy_balance - ? WHERE wallet = ?', [FEED_COST, wallet]);
  run("UPDATE staked_nfts SET hp = 100, last_fed = datetime('now') WHERE wallet = ? AND token_id = ?", [wallet, tokenId]);
  run('INSERT INTO feed_history (wallet, token_id, cost) VALUES (?, ?, ?)', [wallet, tokenId, FEED_COST]);

  const updated = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  res.json({ success: true, balance: updated.mthy_balance });
});

router.post('/all', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const hungry = all('SELECT * FROM staked_nfts WHERE wallet = ? AND hp < 100', [wallet]);
  if (hungry.length === 0) return res.status(400).json({ error: 'All fed' });
  const totalCost = hungry.length * FEED_COST;
  if (user.mthy_balance < totalCost) return res.status(400).json({ error: 'Not enough $MTHY' });

  run('UPDATE users SET mthy_balance = mthy_balance - ? WHERE wallet = ?', [totalCost, wallet]);
  for (const nft of hungry) {
    run("UPDATE staked_nfts SET hp = 100, last_fed = datetime('now') WHERE wallet = ? AND token_id = ?", [wallet, nft.token_id]);
    run('INSERT INTO feed_history (wallet, token_id, cost) VALUES (?, ?, ?)', [wallet, nft.token_id, FEED_COST]);
  }
  const updated = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  res.json({ success: true, fed: hungry.length, balance: updated.mthy_balance });
});

module.exports = router;
