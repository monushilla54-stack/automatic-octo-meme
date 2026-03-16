'use strict';

const { query } = require('../config/database');

/**
 * Find a user by email.
 */
async function findByEmail(email) {
    const result = await query(
        'SELECT id, email, username, password_hash FROM users WHERE email = $1',
        [email]
    );
    return result.rows[0] || null;
}

/**
 * Find a user by ID.
 */
async function findById(id) {
    const result = await query(
        'SELECT id, email, username FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Create a new user record.
 */
async function create({ email, username, passwordHash }) {
    const result = await query(
        `INSERT INTO users (email, username, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, username, created_at`,
        [email, username, passwordHash]
    );
    return result.rows[0];
}

module.exports = { findByEmail, findById, create };
