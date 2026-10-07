'use strict';

const { Router } = require('express');
const multer = require('multer');
const authController = require('../controllers/authController');
const sessionController = require('../controllers/sessionController');
const taskController = require('../controllers/taskController');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// ── Auth routes (lightweight username + password, no email verification) ─────
router.post('/auth/signup', authController.signup);
router.post('/auth/login', authController.login);
router.get('/auth/me', authController.getMe);

// ── Session routes ───────────────────────────────────────────────────────────
router.post('/sessions', sessionController.createSession);
router.get('/sessions/:sessionId', sessionController.getSession);
router.delete('/sessions/:sessionId', sessionController.deleteSession);
router.post('/sessions/:sessionId/message', sessionController.sendMessage);
router.post('/sessions/:sessionId/photo', upload.single('photo'), sessionController.uploadPhoto);
router.get('/sessions/:sessionId/tasks', taskController.listTasks);

// ── Task routes ──────────────────────────────────────────────────────────────
router.post('/tasks/:taskId/complete', taskController.completeTask);

module.exports = router;
