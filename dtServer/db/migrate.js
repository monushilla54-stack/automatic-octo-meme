'use strict';

/**
 * Runs the SQL migration against the configured PostgreSQL database.
 * Usage: node db/migrate.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    const sqlPath = path.join(__dirname, 'migrations', '001_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running migration: 001_schema.sql');
    await pool.query(sql);
    console.log('Migration complete.');
    await pool.end();
}

migrate().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
