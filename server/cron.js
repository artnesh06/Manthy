const cron = require('node-cron');
const { run, all, get, getConfig } = require('./db');

function startCronJobs() {
  // HP Decay — every hour, gradual decay
  cron.schedule('0 * * * *', () => {
    console.log('[CRON] HP decay...');
    const staked = all('SELECT * FROM staked_nfts');
    const now = new Date();
    let decayed = 0;
    for (const nft of staked) {
      const lastFed = new Date(nft.last_fed + 'Z');
      const hours = (now - lastFed) / (1000 * 60 * 60);
      // Gradual decay: lose ~2% per hour after 12 hours unfed
      // 0-12h: 100%, 12-24h: 100→76%, 24-36h: 76→52%, 36-48h: 52→28%, 48h+: stays at 28% (catchable at ≤50%)
      let newHp = 100;
      if (hours > 12) {
        newHp = Math.max(28, Math.round(100 - ((hours - 12) * 2)));
      }
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
    console.log('[CRON] Auto-catch check...');
    const weak = all('SELECT * FROM staked_nfts WHERE hp <= 28');
    let caught = 0;
    for (const nft of weak) {
      const lastFed = new Date(nft.last_fed + 'Z');
      const hours = (Date.now() - lastFed.getTime()) / (1000 * 60 * 60);
      // Auto-catch if unfed for 72+ hours
      if (hours >= 72) {
        run('INSERT INTO museum (token_id, collection_addr, name, image_url, original_owner, caught_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [nft.token_id, nft.collection_addr, nft.name, nft.image_url, nft.wallet, 'SYSTEM', 'Auto-caught: abandoned (72h unfed)']);
        run('DELETE FROM staked_nfts WHERE id = ?', [nft.id]);
        caught++;
      }
    }
    if (caught > 0) console.log(`[CRON] Auto-caught ${caught} abandoned NFTs`);
  });

  console.log('[CRON] Started (HP decay hourly, museum earn hourly, auto-catch every 6h)');
}

module.exports = { startCronJobs };
