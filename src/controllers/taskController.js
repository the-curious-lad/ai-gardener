'use strict';

const sessionRepo = require('../repositories/sessionRepository');
const { handleTaskCompletion } = require('../services/orchestrator/gardenOrchestrator');
const logger = require('../utils/logger');

// ── GET /api/sessions/:sessionId/tasks ───────────────────────────────────────
async function listTasks(req, res) {
  try {
    const session = await sessionRepo.findSessionById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }
    return res.json({
      currentPhase: session.gardenState?.currentPhase ?? 'PLANTING',
      tasks: session.tasks ?? [],
    });
  } catch (err) {
    logger.error('[listTasks]', err);
    return res.status(500).json({ error: 'Failed to retrieve tasks.' });
  }
}

// ── POST /api/tasks/:taskId/complete ─────────────────────────────────────────
async function completeTask(req, res) {
  try {
    const { sessionId, triggerReplan = false } = req.body;
    const { taskId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required in request body.' });
    }

    const result = await handleTaskCompletion({
      sessionId,
      taskId,
      triggerReplan: Boolean(triggerReplan),
    });

    return res.json(result);
  } catch (err) {
    logger.error('[completeTask]', err);
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to complete task.' });
  }
}

module.exports = { listTasks, completeTask };
