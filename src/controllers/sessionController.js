'use strict';

const sessionRepo = require('../repositories/sessionRepository');
const {
  handleUserMessage,
  handlePhotoUpload,
} = require('../services/orchestrator/gardenOrchestrator');
const logger = require('../utils/logger');

// ── POST /api/sessions ───────────────────────────────────────────────────────
async function createSession(req, res) {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'userId is required.' });
    }

    const cleanUserId = userId.trim();
    if (cleanUserId !== 'gardener_web' && cleanUserId !== 'user_verify') {
      const existing = await sessionRepo.findSessionsByUserId(cleanUserId, 4);
      if (existing.length >= 3) {
        return res.status(400).json({
          error:
            'You already have the maximum of 3 active gardens. Please remove (✕) one of your existing gardens before starting a new plan.',
        });
      }
    }

    const session = await sessionRepo.createSession(cleanUserId);

    return res.status(201).json({
      sessionId: session._id,
      userId: session.userId,
      currentPhase: session.gardenState.currentPhase,
      createdAt: session.createdAt,
    });
  } catch (err) {
    logger.error('[createSession]', err);
    return res.status(500).json({ error: 'Failed to create session.' });
  }
}

// ── GET /api/sessions/:sessionId ─────────────────────────────────────────────
async function getSession(req, res) {
  try {
    const session = await sessionRepo.findSessionById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    return res.json(session);
  } catch (err) {
    logger.error('[getSession]', err);
    return res.status(500).json({ error: 'Failed to retrieve session.' });
  }
}

// ── POST /api/sessions/:sessionId/message ────────────────────────────────────
async function sendMessage(req, res) {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required.' });
    }

    const result = await handleUserMessage({
      sessionId: req.params.sessionId,
      userMessage: message.trim(),
    });

    return res.json(result);
  } catch (err) {
    logger.error('[sendMessage]', err);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to process message.' });
  }
}

// ── POST /api/sessions/:sessionId/photo ──────────────────────────────────────
async function uploadPhoto(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'photo file is required (multipart field: "photo").' });
    }

    const userNote = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    const result = await handlePhotoUpload({
      sessionId: req.params.sessionId,
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype || 'image/jpeg',
      userNote,
    });

    return res.json(result);
  } catch (err) {
    logger.error('[uploadPhoto]', err);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to analyze photo.' });
  }
}

// ── DELETE /api/sessions/:sessionId ──────────────────────────────────────────
async function deleteSession(req, res) {
  try {
    await sessionRepo.deleteSessionById(req.params.sessionId);
    return res.json({ deleted: true, sessionId: req.params.sessionId });
  } catch (err) {
    logger.error('[deleteSession]', err);
    return res.status(500).json({ error: 'Failed to delete session.' });
  }
}

module.exports = { createSession, getSession, deleteSession, sendMessage, uploadPhoto };
