const express = require('express');
const router = express.Router();
const { run, get } = require('../db');

router.post('/', (req, res) => {
  const { wallet, tokenId } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });
  if (!get('SELECT * FROM users WHERE wallet = ?', [wallet])) return res.status(404).json({ error: 'User not found' });
  const nft = get('SELECT * FROM staked_nfts WHERE token_id = ?', [tokenId]);
  if (!nft) return res.status(404).json({ error: 'NFT not in garden' });
  if (nft.hp > 50) return res.status(400).json({ error: 'HP too high (' + nft.hp + '%)' });
  if (nft.wallet === wallet) return res.status(400).json({ error: "Can't catch your own" });

  run('INSERT INTO museum (token_id, collection_addr, name, image_url, original_owner, caught_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nft.token_id, nft.collection_addr, nft.name, nft.image_url, nft.wallet, wallet, 'Caught in the garden']);
  run('DELETE FROM staked_nfts WHERE token_id = ? AND collection_addr = ?', [nft.token_id, nft.collection_addr]);
  res.json({ success: true, message: `${nft.name} caught!` });
});

module.exports = router;
