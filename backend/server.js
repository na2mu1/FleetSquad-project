require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db/init');

const { router: authRouter } = require('./routes/auth');
const accountsRouter = require('./routes/accounts');
const listingsRouter = require('./routes/listings');
const escrowRouter = require('./routes/escrow');
const adminRouter = require('./routes/admin');
const paymentsRouter = require('./routes/payments');
const { router: manualPayRouter } = require('./routes/manualPayment');
const { router: settingsRouter } = require('./routes/settings');
const profileRouter = require('./routes/profile');
const tournamentV2Router = require('./routes/tournamentV2');
const leaderboardRouter = require('./routes/leaderboard');
const inventoryRouter = require('./routes/inventory');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'eGame Marketplace v3' }));

app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/accounts', inventoryRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/escrow', escrowRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/payment', manualPayRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/t2', tournamentV2Router);
app.use('/api/leaderboard', leaderboardRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`eGame API v3 → http://localhost:${PORT}`));
