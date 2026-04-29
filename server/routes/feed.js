const express = require('express');
const router = express.Router();
const { run, get, all, getConfig, getConfigStr, auditLog } = require('../db');
const walletRateLimit = require('../middleware/walletRateLimit');

router.post('/', walletRateLimit('feed', 3000), (req, res) => {
  const FEED_COST = getConfig('feed_cost', 100);
  const TOKEN_NAME = getConfigStr('token_name', '$MTHY');
  const { wallet, tokenId } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });
  if (getConfig('game_ended', 0) === 1) return res.status(400).json({ error: 'Game has ended' });
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const nft = get('SELECT * FROM staked_nfts WHERE wallet = ? AND token_id = ?', [wallet, tokenId]);
  if (!nft) return res.status(404).json({ error: 'Not staked by you' });
  if (nft.hp >= 100) return res.status(400).json({ error: 'Already full HP' });
  if (user.mthy_balance < FEED_COST) return res.status(400).json({ error: `Not enough ${TOKEN_NAME}` });

  run('UPDATE users SET mthy_balance = mthy_balance - ? WHERE wallet = ?', [FEED_COST, wallet]);
  run("UPDATE staked_nfts SET hp = 100, last_fed = datetime('now') WHERE wallet = ? AND token_id = ?", [wallet, tokenId]);
  run('INSERT INTO feed_history (wallet, token_id, cost) VALUES (?, ?, ?)', [wallet, tokenId, FEED_COST]);

  const updated = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  auditLog('feed', { wallet, tokenId, amount: FEED_COST });

  // Broadcast real-time feed event
  const io = req.app.locals.io;
  if (io) io.emit('nft:fed', { tokenId, wallet });

  res.json({ success: true, balance: Math.round((updated.mthy_balance || 0) * 100) / 100 });
});

router.post('/all', walletRateLimit('feed-all', 5000), (req, res) => {
  const FEED_COST = getConfig('feed_cost', 100);
  const TOKEN_NAME = getConfigStr('token_name', '$MTHY');
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'wallet required' });
  if (getConfig('game_ended', 0) === 1) return res.status(400).json({ error: 'Game has ended' });
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const hungry = all('SELECT * FROM staked_nfts WHERE wallet = ? AND hp < 100', [wallet]);
  if (hungry.length === 0) return res.status(400).json({ error: 'All fed' });
  const totalCost = hungry.length * FEED_COST;
  if (user.mthy_balance < totalCost) return res.status(400).json({ error: `Not enough ${TOKEN_NAME}` });

  run('UPDATE users SET mthy_balance = mthy_balance - ? WHERE wallet = ?', [totalCost, wallet]);
  for (const nft of hungry) {
    run("UPDATE staked_nfts SET hp = 100, last_fed = datetime('now') WHERE wallet = ? AND token_id = ?", [wallet, nft.token_id]);
    run('INSERT INTO feed_history (wallet, token_id, cost) VALUES (?, ?, ?)', [wallet, nft.token_id, FEED_COST]);
  }
  const updated = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  auditLog('feed-all', { wallet, amount: totalCost, detail: `Fed ${hungry.length} NFTs` });
  res.json({ success: true, fed: hungry.length, balance: Math.round((updated.mthy_balance || 0) * 100) / 100 });
});

module.exports = router;
