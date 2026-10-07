'use strict';

const crypto = require('crypto');
const { getAppDb } = require('../config/db');
const UserSchema = require('../models/User');
const sessionRepo = require('../repositories/sessionRepository');
const logger = require('../utils/logger');

const TOKEN_SECRET = process.env.AUTH_SECRET || 'ai_gardener_hacktoberfest_secret_2026';
const MAX_GARDENS_PER_USER = 3;

function getUserModel() {
  return getAppDb().model('User', UserSchema);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

// ── POST /api/auth/signup ────────────────────────────────────────────────────
async function signup(req, res) {
  try {
    const rawUsername = (req.body?.username || '').trim();
    const password = req.body?.password || '';

    if (!rawUsername || rawUsername.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters.' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const User = getUserModel();
    const normalizedUsername = rawUsername.toLowerCase();

    const existing = await User.findOne({ username: normalizedUsername }).lean();
    if (existing) {
      return res.status(409).json({ error: 'Username already taken. Please log in or pick another username.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);

    const userDoc = await User.create({
      username: normalizedUsername,
      displayName: rawUsername,
      passwordSalt: salt,
      passwordHash,
    });

    const userId = String(userDoc._id);
    const token = signToken({ userId, username: userDoc.displayName });

    return res.status(201).json({
      token,
      user: {
        userId,
        username: userDoc.displayName,
      },
      sessions: [],
    });
  } catch (err) {
    logger.error('[auth.signup]', err);
    return res.status(500).json({ error: 'Sign up failed. Please try again.' });
  }
}

// ── Auto-repair sessions that completed context collection with 0 tasks & prune empty shells ──
async function repairSessionsIfNeeded(sessions = []) {
  const { buildFallbackPlan } = require('../services/planner/plannerService');
  const repaired = [];

  for (const s of sessions) {
    const historyLen = Array.isArray(s.conversationHistory) ? s.conversationHistory.length : 0;
    const tasksLen = Array.isArray(s.tasks) ? s.tasks.length : 0;

    // Prune unused empty sessions that have 0 messages and 0 tasks
    if (historyLen === 0 && tasksLen === 0) {
      await sessionRepo.deleteSessionById(s._id);
      continue;
    }

    const ctx = s.gardenState?.context || {};
    const hasAllFive =
      Array.isArray(ctx.preferredPlants) &&
      ctx.preferredPlants.length > 0 &&
      Boolean(ctx.location?.city) &&
      ctx.land?.area != null &&
      ctx.sunlightHours != null &&
      Boolean(ctx.season);

    if (hasAllFive && tasksLen === 0) {
      const startDay = s.gardenState?.currentDay ?? 1;
      const phase = s.gardenState?.currentPhase ?? 'PLANTING';
      const fallback = buildFallbackPlan(ctx, startDay, phase);
      const tasks = fallback.tasks.map((t, idx) => ({
        ...t,
        taskId: `task_${Date.now()}_${idx + 1}`,
        completedAt: null,
      }));
      const currentPlan = {
        durationDays: 7,
        summary: fallback.planSummary,
        dailySchedule: [],
      };
      const updated = await sessionRepo.updateSession(s._id, {
        'gardenState.currentPlan': currentPlan,
        tasks,
      });
      repaired.push(updated || { ...s, tasks, gardenState: { ...s.gardenState, currentPlan } });
    } else {
      repaired.push(s);
    }
  }

  return repaired;
}

// ── POST /api/auth/login ─────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const rawUsername = (req.body?.username || '').trim();
    const password = req.body?.password || '';

    if (!rawUsername || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const User = getUserModel();
    const userDoc = await User.findOne({ username: rawUsername.toLowerCase() }).lean();
    if (!userDoc) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const computedHash = hashPassword(password, userDoc.passwordSalt);
    if (computedHash !== userDoc.passwordHash) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const userId = String(userDoc._id);
    let sessions = await sessionRepo.findSessionsByUserId(userId, 10);
    sessions = await repairSessionsIfNeeded(sessions);
    sessions = sessions.slice(0, MAX_GARDENS_PER_USER);

    const token = signToken({ userId, username: userDoc.displayName });

    return res.json({
      token,
      user: {
        userId,
        username: userDoc.displayName,
      },
      sessions,
    });
  } catch (err) {
    logger.error('[auth.login]', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
async function getMe(req, res) {
  try {
    const token = extractBearerToken(req);
    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return res.status(401).json({ error: 'Unauthorized or expired token.' });
    }

    const User = getUserModel();
    const userDoc = await User.findById(payload.userId).lean();
    if (!userDoc) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    const userId = String(userDoc._id);
    let sessions = await sessionRepo.findSessionsByUserId(userId, 10);
    sessions = await repairSessionsIfNeeded(sessions);
    sessions = sessions.slice(0, MAX_GARDENS_PER_USER);

    return res.json({
      user: {
        userId,
        username: userDoc.displayName,
      },
      sessions,
    });
  } catch (err) {
    logger.error('[auth.getMe]', err);
    return res.status(500).json({ error: 'Failed to verify user session.' });
  }
}

module.exports = {
  signup,
  login,
  getMe,
  verifyToken,
  extractBearerToken,
};
