const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');

router.post('/login', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'Wallet address required' });

  const existing = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (existing) {
    run("UPDATE users SET last_seen = datetime('now') WHERE wallet = ?", [wallet]);
    return res.json({ user: existing, isNew: false });
  }

  run('INSERT INTO users (wallet, mthy_balance) VALUES (?, ?)', [wallet, 1000]);
  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  res.json({ user, isNew: true });
});

router.get('/me', (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'Wallet required' });

  const user = get('SELECT * FROM users WHERE wallet = ?', [wallet]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const staked = all('SELECT * FROM staked_nfts WHERE wallet = ?', [wallet]);
  res.json({ user, staked, earnRate: staked.length * 80 });
});

module.exports = router;
