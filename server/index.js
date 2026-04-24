const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');
const { startCronJobs } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/stake', require('./routes/stake'));
app.use('/api/feed', require('./routes/feed'));
app.use('/api/catch', require('./routes/catch'));
app.use('/api/claim', require('./routes/claim'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/museum', require('./routes/museum'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Init DB then start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Manthy server on port ${PORT}`);
    startCronJobs();
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
