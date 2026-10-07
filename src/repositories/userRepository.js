'use strict';

const { getAppDb } = require('../config/db');
const UserSchema = require('../models/User');

function getUserModel() {
  return getAppDb().model('User', UserSchema);
}

/**
 * Create a new user.
 * @param {string} name
 * @returns {Promise<object>}
 */
async function createUser(name) {
  const User = getUserModel();
  const user = await User.create({ name });
  return user.toObject();
}

/**
 * Find user by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findUserById(id) {
  const User = getUserModel();
  const user = await User.findById(id).lean();
  return user;
}

module.exports = { createUser, findUserById };
