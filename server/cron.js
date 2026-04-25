const cron = require('node-cron');
const { run, all, get, getConfig } = require('./db');

// Auto-detect game end: if staked NFTs ≤ max_survivors, declare winners
function checkAutoEndGame() {
  if (getConfig('game_ended', 0) === 1) return;
  const maxSurvivors = getConfig('max_survivors', 20);
  const alive = get('SELECT COUNT(*) as count FROM staked_nfts')?.count || 0;
  if (alive > 0 && alive <= maxSurvivors) {
    console.log(`[CRON] Auto end-game triggered! ${alive} NFTs remaining (≤${maxSurvivors})`);
    const survivors = all('SELECT * FROM staked_nfts ORDER BY hp DESC, staked_at ASC');
    const now = new Date();
    for (const nft of survivors) {
      const daysSurvived = Math.floor((now - new Date(nft.staked_at + 'Z')) / 86400000);
      run('INSERT OR IGNORE INTO winners (token_id, collection_addr, wallet, name, image_url, hp, days_survived) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [nft.token_id, nft.collection_addr, nft.wallet, nft.name, nft.image_url, nft.hp, daysSurvived]);
    }
    run("INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_ended', '1')");
    console.log(`[CRON] Game ended! ${survivors.length} winners declared automatically.`);
  }
}

function startCronJobs() {
  // HP Decay — every hour, gradual decay
  cron.schedule('0 * * * *', () => {
    if (getConfig('game_ended', 0) === 1) return;
    console.log('[CRON] HP decay...');
    const staked = all('SELECT * FROM staked_nfts');
    const now = new Date();
    let decayed = 0;
    for (const nft of staked) {
      const lastFed = new Date(nft.last_fed + 'Z');
      const hours = (now - lastFed) / (1000 * 60 * 60);
      // Step decay: 0-24h = 100%, 24-48h = 80%, 48h+ = 50% (catchable)
      let newHp = 100;
      if (hours >= 48) newHp = 50;
      else if (hours >= 24) newHp = 80;
      if (newHp !== nft.hp) {
        run('UPDATE staked_nfts SET hp = ? WHERE id = ?', [newHp, nft.id]);
        decayed++;
      }
    }
    console.log(`[CRON] ${decayed} NFTs decayed`);
  });

  // Museum earn — every hour, add earnings to original owners
  cron.schedule('30 * * * *', () => {
    console.log('[CRON] Museum earnings...');
    const museumEarnRate = getConfig('museum_earn', 16); // default 16/day (80 * 0.2)
    const earnPerHour = museumEarnRate / 24;
    const exhibits = all('SELECT * FROM museum');
    let earned = 0;
    for (const ex of exhibits) {
      if (ex.original_owner) {
        const user = get('SELECT * FROM users WHERE wallet = ?', [ex.original_owner]);
        if (user) {
          run('UPDATE users SET mthy_balance = mthy_balance + ? WHERE wallet = ?', [earnPerHour, ex.original_owner]);
          earned++;
        }
      }
    }
    if (earned > 0) console.log(`[CRON] ${earned} museum NFTs earned for owners`);
  });

  // Auto-catch — every 6 hours, catch NFTs with HP ≤ 28% that have been weak for 24h+
  cron.schedule('0 */6 * * *', () => {
    if (getConfig('game_ended', 0) === 1) return;
    console.log('[CRON] Auto-catch check...');
    const weak = all('SELECT * FROM staked_nfts WHERE hp <= 50');
    let caught = 0;
    for (const nft of weak) {
      const lastFed = new Date(nft.last_fed + 'Z');
      const hours = (Date.now() - lastFed.getTime()) / (1000 * 60 * 60);
      // Auto-catch if unfed for 72+ hours
      if (hours >= 72) {
        run('INSERT INTO museum (token_id, collection_addr, name, image_url, original_owner, caught_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [nft.token_id, nft.collection_addr, nft.name, nft.image_url, nft.wallet, 'SYSTEM', 'Auto-caught: abandoned (72h unfed)']);
        run('INSERT INTO catch_log (token_id, name, caught_by, original_owner) VALUES (?, ?, ?, ?)',
          [nft.token_id, nft.name, 'SYSTEM', nft.wallet]);
        run('DELETE FROM staked_nfts WHERE id = ?', [nft.id]);
        caught++;
      }
    }
    if (caught > 0) console.log(`[CRON] Auto-caught ${caught} abandoned NFTs`);

    // Auto-detect game end: if ≤ max_survivors NFTs remain, declare winners
    checkAutoEndGame();
  });

  // Ownership verification — every 30 minutes, check if staked NFTs still owned by staker
  const COSMOS_REST_ENDPOINTS = [
    'https://lcd-cosmoshub.keplr.app',
    'https://cosmos-rest.publicnode.com'
  ];
  const COSMOS_CONTRACT = 'cosmos1ptcdmtejupzy4nj5jx5mld9fvn98psk096mdrn820j7dj3xdmu6sy3vr7a';

  cron.schedule('*/30 * * * *', async () => {
    console.log('[CRON] Ownership verification...');
    const staked = all('SELECT * FROM staked_nfts');
    const EARN_PER_DAY = getConfig('earn_rate_per_day', 80);
    let removed = 0;

    for (const nft of staked) {
      try {
        const query = Buffer.from(JSON.stringify({owner_of:{token_id:nft.token_id}})).toString('base64');
        let currentOwner = null;

        for (const endpoint of COSMOS_REST_ENDPOINTS) {
          try {
            const resp = await fetch(`${endpoint}/cosmwasm/wasm/v1/contract/${COSMOS_CONTRACT}/smart/${query}`, {
              signal: AbortSignal.timeout(5000)
            });
            if (resp.ok) {
              const data = await resp.json();
              currentOwner = data?.data?.owner;
              break;
            }
          } catch(e) { continue; }
        }

        // If we couldn't verify, skip (don't punish on API failure)
        if (!currentOwner) continue;

        // If owner changed, auto-unstake with pending claim
        if (currentOwner !== nft.wallet) {
          const lastEarned = new Date(nft.last_earned + 'Z');
          const diffDays = (Date.now() - lastEarned.getTime()) / 86400000;
          const pending = diffDays * EARN_PER_DAY;
          if (pending > 0) {
            run('UPDATE users SET mthy_balance = mthy_balance + ? WHERE wallet = ?', [pending, nft.wallet]);
          }
          run('DELETE FROM staked_nfts WHERE id = ?', [nft.id]);
          // Clear wallet cache so new owner can see it
          run("DELETE FROM wallet_nft_cache WHERE wallet = ?", [nft.wallet]);
          run("DELETE FROM wallet_nft_cache WHERE wallet = ?", [currentOwner]);
          removed++;
          console.log(`[CRON] Auto-unstaked ${nft.name} (${nft.token_id}) — transferred from ${nft.wallet.slice(0,10)}... to ${currentOwner.slice(0,10)}...`);
        }

        // Rate limit: small delay between checks
        await new Promise(r => setTimeout(r, 500));
      } catch(e) {
        console.warn(`[CRON] Ownership check failed for ${nft.token_id}:`, e.message);
      }
    }
    if (removed > 0) console.log(`[CRON] Auto-unstaked ${removed} transferred NFTs`);
  });

  console.log('[CRON] Started (HP decay hourly, museum earn hourly, auto-catch every 6h, ownership check every 30m)');
}

module.exports = { startCronJobs };
