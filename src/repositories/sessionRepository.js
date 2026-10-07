'use strict';

const { getAppDb } = require('../config/db');
const SessionSchema = require('../models/Session');

function getSessionModel() {
  return getAppDb().model('Session', SessionSchema);
}

/**
 * Create a new garden session for a user.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function createSession(userId) {
  const Session = getSessionModel();
  const session = await Session.create({ userId });
  return session.toObject();
}

/**
 * Find a session by its MongoDB _id.
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function findSessionById(sessionId) {
  const Session = getSessionModel();
  return Session.findById(sessionId).lean();
}

/**
 * Atomically update gardenState, tasks, and conversationHistory.
 * Only the provided fields are updated (uses $set).
 * @param {string} sessionId
 * @param {object} updates  - Partial session fields to apply
 * @returns {Promise<object|null>}
 */
async function updateSession(sessionId, updates) {
  const Session = getSessionModel();
  return Session.findByIdAndUpdate(
    sessionId,
    { $set: updates },
    { new: true, lean: true }
  );
}

/**
 * Append a message to conversationHistory.
 * @param {string} sessionId
 * @param {{ role: 'user'|'assistant', content: string }} message
 * @returns {Promise<object|null>}
 */
async function appendMessage(sessionId, message) {
  const Session = getSessionModel();
  return Session.findByIdAndUpdate(
    sessionId,
    { $push: { conversationHistory: message } },
    { new: true, lean: true }
  );
}

/**
 * Mark a task's status by taskId within a session.
 * @param {string} sessionId
 * @param {string} taskId
 * @param {string} status  - New status value
 * @param {Date|null} completedAt
 * @returns {Promise<object|null>}
 */
async function updateTaskStatus(sessionId, taskId, status, completedAt = null) {
  const Session = getSessionModel();
  return Session.findOneAndUpdate(
    { _id: sessionId, 'tasks.taskId': taskId },
    {
      $set: {
        'tasks.$.status': status,
        'tasks.$.completedAt': completedAt,
      },
    },
    { new: true, lean: true }
  );
}

/**
 * Find up to `limit` sessions belonging to a specific userId, ordered oldest-to-newest.
 * @param {string} userId
 * @param {number} [limit=3]
 * @returns {Promise<object[]>}
 */
async function findSessionsByUserId(userId, limit = 3) {
  const Session = getSessionModel();
  return Session.find({ userId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
}

/**
 * Delete a session by its MongoDB _id.
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function deleteSessionById(sessionId) {
  const Session = getSessionModel();
  return Session.findByIdAndDelete(sessionId).lean();
}

module.exports = {
  createSession,
  findSessionById,
  findSessionsByUserId,
  deleteSessionById,
  updateSession,
  appendMessage,
  updateTaskStatus,
};
