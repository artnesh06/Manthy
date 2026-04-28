const express = require('express');
const router = express.Router();
const { get, all, getConfig, getConfigStr } = require('../db');

// Public config — frontend asks here for current collection addresses
router.get('/config', (req, res) => {
  const cosmos = getConfigStr('collection_cosmos', 'cosmos1ptcdmtejupzy4nj5jx5mld9fvn98psk096mdrn820j7dj3xdmu6sy3vr7a');
  const stars = getConfigStr('collection_stars', 'stars1sxcf8dghtq9qprulmfy4f898d0rn0xzmhle83rqmtpm00j0smhes93wsys');
  const survivors = getConfig('max_survivors', 50);
  res.json({ cosmos, stars, survivors });
});

router.get('/', (req, res) => {
  const { sort = 'hp', limit = 20, offset = 0 } = req.query;
  let orderBy = 'hp DESC, staked_at ASC';
  if (sort === 'score') {
    orderBy = "(hp + CAST((julianday('now') - julianday(staked_at)) AS INTEGER)) DESC, staked_at ASC";
  }
  const nfts = all(`SELECT *, CAST((julianday('now') - julianday(staked_at)) AS INTEGER) as days_alive FROM staked_nfts ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [Number(limit), Number(offset)]);
  const total = get('SELECT COUNT(*) as count FROM staked_nfts');
  const totalUsers = get('SELECT COUNT(DISTINCT wallet) as count FROM staked_nfts');
  res.json({ nfts, total: total?.count || 0, totalUsers: totalUsers?.count || 0 });
});

router.get('/stats', (req, res) => {
  const alive = get('SELECT COUNT(*) as count FROM staked_nfts')?.count || 0;
  const weak = get('SELECT COUNT(*) as count FROM staked_nfts WHERE hp <= 50')?.count || 0;
  const dead = get('SELECT COUNT(*) as count FROM museum')?.count || 0;
  const survivors = getConfig('max_survivors', 50);
  const totalUsers = get('SELECT COUNT(*) as count FROM users')?.count || 0;
  const config = get("SELECT value FROM game_config WHERE key = 'game_start'");
  const gameEnded = getConfig('game_ended', 0);
  res.json({ alive, weak, dead, survivors, totalUsers, gameStart: config?.value, gameEnded });
});

// Recent catches — for ticker notification
router.get('/catches', (req, res) => {
  const { limit = 10, since } = req.query;
  let catches;
  if (since) {
    catches = all("SELECT * FROM catch_log WHERE caught_at > ? ORDER BY caught_at DESC LIMIT ?", [since, Number(limit)]);
  } else {
    catches = all('SELECT * FROM catch_log ORDER BY caught_at DESC LIMIT ?', [Number(limit)]);
  }
  res.json({ catches });
});

// Catch stats per day — for garden chart
router.get('/catch-stats', (req, res) => {
  const days = all("SELECT DATE(caught_at) as day, COUNT(*) as count FROM catch_log GROUP BY DATE(caught_at) ORDER BY day DESC LIMIT 14");
  res.json({ days });
});

// Winners — public endpoint
router.get('/winners', (req, res) => {
  const winners = all('SELECT * FROM winners ORDER BY hp DESC, days_survived DESC');
  const gameEnded = getConfig('game_ended', 0);
  res.json({ winners, gameEnded });
});

// User leaderboard — sorted by $MTHY balance, includes profile data + catches
router.get('/users', (req, res) => {
  const { limit = 20 } = req.query;
  const users = all(`SELECT u.wallet, u.mthy_balance, u.avatar, u.display_name, COUNT(s.id) as nft_count 
    FROM users u LEFT JOIN staked_nfts s ON u.wallet = s.wallet 
    GROUP BY u.wallet 
    HAVING nft_count > 0 OR u.mthy_balance > 0
    ORDER BY u.mthy_balance DESC 
    LIMIT ?`, [Number(limit)]);
  // Add catch count per user
  const result = users.map(u => {
    const catches = get('SELECT COUNT(*) as count FROM museum WHERE caught_by = ?', [u.wallet]);
    return { ...u, catches: catches?.count || 0 };
  });
  res.json({ users: result });
});

module.exports = router;
