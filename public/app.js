'use strict';

const MAX_GARDENS = 3;
const NEW_CHAT_DRAFT_ID = 'NEW_CHAT_DRAFT';
const AUTH_TOKEN_KEY = 'ai_gardener_auth_token_v2';

// Clear legacy localStorage session and auth keys
try {
  localStorage.removeItem('ai_gardener_auth_token');
  localStorage.removeItem('ai_gardener_session_ids');
  localStorage.removeItem('ai_gardener_session_ids_v2');
  localStorage.removeItem('ai_gardener_active_session_id');
  localStorage.removeItem('ai_gardener_active_session_id_v2');
  localStorage.removeItem('ai_gardener_active_session_id_v3');
  localStorage.removeItem('ai_gardener_session_id');
} catch (_) {
  // ignore storage errors
}

let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || null;
let currentUser = null; // { userId, username }
let authMode = 'login'; // 'login' | 'signup'

let sessionIds = [];
let currentSessionId = NEW_CHAT_DRAFT_ID;

// Per-session in-memory state: sessionId -> { session, locallyCompletedIds, lastInspector }
const gardensState = new Map();
// Scoped single-flight tracker: { sessionId, taskId, kind: 'task' | 'replan' | 'chat' } | null
let activeInFlight = null;
let waitToastTimer = null;
let taskQueue = Promise.resolve();

function showWaitNotice(clickedBtn = null) {
  let toast = document.getElementById('concurrencyToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'concurrencyToast';
    toast.className = 'concurrency-toast hidden';
    document.body.appendChild(toast);
  }
  toast.textContent = '⏳ Please wait until the previous query gets processed.';
  toast.classList.remove('hidden');

  if (clickedBtn && !clickedBtn.dataset.origText) {
    clickedBtn.dataset.origText = clickedBtn.textContent;
    clickedBtn.textContent = '⏳ Wait for previous query...';
    setTimeout(() => {
      if (clickedBtn.dataset.origText) {
        clickedBtn.textContent = clickedBtn.dataset.origText;
        delete clickedBtn.dataset.origText;
      }
    }, 1800);
  }

  if (waitToastTimer) clearTimeout(waitToastTimer);
  waitToastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

// Auth DOM Elements
const authOverlay = document.getElementById('authOverlay');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabSignupBtn = document.getElementById('tabSignupBtn');
const authForm = document.getElementById('authForm');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const userBadge = document.getElementById('userBadge');
const logoutBtn = document.getElementById('logoutBtn');

// App DOM Elements
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const photoInput = document.getElementById('photoInput');
const photoPreviewBar = document.getElementById('photoPreviewBar');
const photoFileName = document.getElementById('photoFileName');
const clearPhotoBtn = document.getElementById('clearPhotoBtn');
const sendBtn = document.getElementById('sendBtn');
const newSessionBtn = document.getElementById('newSessionBtn');
const sidebarNewGardenBtn = document.getElementById('sidebarNewGardenBtn');

const gardenCountBadge = document.getElementById('gardenCountBadge');
const phaseBadge = document.getElementById('phaseBadge');
const gardenList = document.getElementById('gardenList');
const multiActionContainer = document.getElementById('multiActionContainer');
const topTaskSchedule = document.getElementById('topTaskSchedule');

const activeChatTitle = document.getElementById('activeChatTitle');
const activeChatSubtitle = document.getElementById('activeChatSubtitle');

const ctxLocation = document.getElementById('ctxLocation');
const ctxLand = document.getElementById('ctxLand');
const ctxSun = document.getElementById('ctxSun');
const ctxSeason = document.getElementById('ctxSeason');
const ctxPlants = document.getElementById('ctxPlants');

const planCardTitle = document.getElementById('planCardTitle');
const planDuration = document.getElementById('planDuration');
const planSummary = document.getElementById('planSummary');
const taskList = document.getElementById('taskList');
const inspectorOutput = document.getElementById('inspectorOutput');

function createEmptyGardenEntry(sessionId) {
  return {
    session: {
      _id: sessionId,
      gardenState: {
        context: {},
        currentPhase: 'PLANTING',
        currentDay: 1,
        currentPlan: null,
      },
      tasks: [],
      conversationHistory: [],
    },
    locallyCompletedIds: new Set(),
    lastInspector: null,
  };
}

function getGardenEntry(sessionId) {
  if (!gardensState.has(sessionId)) {
    gardensState.set(sessionId, createEmptyGardenEntry(sessionId));
  }
  return gardensState.get(sessionId);
}

function getGardenDisplayName(sessionId, index) {
  if (!sessionId || sessionId === NEW_CHAT_DRAFT_ID) {
    return 'New Garden';
  }
  const entry = gardensState.get(sessionId);
  const ctx = entry?.session?.gardenState?.context || {};
  const plant = ctx.preferredPlants?.[0]
    ? ctx.preferredPlants[0].charAt(0).toUpperCase() + ctx.preferredPlants[0].slice(1)
    : null;
  const city = ctx.location?.city || null;

  if (plant && city) return `${plant} · ${city}`;
  if (plant) return `${plant} Garden`;
  if (city) return `Garden · ${city}`;
  return `Garden #${index + 1}`;
}

function getLastDayNumber(tasks = []) {
  let maxDay = 0;
  for (const t of tasks) {
    const sched = String(t.scheduledFor || t.title || '');
    const nums = sched.match(/\d+/g);
    if (nums) {
      for (const n of nums) {
        const val = parseInt(n, 10);
        if (!Number.isNaN(val) && val > maxDay) maxDay = val;
      }
    }
  }
  return maxDay || tasks.length || 1;
}

function getEffectiveTasks(sessionId) {
  const entry = getGardenEntry(sessionId);
  const rawTasks = entry.session?.tasks || [];
  return rawTasks.map((t) =>
    entry.locallyCompletedIds.has(t.taskId) ? { ...t, status: 'COMPLETED' } : t
  );
}

async function safeReadJson(res) {
  const rawText = await res.text();
  if (!rawText || !rawText.trim()) {
    throw new Error(
      `The connection timed out or closed before the AI finished responding (HTTP ${res.status}). Please click Retry below to resend.`
    );
  }
  try {
    return JSON.parse(rawText);
  } catch (_) {
    throw new Error(
      `Received an incomplete JSON response from the server (HTTP ${res.status}). Please click Retry below to resend.`
    );
  }
}

function appendChatBubble(role, text, retryPayload = null, msgIndex = -1, sessionId = null) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const textSpan = document.createElement('div');
  textSpan.textContent = text;
  bubble.appendChild(textSpan);

  if (retryPayload) {
    const retryRow = document.createElement('div');
    retryRow.className = 'retry-action-row';
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn-retry-msg';
    retryBtn.textContent = '🔄 Retry Sending';
    retryBtn.onclick = () => {
      if (activeInFlight) {
        showWaitNotice(retryBtn);
        return;
      }
      const targetSid = retryPayload.sessionId || sessionId || currentSessionId;
      const entry = getGardenEntry(targetSid);
      const hist = entry.session?.conversationHistory || [];
      // Remove the error bubble and the preceding optimistic user bubble before retrying
      if (msgIndex >= 0 && msgIndex < hist.length) {
        hist.splice(msgIndex, 1);
        if (msgIndex - 1 >= 0 && hist[msgIndex - 1]?.role === 'user') {
          hist.splice(msgIndex - 1, 1);
        }
      }
      if (retryPayload.type === 'chat' && retryPayload.text) {
        sendChatMessage(retryPayload.text, null, targetSid);
      } else if (retryPayload.type === 'task' && retryPayload.taskId) {
        markTaskDone(targetSid, retryPayload.taskId, Boolean(retryPayload.triggerReplan));
      }
    };
    retryRow.appendChild(retryBtn);
    bubble.appendChild(retryRow);
  }

  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderContext(ctx = {}) {
  const locText = [ctx.location?.city, ctx.location?.state].filter(Boolean).join(', ') || '—';
  ctxLocation.textContent = `📍 Location: ${locText}`;
  ctxLand.textContent = `📐 Area: ${ctx.land?.area ? `${ctx.land.area} ${ctx.land.unit || 'sq_ft'}` : '—'}`;
  ctxSun.textContent = `☀️ Sunlight: ${ctx.sunlightHours != null ? `${ctx.sunlightHours}h/day` : '—'}`;
  if (ctxSeason) ctxSeason.textContent = `🌦️ Season: ${ctx.season || '—'}`;
  ctxPlants.textContent = `🌿 Plants: ${ctx.preferredPlants?.length ? ctx.preferredPlants.join(', ') : '—'}`;
}

function renderChatForActiveGarden() {
  const activeId = currentSessionId || NEW_CHAT_DRAFT_ID;
  const isNewDraft = activeId === NEW_CHAT_DRAFT_ID || !sessionIds.includes(activeId);
  const idx = sessionIds.indexOf(activeId);
  const name = isNewDraft
    ? 'New Garden'
    : getGardenDisplayName(activeId, idx >= 0 ? idx : 0);
  const entry = getGardenEntry(activeId);
  const phase = entry.session?.gardenState?.currentPhase || 'PLANTING';

  if (activeChatTitle) activeChatTitle.textContent = `💬 ${name}`;
  if (activeChatSubtitle) {
    activeChatSubtitle.textContent = isNewDraft ? 'New Chat' : `${phase} Phase`;
  }
  phaseBadge.textContent = phase;

  const isThisChatSending =
    activeInFlight &&
    activeInFlight.sessionId === activeId &&
    activeInFlight.kind === 'chat';
  if (sendBtn && !sendBtn.dataset.origText) {
    sendBtn.textContent = isThisChatSending ? '⏳...' : 'Send';
    sendBtn.disabled = Boolean(isThisChatSending);
  }

  renderContext(entry.session?.gardenState?.context || {});

  chatMessages.innerHTML = '';
  const history = entry.session?.conversationHistory || [];
  if (history.length === 0) {
    appendChatBubble(
      'assistant',
      'Welcome! Tell me what you would like to grow and where your garden is located — or upload a photo of a plant you are observing.'
    );
  } else {
    history.forEach((msg, i) => {
      appendChatBubble(
        msg.role === 'user' ? 'user' : 'assistant',
        msg.content,
        msg.retryPayload || null,
        i,
        activeId
      );
    });
  }

  if (entry.lastInspector) {
    inspectorOutput.textContent = JSON.stringify(entry.lastInspector, null, 2);
  } else {
    inspectorOutput.textContent = 'Waiting for interaction in this garden...';
  }
}

function renderSidebarGardens() {
  gardenList.innerHTML = '';
  const count = sessionIds.length;
  if (gardenCountBadge) {
    gardenCountBadge.textContent = `${count} / ${MAX_GARDENS} Gardens`;
  }

  newSessionBtn.disabled = false;
  newSessionBtn.textContent = '+ New Garden';
  if (sidebarNewGardenBtn) {
    sidebarNewGardenBtn.disabled = false;
    sidebarNewGardenBtn.textContent = '+ Add Garden';
  }

  if (count === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'empty-state';
    emptyLi.style.fontSize = '0.82rem';
    emptyLi.style.padding = '0.5rem 0.25rem';
    emptyLi.textContent = 'No active gardens yet. Send a message in chat to start!';
    gardenList.appendChild(emptyLi);
    return;
  }

  sessionIds.forEach((id, idx) => {
    const entry = getGardenEntry(id);
    const tasks = getEffectiveTasks(id);
    const pending = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
    const doneCount = tasks.length - pending.length;
    const phase = entry.session?.gardenState?.currentPhase || 'PLANTING';

    const li = document.createElement('li');
    li.className = `garden-card ${id === currentSessionId ? 'active' : ''}`;
    li.onclick = () => selectGarden(id);

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'garden-card-title';
    title.textContent = `🌱 ${getGardenDisplayName(id, idx)}`;

    const sub = document.createElement('div');
    sub.className = 'garden-card-sub';
    sub.textContent =
      tasks.length > 0
        ? `${phase} · ${doneCount}/${tasks.length} done`
        : `${phase} · In progress`;

    info.appendChild(title);
    info.appendChild(sub);
    li.appendChild(info);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'garden-remove-btn';
    removeBtn.title = 'Delete / reset this garden';
    removeBtn.textContent = '✕';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeGarden(id);
    };
    li.appendChild(removeBtn);

    gardenList.appendChild(li);
  });
}

function renderMultiGardenNextActions() {
  multiActionContainer.innerHTML = '';
  const count = sessionIds.length;
  topTaskSchedule.textContent = `${count} Active ${count === 1 ? 'Garden' : 'Gardens'}`;

  if (count === 0) {
    const row = document.createElement('div');
    row.className = 'action-row';
    const info = document.createElement('div');
    info.className = 'action-row-info';
    const badge = document.createElement('span');
    badge.className = 'action-row-badge';
    badge.textContent = '🌱 Ready to Start';
    const title = document.createElement('div');
    title.className = 'action-row-title';
    title.textContent = 'Start your first garden in the chat on the right';
    const desc = document.createElement('p');
    desc.className = 'action-row-desc';
    desc.textContent = 'Tell AI Gardener your city/state, space size, sunlight hours, season, and plant.';
    info.appendChild(badge);
    info.appendChild(title);
    info.appendChild(desc);
    row.appendChild(info);
    multiActionContainer.appendChild(row);
    return;
  }

  sessionIds.forEach((id, idx) => {
    const name = getGardenDisplayName(id, idx);
    const tasks = getEffectiveTasks(id);
    const pending = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
    const isThisGardenTaskInFlight =
      activeInFlight &&
      activeInFlight.sessionId === id &&
      activeInFlight.kind === 'task';
    const isThisGardenReplanInFlight =
      activeInFlight &&
      activeInFlight.sessionId === id &&
      activeInFlight.kind === 'replan';

    const inFlightTask = isThisGardenTaskInFlight
      ? tasks.find((t) => t.taskId === activeInFlight.taskId) || null
      : null;
    const topTask = inFlightTask || pending[0] || null;

    const row = document.createElement('div');
    row.className = `action-row ${id === currentSessionId ? 'active-garden-row' : ''}`;
    row.style.cursor = 'pointer';
    row.onclick = () => selectGarden(id);

    const info = document.createElement('div');
    info.className = 'action-row-info';

    const badge = document.createElement('span');
    badge.className = 'action-row-badge';

    const title = document.createElement('div');
    title.className = `action-row-title ${inFlightTask ? 'strikethrough' : ''}`;

    const desc = document.createElement('p');
    desc.className = 'action-row-desc';

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-sm';

    if (topTask) {
      badge.textContent = `🌿 ${name} · ${topTask.scheduledFor || topTask.phase}`;
      title.textContent = topTask.title;
      desc.textContent = inFlightTask
        ? '✓ Marked done — updating your garden state...'
        : topTask.description || 'Head outside and complete this step.';
      btn.textContent = inFlightTask ? '⏳ Processing...' : '✓ I Did It Outside';
      btn.disabled = Boolean(inFlightTask);
      btn.onclick = (e) => {
        e.stopPropagation();
        if (activeInFlight) {
          showWaitNotice(btn);
          return;
        }
        markTaskDone(id, topTask.taskId, false);
      };
    } else if (tasks.length > 0) {
      const lastDay = getLastDayNumber(tasks);
      const nextDay = lastDay + 1;
      badge.textContent = `🌿 ${name} · Up to Day ${lastDay} Done`;
      title.textContent = `All tasks up to Day ${lastDay} completed!`;
      desc.textContent = isThisGardenReplanInFlight
        ? `⏳ Generating Day ${nextDay}+ tasks...`
        : `Ready to generate your Day ${nextDay}+ plan.`;
      btn.textContent = isThisGardenReplanInFlight
        ? '⏳ Generating...'
        : `✨ Day ${nextDay}+ Plan`;
      btn.disabled = Boolean(isThisGardenReplanInFlight);
      btn.onclick = (e) => {
        e.stopPropagation();
        if (activeInFlight) {
          showWaitNotice(btn);
          return;
        }
        markTaskDone(id, 'replan', true);
      };
    } else {
      badge.textContent = `🌱 ${name} · Setup`;
      title.textContent = 'Continue setting up this garden';
      desc.textContent = 'Click to open chat and share remaining details for your personalized plan.';
      btn.textContent = '💬 Open Chat';
      btn.disabled = false;
      btn.onclick = (e) => {
        e.stopPropagation();
        selectGarden(id);
        messageInput.focus();
      };
    }

    info.appendChild(badge);
    info.appendChild(title);
    info.appendChild(desc);
    row.appendChild(info);
    row.appendChild(btn);
    multiActionContainer.appendChild(row);
  });
}

function renderUnifiedTasksAndPlans() {
  taskList.innerHTML = '';

  const isNewDraft =
    !currentSessionId ||
    currentSessionId === NEW_CHAT_DRAFT_ID ||
    !sessionIds.includes(currentSessionId);

  if (isNewDraft) {
    if (planCardTitle) planCardTitle.textContent = 'Current Plan & Tasks — New Garden';
    planDuration.textContent = 'No active plan yet';
    planSummary.textContent =
      'No new activity in this chat. Enter your query in chat or select one of your gardens on the left.';
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No new activity or tasks scheduled yet in this chat.';
    taskList.appendChild(li);
    return;
  }

  const idx = sessionIds.indexOf(currentSessionId);
  const name = getGardenDisplayName(currentSessionId, idx >= 0 ? idx : 0);
  const entry = getGardenEntry(currentSessionId);
  const plan = entry.session?.gardenState?.currentPlan;
  const tasks = getEffectiveTasks(currentSessionId);

  if (planCardTitle) {
    planCardTitle.textContent = `Current Plan & Tasks — ${name}`;
  }

  if (tasks.length === 0) {
    planDuration.textContent = 'No active plan yet';
    planSummary.textContent =
      'No new activity in this chat yet. Complete the quick context check in chat to generate your personalized plan.';
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'No new activity or tasks scheduled yet in this chat.';
    taskList.appendChild(li);
    return;
  }

  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;
  const remaining = tasks.length - completedCount;
  const durationLabel = plan?.durationDays ? `${plan.durationDays}-Day Plan` : 'Active Plan';
  planDuration.textContent = `${durationLabel} · ${remaining} left (${completedCount}/${tasks.length} done)`;
  planSummary.textContent =
    plan?.summary || `Personalized step-by-step activities for ${name}.`;

  const pending = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
  const earliestPendingId = pending[0]?.taskId || null;
  const isThisGardenTaskInFlight =
    activeInFlight &&
    activeInFlight.sessionId === currentSessionId &&
    activeInFlight.kind === 'task';

  for (const t of tasks) {
    const isDone = t.status === 'COMPLETED';
    const isThisSpecificTaskInFlight =
      isThisGardenTaskInFlight && activeInFlight.taskId === t.taskId;
    const isCurrentEarliest =
      !isThisGardenTaskInFlight && earliestPendingId && t.taskId === earliestPendingId;

    const li = document.createElement('li');
    li.className = `task-item ${isDone ? 'completed' : ''}`;
    li.dataset.taskId = t.taskId;

    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'task-title';

    const statusBadge = document.createElement('span');
    statusBadge.className = 'task-garden-badge';
    if (isThisSpecificTaskInFlight) {
      statusBadge.textContent = '⏳ Updating';
    } else if (isDone) {
      statusBadge.textContent = '✓ Completed';
    } else if (isCurrentEarliest) {
      statusBadge.textContent = '🟢 Present Activity';
    } else {
      statusBadge.textContent = '⏭️ Next Activity';
    }
    title.appendChild(statusBadge);

    const titleText = document.createTextNode(
      `${t.scheduledFor ? `[${t.scheduledFor}] ` : ''}${t.title}`
    );
    title.appendChild(titleText);

    const desc = document.createElement('div');
    desc.className = 'task-desc';
    desc.textContent = t.description || '';

    info.appendChild(title);
    info.appendChild(desc);
    li.appendChild(info);

    if (isThisSpecificTaskInFlight) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = '⏳ Processing...';
      btn.disabled = true;
      li.appendChild(btn);
    } else if (!isDone) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      if (isCurrentEarliest) {
        btn.textContent = 'Done';
        btn.disabled = false;
        btn.onclick = () => {
          if (activeInFlight) {
            showWaitNotice(btn);
            return;
          }
          markTaskDone(currentSessionId, t.taskId, false);
        };
      } else {
        btn.textContent = '🔒 Locked';
        btn.disabled = true;
        btn.title = `Complete earlier tasks in ${name} first`;
      }
      li.appendChild(btn);
    }

    taskList.appendChild(li);
  }
}

function renderAll() {
  renderSidebarGardens();
  renderMultiGardenNextActions();
  renderUnifiedTasksAndPlans();
  renderChatForActiveGarden();
}

function openFreshNewChatView() {
  gardensState.set(NEW_CHAT_DRAFT_ID, createEmptyGardenEntry(NEW_CHAT_DRAFT_ID));
  currentSessionId = NEW_CHAT_DRAFT_ID;
  renderAll();
  if (messageInput) messageInput.focus();
}

function setAuthMode(mode) {
  authMode = mode === 'signup' ? 'signup' : 'login';
  if (tabLoginBtn && tabSignupBtn && authSubmitBtn) {
    tabLoginBtn.classList.toggle('active', authMode === 'login');
    tabSignupBtn.classList.toggle('active', authMode === 'signup');
    authSubmitBtn.textContent = authMode === 'login' ? 'Log In' : 'Create Account';
  }
  if (authError) {
    authError.textContent = '';
    authError.classList.add('hidden');
  }
}

function showAuthOverlay() {
  if (authOverlay) authOverlay.classList.remove('hidden');
}

function hideAuthOverlay() {
  if (authOverlay) authOverlay.classList.add('hidden');
}

async function applyAuthenticatedPayload(user, sessions = []) {
  currentUser = user;
  if (userBadge) {
    userBadge.textContent = `👤 ${user.username}`;
  }
  gardensState.clear();
  sessionIds = [];

  for (const s of sessions.slice(0, MAX_GARDENS)) {
    const sid = String(s._id || s.sessionId);
    sessionIds.push(sid);
    const entry = getGardenEntry(sid);
    entry.session = s;
  }

  hideAuthOverlay();

  // Always land on a fresh "New Chat" screen on login, signup, and refresh,
  // while keeping existing chats listed on the left and active tasks in the green panel.
  openFreshNewChatView();
}

if (tabLoginBtn) {
  tabLoginBtn.addEventListener('click', () => setAuthMode('login'));
}
if (tabSignupBtn) {
  tabSignupBtn.addEventListener('click', () => setAuthMode('signup'));
}

if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (authUsername.value || '').trim();
    const password = authPassword.value || '';
    if (!username || !password) return;

    authSubmitBtn.disabled = true;
    authError.classList.add('hidden');

    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      authToken = data.token;
      localStorage.setItem(AUTH_TOKEN_KEY, authToken);
      authPassword.value = '';
      await applyAuthenticatedPayload(data.user, data.sessions || []);
    } catch (err) {
      authError.textContent = err.message;
      authError.classList.remove('hidden');
    } finally {
      authSubmitBtn.disabled = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    authToken = null;
    currentUser = null;
    sessionIds = [];
    currentSessionId = NEW_CHAT_DRAFT_ID;
    gardensState.clear();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    if (userBadge) userBadge.textContent = '👤 Guest';
    showAuthOverlay();
  });
}

function selectGarden(sessionId) {
  if (!sessionIds.includes(sessionId)) return;
  currentSessionId = sessionId;
  renderAll();
}

async function removeGarden(sessionId) {
  try {
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
  } catch (_) {
    // ignore network error
  }
  sessionIds = sessionIds.filter((id) => id !== sessionId);
  gardensState.delete(sessionId);
  if (currentSessionId === sessionId) {
    openFreshNewChatView();
  } else {
    renderAll();
  }
}

async function createBackendSessionForDraft() {
  if (sessionIds.length >= MAX_GARDENS) {
    return null;
  }
  const userId = currentUser?.userId || 'gardener_web';
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await safeReadJson(res);
  if (!res.ok || data.limitReached || !data.sessionId) {
    return null;
  }
  const newId = String(data.sessionId);
  sessionIds.push(newId);
  getGardenEntry(newId);
  currentSessionId = newId;
  return newId;
}

async function ensureSessionsLoaded() {
  if (!authToken) {
    showAuthOverlay();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      throw new Error('Unauthorized');
    }
    const data = await safeReadJson(res);
    await applyAuthenticatedPayload(data.user, data.sessions || []);
  } catch (_) {
    authToken = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    showAuthOverlay();
  }
}

function markTaskDone(targetSessionId, taskId, triggerReplan = false) {
  if (!targetSessionId || !taskId) return;

  // Enforce single-flight concurrency for local LLM; notify user if another query is running
  if (activeInFlight) {
    showWaitNotice();
    return;
  }

  // Switch active chat to the garden whose task is being completed
  if (currentSessionId !== targetSessionId) {
    currentSessionId = targetSessionId;
  }

  const entry = getGardenEntry(targetSessionId);
  const effectiveTasks = getEffectiveTasks(targetSessionId);
  const pendingTasks = effectiveTasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS'
  );
  const earliestPending = pendingTasks[0] || null;

  if (!triggerReplan) {
    if (entry.locallyCompletedIds.has(taskId)) return;
    // Enforce sequential order: cannot strike through a later task before the earliest pending task
    if (earliestPending && earliestPending.taskId !== taskId) {
      return;
    }
    entry.locallyCompletedIds.add(taskId);
  }

  activeInFlight = {
    sessionId: targetSessionId,
    taskId,
    kind: triggerReplan ? 'replan' : 'task',
  };

  // Append client message to this garden's conversationHistory so it shows on the right (user bubble)
  const targetTask = effectiveTasks.find((t) => t.taskId === taskId);
  const clientMsgText =
    targetTask && !triggerReplan
      ? `✓ Completed [${targetTask.scheduledFor || 'Task'}]: "${targetTask.title}".`
      : '✓ Completed all current tasks. Please generate the next plan.';

  entry.session.conversationHistory = [
    ...(entry.session.conversationHistory || []),
    { role: 'user', content: clientMsgText, timestamp: new Date().toISOString() },
  ];

  renderAll();

  taskQueue = taskQueue.then(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: targetSessionId, triggerReplan }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to complete task');

      if (data.replanned) {
        entry.locallyCompletedIds.clear();
      }

      entry.session.gardenState = {
        ...(entry.session.gardenState || {}),
        currentPhase: data.updatedPhase || entry.session.gardenState?.currentPhase || 'PLANTING',
        currentPlan: data.currentPlan || entry.session.gardenState?.currentPlan || null,
      };
      entry.session.tasks = data.tasks || entry.session.tasks || [];
      entry.lastInspector = data;

      const aiMessage = data.reply || data.summary;
      if (aiMessage) {
        entry.session.conversationHistory = [
          ...(entry.session.conversationHistory || []),
          { role: 'assistant', content: aiMessage, timestamp: new Date().toISOString() },
        ];
      }

      activeInFlight = null;
      renderAll();
    } catch (err) {
      if (!triggerReplan) {
        entry.locallyCompletedIds.delete(taskId);
      }
      activeInFlight = null;
      entry.session.conversationHistory = [
        ...(entry.session.conversationHistory || []),
        {
          role: 'assistant',
          content: `Error: ${err.message}`,
          timestamp: new Date().toISOString(),
          retryPayload: {
            type: 'task',
            sessionId: targetSessionId,
            taskId,
            triggerReplan,
          },
        },
      ];
      renderAll();
    }
  });
}

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (file) {
    photoFileName.textContent = `📷 ${file.name}`;
    photoPreviewBar.classList.remove('hidden');
  } else {
    photoPreviewBar.classList.add('hidden');
  }
});

clearPhotoBtn.addEventListener('click', () => {
  photoInput.value = '';
  photoPreviewBar.classList.add('hidden');
});

newSessionBtn.addEventListener('click', () => {
  openFreshNewChatView();
});

if (sidebarNewGardenBtn) {
  sidebarNewGardenBtn.addEventListener('click', () => {
    openFreshNewChatView();
  });
}

async function sendChatMessage(text, file = null, targetSessionOverride = null) {
  if (activeInFlight) {
    showWaitNotice(sendBtn);
    return;
  }

  if (!text && !file) return;

  if (targetSessionOverride && sessionIds.includes(targetSessionOverride)) {
    currentSessionId = targetSessionOverride;
  }

  const isOnNewDraft =
    !currentSessionId ||
    currentSessionId === NEW_CHAT_DRAFT_ID ||
    !sessionIds.includes(currentSessionId);

  if (isOnNewDraft) {
    // If all 3 garden slots are already in use, block creating a 4th chat on submit
    if (sessionIds.length >= MAX_GARDENS) {
      const draftEntry = getGardenEntry(NEW_CHAT_DRAFT_ID);
      const userPrompt = file
        ? text
          ? `📷 [Photo: ${file.name}] ${text}`
          : `📷 [Photo: ${file.name}]`
        : text;

      draftEntry.session.conversationHistory = [
        ...(draftEntry.session.conversationHistory || []),
        { role: 'user', content: userPrompt, timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: `⚠️ Cannot create a new garden plan: you already have ${sessionIds.length} active chats (maximum limit is ${MAX_GARDENS}). Please delete (✕) one of your existing gardens in the left sidebar before starting a new chat.`,
          timestamp: new Date().toISOString(),
        },
      ];
      messageInput.value = '';
      photoInput.value = '';
      photoPreviewBar.classList.add('hidden');
      renderAll();
      return;
    }

    // Lazily create the session in MongoDB now that the user is sending their first prompt
    activeInFlight = { sessionId: NEW_CHAT_DRAFT_ID, taskId: null, kind: 'chat' };
    renderAll();
    const createdId = await createBackendSessionForDraft();
    if (!createdId) {
      activeInFlight = null;
      const draftEntry = getGardenEntry(NEW_CHAT_DRAFT_ID);
      draftEntry.session.conversationHistory = [
        ...(draftEntry.session.conversationHistory || []),
        { role: 'user', content: text || '📷 [Photo]', timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: `⚠️ Cannot create a new garden plan: you have reached the maximum of ${MAX_GARDENS} active chats. Please delete (✕) one of your existing gardens in the left sidebar first.`,
          timestamp: new Date().toISOString(),
        },
      ];
      messageInput.value = '';
      photoInput.value = '';
      photoPreviewBar.classList.add('hidden');
      renderAll();
      return;
    }
  }

  const activeId = currentSessionId;
  const entry = getGardenEntry(activeId);
  activeInFlight = { sessionId: activeId, taskId: null, kind: 'chat' };

  try {
    if (file) {
      const userText = text ? `📷 [Photo: ${file.name}] ${text}` : `📷 [Photo: ${file.name}]`;
      entry.session.conversationHistory = [
        ...(entry.session.conversationHistory || []),
        { role: 'user', content: userText, timestamp: new Date().toISOString() },
      ];
      messageInput.value = '';
      photoInput.value = '';
      photoPreviewBar.classList.add('hidden');
      renderAll();

      const formData = new FormData();
      formData.append('photo', file);
      if (text) formData.append('message', text);

      const res = await fetch(`/api/sessions/${activeId}/photo`, {
        method: 'POST',
        body: formData,
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Photo upload failed');

      const replyText = data.recommendation || 'Photo analyzed and tasks updated.';
      entry.session.conversationHistory = [
        ...(entry.session.conversationHistory || []),
        { role: 'assistant', content: replyText, timestamp: new Date().toISOString() },
      ];
      entry.session.gardenState = {
        ...(entry.session.gardenState || {}),
        currentPhase: data.updatedPhase || entry.session.gardenState?.currentPhase || 'PLANTING',
        currentPlan: data.currentPlan || entry.session.gardenState?.currentPlan || null,
      };
      entry.session.tasks = data.updatedTasks || entry.session.tasks || [];
      entry.lastInspector = data;
    } else {
      entry.session.conversationHistory = [
        ...(entry.session.conversationHistory || []),
        { role: 'user', content: text, timestamp: new Date().toISOString() },
      ];
      messageInput.value = '';
      renderAll();

      const res = await fetch(`/api/sessions/${activeId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Message failed');

      entry.session.conversationHistory = [
        ...(entry.session.conversationHistory || []),
        { role: 'assistant', content: data.reply, timestamp: new Date().toISOString() },
      ];
      entry.session.gardenState = {
        ...(entry.session.gardenState || {}),
        context: data.context || entry.session.gardenState?.context || {},
        currentPhase: data.currentPhase || entry.session.gardenState?.currentPhase || 'PLANTING',
        currentPlan: data.currentPlan || entry.session.gardenState?.currentPlan || null,
      };
      entry.session.tasks = data.tasks || entry.session.tasks || [];
      entry.lastInspector = data;
    }
  } catch (err) {
    entry.session.conversationHistory = [
      ...(entry.session.conversationHistory || []),
      {
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString(),
        retryPayload: text
          ? {
              type: 'chat',
              sessionId: activeId,
              text,
            }
          : null,
      },
    ];
  } finally {
    activeInFlight = null;
    renderAll();
  }
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (activeInFlight) {
    showWaitNotice(sendBtn);
    return;
  }

  const text = messageInput.value.trim();
  const file = photoInput.files[0];

  if (!text && !file) return;
  await sendChatMessage(text, file, null);
});

ensureSessionsLoaded().catch(() => {});
