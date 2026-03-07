'use strict';
/**
 * Kazi Backend — Database Migration
 * Runs schema.sql against the configured DATABASE_URL
 *
 * Usage:
 *   node src/db/migrate.js
 *   npm run db:migrate
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Running migrations...');
    await pool.query(sql);
    console.log('✅ Migration complete');
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
