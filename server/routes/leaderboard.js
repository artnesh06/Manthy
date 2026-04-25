const express = require('express');
const router = express.Router();
const { get, all, getConfig } = require('../db');

router.get('/', (req, res) => {
  const { sort = 'hp', limit = 20, offset = 0 } = req.query;
  let orderBy = 'hp DESC, staked_at ASC';
  if (sort === 'score') {
    // Score = HP + days_staked (longer survival = higher score)
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
  const survivors = getConfig('max_survivors', 20);
  const totalUsers = get('SELECT COUNT(*) as count FROM users')?.count || 0;
  const config = get("SELECT value FROM game_config WHERE key = 'game_start'");
  res.json({ alive, weak, dead, survivors, totalUsers, gameStart: config?.value });
});

// User leaderboard — sorted by $MTHY balance
router.get('/users', (req, res) => {
  const { limit = 20 } = req.query;
  const users = all(`SELECT u.wallet, u.mthy_balance, COUNT(s.id) as nft_count 
    FROM users u LEFT JOIN staked_nfts s ON u.wallet = s.wallet 
    GROUP BY u.wallet 
    HAVING nft_count > 0 OR u.mthy_balance > 0
    ORDER BY u.mthy_balance DESC 
    LIMIT ?`, [Number(limit)]);
  res.json({ users });
});

module.exports = router;
