const cron = require('node-cron');
const { run, all } = require('./db');

function startCronJobs() {
  // HP Decay — every hour
  cron.schedule('0 * * * *', () => {
    console.log('[CRON] HP decay...');
    const staked = all('SELECT * FROM staked_nfts');
    const now = new Date();
    let decayed = 0;
    for (const nft of staked) {
      const lastFed = new Date(nft.last_fed + 'Z');
      const hours = (now - lastFed) / (1000 * 60 * 60);
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
  console.log('[CRON] Started');
}

module.exports = { startCronJobs };
