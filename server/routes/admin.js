const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { run, get, all, getConfig } = require('../db');

// Decrypt helper (same as winners.js)
const ENC_KEY = process.env.CLAIM_SECRET || 'manthy-claim-secret-change-me-32';
function decrypt(data) {
  if (!data || !data.includes(':')) return data || '';
  try {
    const key = crypto.createHash('sha256').update(ENC_KEY).digest();
    const [ivHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch(e) { return data; }
}

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
  run('INSERT INTO catch_log (token_id, name, caught_by, original_owner) VALUES (?, ?, ?, ?)',
    [nft.token_id, nft.name, 'ADMIN', nft.wallet]);
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
  run('DELETE FROM winners');
  run('DELETE FROM catch_log');
  run('DELETE FROM wallet_nft_cache');
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_ended', '0')");
  res.json({ success: true, message: 'Game reset — all data cleared' });
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
  const gameEnded = getConfig('game_ended', 0);
  const totalWinners = get('SELECT COUNT(*) as count FROM winners')?.count || 0;
  res.json({ totalUsers, totalStaked, totalMuseum, totalFeeds, totalMthy: Math.floor(totalMthy), avgHp: Math.round(avgHp), gameEnded, totalWinners });
});

// End game — declare top 20 NFTs as winners
router.post('/end-game', (req, res) => {
  const { confirm } = req.body;
  if (confirm !== 'END_GAME') return res.status(400).json({ error: 'Send confirm: "END_GAME"' });
  
  const maxSurvivors = getConfig('max_survivors', 20);
  const survivors = all('SELECT * FROM staked_nfts ORDER BY hp DESC, staked_at ASC LIMIT ?', [maxSurvivors]);
  
  if (survivors.length === 0) return res.status(400).json({ error: 'No staked NFTs to declare as winners' });
  
  // Insert winners
  const now = new Date();
  for (const nft of survivors) {
    const daysSurvived = Math.floor((now - new Date(nft.staked_at + 'Z')) / 86400000);
    run('INSERT OR IGNORE INTO winners (token_id, collection_addr, wallet, name, image_url, hp, days_survived) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nft.token_id, nft.collection_addr, nft.wallet, nft.name, nft.image_url, nft.hp, daysSurvived]);
  }
  
  // Mark game as ended
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_ended', '1')");
  
  res.json({ success: true, message: `Game ended! ${survivors.length} winners declared.`, winners: survivors.length });
});

// Get winners (decrypted for admin)
router.get('/winners', (req, res) => {
  const winners = all('SELECT * FROM winners ORDER BY hp DESC, days_survived DESC');
  const decrypted = winners.map(w => ({
    ...w,
    claim_wallet: decrypt(w.claim_wallet),
    claim_address: decrypt(w.claim_address),
    claim_discord: decrypt(w.claim_discord),
    claim_twitter: decrypt(w.claim_twitter)
  }));
  res.json({ winners: decrypted });
});

// Undo end game — revert game_ended flag and clear winners
router.post('/undo-end-game', (req, res) => {
  const { confirm } = req.body;
  if (confirm !== 'UNDO_END_GAME') return res.status(400).json({ error: 'Send confirm: "UNDO_END_GAME"' });
  
  const gameEnded = getConfig('game_ended', 0);
  if (gameEnded !== 1) return res.status(400).json({ error: 'Game is not ended' });
  
  // Check if any prizes have been claimed
  const claimed = get('SELECT COUNT(*) as count FROM winners WHERE claimed_at IS NOT NULL');
  if (claimed && claimed.count > 0) {
    return res.status(400).json({ error: `Cannot undo: ${claimed.count} prize(s) already claimed. Reset winners first.` });
  }
  
  run('DELETE FROM winners');
  run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_ended', '0')");
  
  res.json({ success: true, message: 'Game un-ended. Winners cleared. Game is running again.' });
});

module.exports = router;
