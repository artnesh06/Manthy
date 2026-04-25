const express = require('express');
const router = express.Router();
const { run, get, all, getConfig } = require('../db');

// Check if game should auto-end after a catch
function checkAutoEndGame() {
  if (getConfig('game_ended', 0) === 1) return;
  const maxSurvivors = getConfig('max_survivors', 20);
  const alive = get('SELECT COUNT(*) as count FROM staked_nfts')?.count || 0;
  if (alive > 0 && alive <= maxSurvivors) {
    const survivors = all('SELECT * FROM staked_nfts ORDER BY hp DESC, staked_at ASC');
    const now = new Date();
    for (const nft of survivors) {
      const daysSurvived = Math.floor((now - new Date(nft.staked_at + 'Z')) / 86400000);
      run('INSERT OR IGNORE INTO winners (token_id, collection_addr, wallet, name, image_url, hp, days_survived) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nft.token_id, nft.collection_addr, nft.wallet, nft.name, nft.image_url, nft.hp, daysSurvived]);
    }
    run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_ended', '1')");
    console.log(`[CATCH] Auto end-game! ${survivors.length} winners declared.`);
  }
}

router.post('/', (req, res) => {
  const { wallet, tokenId } = req.body;
  if (!wallet || !tokenId) return res.status(400).json({ error: 'wallet and tokenId required' });

  // Block catches if game ended
  if (getConfig('game_ended', 0) === 1) return res.status(400).json({ error: 'Game has ended' });

  if (!get('SELECT * FROM users WHERE wallet = ?', [wallet])) return res.status(404).json({ error: 'User not found' });

  // Atomic: select + delete in sequence, re-check after delete
  const nft = get('SELECT * FROM staked_nfts WHERE token_id = ?', [tokenId]);
  if (!nft) return res.status(404).json({ error: 'NFT not in garden (may have been caught already)' });
  if (nft.hp > 50) return res.status(400).json({ error: 'HP too high (' + nft.hp + '%)' });
  if (nft.wallet === wallet) return res.status(400).json({ error: "Can't catch your own" });

  // Delete first to prevent race condition — if another request already deleted it, this is a no-op
  run('DELETE FROM staked_nfts WHERE token_id = ? AND collection_addr = ?', [nft.token_id, nft.collection_addr]);

  // Check it was actually deleted (not already gone)
  const stillExists = get('SELECT * FROM staked_nfts WHERE token_id = ? AND collection_addr = ?', [nft.token_id, nft.collection_addr]);
  if (stillExists) {
    // Shouldn't happen, but safety net
    return res.status(409).json({ error: 'Catch conflict, try again' });
  }

  run('INSERT INTO museum (token_id, collection_addr, name, image_url, original_owner, caught_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nft.token_id, nft.collection_addr, nft.name, nft.image_url, nft.wallet, wallet, 'Caught in the garden']);
  run('INSERT INTO catch_log (token_id, name, caught_by, original_owner) VALUES (?, ?, ?, ?)',
    [nft.token_id, nft.name, wallet, nft.wallet]);

  // Check if game should auto-end
  checkAutoEndGame();

  res.json({ success: true, message: `${nft.name} caught!` });
});

module.exports = router;
