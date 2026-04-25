const express = require('express');
const router = express.Router();
const { get, all, getConfig } = require('../db');

router.get('/', (req, res) => {
  const { sort = 'hp', limit = 20, offset = 0 } = req.query;
  let orderBy = 'hp DESC, staked_at ASC';
  if (sort === 'score') orderBy = 'hp DESC, staked_at ASC';
  const nfts = all(`SELECT * FROM staked_nfts ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [Number(limit), Number(offset)]);
  const total = get('SELECT COUNT(*) as count FROM staked_nfts');
  res.json({ nfts, total: total?.count || 0 });
});

router.get('/stats', (req, res) => {
  const alive = get('SELECT COUNT(*) as count FROM staked_nfts')?.count || 0;
  const weak = get('SELECT COUNT(*) as count FROM staked_nfts WHERE hp <= 80')?.count || 0;
  const dead = get('SELECT COUNT(*) as count FROM museum')?.count || 0;
  const survivors = getConfig('max_survivors', 20);
  const config = get("SELECT value FROM game_config WHERE key = 'game_start'");
  res.json({ alive, weak, dead, survivors, gameStart: config?.value });
});

module.exports = router;
