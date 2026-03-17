'use strict';

// In-Memory User Store: Map<email, user>
const demoUsers = new Map();
const demoUsersById = new Map();

/**
 * Find a user by email.
 */
async function findByEmail(email) {
    return demoUsers.get(email) || null;
}

/**
 * Find a user by ID.
 */
async function findById(id) {
    return demoUsersById.get(id) || null;
}

/**
 * Create a new user record.
 */
async function create({ email, username, passwordHash }) {
    const id = `user_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const user = {
        id,
        email,
        username,
        password_hash: passwordHash,
        created_at: new Date().toISOString()
    };
    demoUsers.set(email, user);
    demoUsersById.set(id, user);
    return user;
}

module.exports = { findByEmail, findById, create };
