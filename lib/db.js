const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      growid TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      gems INTEGER DEFAULT 1000,
      wl INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      rarity TEXT NOT NULL DEFAULT 'common',
      drop_rate REAL NOT NULL DEFAULT 1
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      price_gems INTEGER NOT NULL DEFAULT 100,
      price_wl INTEGER NOT NULL DEFAULT 1
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      item_icon TEXT NOT NULL,
      item_rarity TEXT NOT NULL,
      obtained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Seed default items kalau kosong
  const itemsCount = await db.execute('SELECT COUNT(*) as c FROM items');
  if (itemsCount.rows[0].c === 0) {
    const defaults = [
      ['Dirt Block', '🟫', 'common', 35],
      ['Cave BG', '🪨', 'common', 25],
      ['Lava', '🔥', 'uncommon', 18],
      ['Chandelier', '🏮', 'rare', 12],
      ['Magplant', '🧲', 'epic', 7],
      ['Gaia Beacon', '🌍', 'legendary', 3]
    ];
    for (const it of defaults) {
      await db.execute({
        sql: 'INSERT INTO items (name, icon, rarity, drop_rate) VALUES (?, ?, ?, ?)',
        args: it
      });
    }
  }
  
  // Seed default banners kalau kosong
  const bannersCount = await db.execute('SELECT COUNT(*) as c FROM banners');
  if (bannersCount.rows[0].c === 0) {
    const defaults = [
      ['Starter Pack', '📦', 100, 1],
      ['Rare Box', '🎁', 500, 5],
      ['Epic Crate', '💎', 1000, 10],
      ['Legendary Spin', '🏆', 2500, 25],
      ['VIP Gacha', '👑', 5000, 50]
    ];
    for (const b of defaults) {
      await db.execute({
        sql: 'INSERT INTO banners (name, icon, price_gems, price_wl) VALUES (?, ?, ?, ?)',
        args: b
      });
    }
  }
}

module.exports = { db, initDB };