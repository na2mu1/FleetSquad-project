// Seeds one admin wallet for the admin dashboard demo.
const { v4: uuid } = require('uuid');
const db = require('./init');

const adminWallet = '0xADMIN000000000000000000000000000000001';
const existing = db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(adminWallet);
if (!existing) {
  db.prepare('INSERT INTO users (id, wallet_address, role, display_name) VALUES (?, ?, ?, ?)')
    .run(uuid(), adminWallet, 'admin', 'Platform Admin');
  console.log('Seeded admin user with wallet:', adminWallet);
} else {
  console.log('Admin user already exists.');
}
