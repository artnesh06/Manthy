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

// Save game config
router.post('/config', (req, res) => {
  const { earn_rate, feed_cost, museum_earn, max_survivors } = req.body;
  if (earn_rate != null) run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('earn_rate_per_day', ?)", [String(earn_rate)]);
  if (feed_cost != null) run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('feed_cost', ?)", [String(feed_cost)]);
  if (museum_earn != null) run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('museum_earn', ?)", [String(museum_earn)]);
  if (max_survivors != null) run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('max_survivors', ?)", [String(max_survivors)]);
  res.json({ success: true, message: 'Config saved' });
});

// Get game config
router.get('/config', (req, res) => {
  const rows = all('SELECT * FROM game_config');
  const config = {};
  for (const r of rows) config[r.key] = r.value;
  res.json({ config });
});

// Feed history
router.get('/feed-history', (req, res) => {
  const { limit = 50 } = req.query;
  const history = all('SELECT * FROM feed_history ORDER BY fed_at DESC LIMIT ?', [Number(limit)]);
  res.json({ history });
});

// Game summary
router.get('/summary', (req, res) => {
  const totalUsers = get('SELECT COUNT(*) as count FROM users')?.count || 0;
  const totalStaked = get('SELECT COUNT(*) as count FROM staked_nfts')?.count || 0;
  const totalMuseum = get('SELECT COUNT(*) as count FROM museum')?.count || 0;
  const totalFeeds = get('SELECT COUNT(*) as count FROM feed_history')?.count || 0;
  const totalMthy = get('SELECT SUM(mthy_balance) as total FROM users')?.total || 0;
  const avgHp = get('SELECT AVG(hp) as avg FROM staked_nfts')?.avg || 0;
  res.json({ totalUsers, totalStaked, totalMuseum, totalFeeds, totalMthy: Math.floor(totalMthy), avgHp: Math.round(avgHp) });
});

module.exports = router;
