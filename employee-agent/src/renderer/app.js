// Renderer Application Logic

let currentScreen = 'consent';
let statsInterval = null;
let activeTimerInterval = null;
let summarySyncInterval = null;
let alertAutoHideTimer = null;

let currentAppState = {
  isLoggedIn: false,
  user: null,
  isDayStarted: false,
  startTime: null
};

let dailySummaryState = {
  baseActiveSeconds: null,
  syncedAtMs: null,
  productivityScore: 0,
  startTimeIso: null
};

let cachedTasks = [];

/**
 * Initialize application on DOM load
 */
async function init() {
  console.log('Renderer initialized');

  try {
    const appState = await window.electronAPI.getAppState();
    currentAppState = appState || currentAppState;

    const consentGiven = await window.electronAPI.getConsentStatus();

    if (!consentGiven) {
      showScreen('consent');
    } else if (!appState.isLoggedIn) {
      showScreen('login');
    } else {
      showScreen('dashboard');
      updateDashboard(appState);
      await refreshDailySummary();
      if (appState.isDayStarted) {
        startStatsUpdate();
        await loadTasks();
      } else {
        await loadTasks();
      }
      startSummarySync();
    }
  } catch (error) {
    console.error('Init error:', error);
    showScreen('login');
  }

  setupEventListeners();
  updateTodayDateBadge();
}

/**
 * Show a specific screen
 */
function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });

  const targetScreen = document.getElementById(`${screenName}Screen`);
  if (targetScreen) {
    targetScreen.classList.add('active');
    currentScreen = screenName;
  }
}

/**
 * Show inline alert on login screen
 */
function showLoginError(message) {
  const errEl = document.getElementById('loginError');
  const textEl = document.getElementById('loginErrorText');
  if (!errEl || !textEl) return;

  textEl.textContent = message;
  errEl.classList.add('visible');

  setTimeout(() => {
    errEl.classList.remove('visible');
  }, 6000);
}

/**
 * Show inline feedback alert directly on dashboard screen
 * @param {'error'|'success'|'warning'|'info'} type
 * @param {string} message
 */
function showDashboardAlert(type, message) {
  const banner = document.getElementById('dashboardAlert');
  const textEl = document.getElementById('dashboardAlertText');
  if (!banner || !textEl) return;

  if (alertAutoHideTimer) {
    clearTimeout(alertAutoHideTimer);
    alertAutoHideTimer = null;
  }

  banner.className = `alert-banner visible ${type || 'info'}`;
  textEl.textContent = message;

  if (type === 'success' || type === 'info') {
    alertAutoHideTimer = setTimeout(() => {
      hideDashboardAlert();
    }, 6000);
  }
}

function hideDashboardAlert() {
  const banner = document.getElementById('dashboardAlert');
  if (banner) {
    banner.className = 'alert-banner';
  }
}

/**
 * Format duration in seconds to readable Hh MMm SSs
 */
function formatDurationSeconds(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Format ISO timestamp to local HH:MM
 */
function formatClockTime(isoString) {
  if (!isoString) return '--:--';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Update header date badge
 */
function updateTodayDateBadge() {
  const badge = document.getElementById('todayDateBadge');
  if (!badge) return;
  const now = new Date();
  badge.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Fetch authoritative daily summary from backend
 */
async function refreshDailySummary() {
  if (!window.electronAPI.getDailySummary) return;

  try {
    const res = await window.electronAPI.getDailySummary();
    if (res && res.success && res.summary && res.summary.metrics) {
      const m = res.summary.metrics;
      dailySummaryState.baseActiveSeconds = Number(m.activeSeconds || 0);
      dailySummaryState.syncedAtMs = Date.now();
      dailySummaryState.productivityScore = Number(m.productivityScore || 0);
      updateActiveTimeUI();
    }
  } catch (error) {
    console.warn('Could not refresh daily summary:', error.message);
  }
}

/**
 * Recompute and render Today's Active Time card
 */
function updateActiveTimeUI() {
  const activeTimeDisplay = document.getElementById('activeTimeDisplay');
  const startTimeLabel = document.getElementById('startTimeLabel');
  const productivityBadge = document.getElementById('productivityBadge');
  const activeHeroCard = document.getElementById('activeHeroCard');

  if (!activeTimeDisplay) return;

  const isStarted = Boolean(currentAppState.isDayStarted);

  if (activeHeroCard) {
    activeHeroCard.classList.toggle('inactive-state', !isStarted);
  }

  let displaySeconds = 0;

  if (isStarted) {
    if (dailySummaryState.baseActiveSeconds !== null && dailySummaryState.syncedAtMs) {
      const elapsedSinceSync = Math.max(0, Math.floor((Date.now() - dailySummaryState.syncedAtMs) / 1000));
      displaySeconds = dailySummaryState.baseActiveSeconds + elapsedSinceSync;
    } else if (currentAppState.startTime) {
      const startMs = new Date(currentAppState.startTime).getTime();
      if (!Number.isNaN(startMs)) {
        displaySeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      }
    }
  } else if (dailySummaryState.baseActiveSeconds !== null) {
    // Freeze at verified today total when day is ended or standby
    displaySeconds = dailySummaryState.baseActiveSeconds;
  }

  activeTimeDisplay.textContent = formatDurationSeconds(displaySeconds);

  if (startTimeLabel) {
    startTimeLabel.textContent = formatClockTime(currentAppState.startTime || dailySummaryState.startTimeIso);
  }

  if (productivityBadge) {
    const pct = dailySummaryState.productivityScore || 0;
    productivityBadge.textContent = `${pct}% Prod`;
  }
}

/**
 * Start live 1-second timer tick for active time display
 */
function startActiveTimerLoop() {
  updateActiveTimeUI();
  if (activeTimerInterval) return;

  activeTimerInterval = setInterval(() => {
    updateActiveTimeUI();
  }, 1000);
}

function stopActiveTimerLoop() {
  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }
}

/**
 * Start periodic 15s backend daily-summary sync while on dashboard
 */
function startSummarySync() {
  if (summarySyncInterval) return;

  summarySyncInterval = setInterval(() => {
    if (currentScreen === 'dashboard' && currentAppState.isLoggedIn) {
      refreshDailySummary();
    }
  }, 15000);
}

function stopSummarySync() {
  if (summarySyncInterval) {
    clearInterval(summarySyncInterval);
    summarySyncInterval = null;
  }
}

/**
 * Setup UI event listeners
 */
function setupEventListeners() {
  const alertCloseBtn = document.getElementById('dashboardAlertClose');
  if (alertCloseBtn) {
    alertCloseBtn.addEventListener('click', hideDashboardAlert);
  }

  // Consent button
  const consentBtn = document.getElementById('consentBtn');
  if (consentBtn) {
    consentBtn.addEventListener('click', async () => {
      consentBtn.disabled = true;
      await window.electronAPI.giveConsent();
      const appState = await window.electronAPI.getAppState();
      currentAppState = appState || currentAppState;
      if (appState.isLoggedIn) {
        showScreen('dashboard');
        updateDashboard(appState);
        await refreshDailySummary();
        startSummarySync();
      } else {
        showScreen('login');
      }
      consentBtn.disabled = false;
    });
  }

  // Login button
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      if (!email || !password) {
        showLoginError('Please enter your work email and password.');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in...';

      const result = await window.electronAPI.login({ email, password });

      if (result.success) {
        const appState = await window.electronAPI.getAppState();
        currentAppState = appState || currentAppState;
        showScreen('dashboard');
        updateDashboard(appState);
        await refreshDailySummary();
        await loadTasks();
        startSummarySync();
        if (appState.isDayStarted) {
          startStatsUpdate();
        }
      } else {
        showLoginError(result.error || 'Login failed. Please check your credentials.');
      }

      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    });

    const passwordInput = document.getElementById('password');
    if (passwordInput) {
      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          loginBtn.click();
        }
      });
    }
  }

  // Start Day button
  const startDayBtn = document.getElementById('startDayBtn');
  if (startDayBtn) {
    startDayBtn.addEventListener('click', async () => {
      hideDashboardAlert();
      startDayBtn.disabled = true;
      const originalHtml = startDayBtn.innerHTML;
      startDayBtn.textContent = 'Starting Day...';

      const result = await window.electronAPI.startDay();

      if (result.success) {
        const appState = await window.electronAPI.getAppState();
        currentAppState = appState || currentAppState;
        updateDashboard(appState);
        await refreshDailySummary();
        startStatsUpdate();
        await loadTasks();
        showDashboardAlert('success', 'Work day started! Activity tracking is now active.');
      } else {
        showDashboardAlert('error', result.error || 'Failed to start work day.');
      }

      startDayBtn.disabled = false;
      startDayBtn.innerHTML = originalHtml;
    });
  }

  // End Day button
  const endDayBtn = document.getElementById('endDayBtn');
  if (endDayBtn) {
    endDayBtn.addEventListener('click', async () => {
      await handleEndDayClick();
    });
  }

  // Quick Daily Progress drawer controls
  const cancelProgressBtn = document.getElementById('cancelProgressBtn');
  if (cancelProgressBtn) {
    cancelProgressBtn.addEventListener('click', () => {
      hideQuickProgressCard();
    });
  }

  const saveProgressEndBtn = document.getElementById('saveProgressEndBtn');
  if (saveProgressEndBtn) {
    saveProgressEndBtn.addEventListener('click', async () => {
      await handleSaveProgressAndEndDay();
    });
  }

  // Active Task dropdown
  const activeTaskSelect = document.getElementById('activeTaskSelect');
  if (activeTaskSelect && window.electronAPI.setActiveTask) {
    activeTaskSelect.addEventListener('change', async () => {
      const taskId = activeTaskSelect.value || null;
      await window.electronAPI.setActiveTask(taskId);
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      stopStatsUpdate();
      stopActiveTimerLoop();
      stopSummarySync();
      hideQuickProgressCard();
      hideDashboardAlert();
      await window.electronAPI.logout();
      dailySummaryState = {
        baseActiveSeconds: null,
        syncedAtMs: null,
        productivityScore: 0,
        startTimeIso: null
      };
      showScreen('login');
      document.getElementById('password').value = '';
    });
  }
}

/**
 * Execute End Day flow with clear UI feedback & daily progress fallback
 */
async function handleEndDayClick() {
  const endDayBtn = document.getElementById('endDayBtn');
  if (!endDayBtn) return;

  hideDashboardAlert();
  endDayBtn.disabled = true;
  const originalHtml = endDayBtn.innerHTML;
  endDayBtn.textContent = 'Ending Day...';

  try {
    const result = await window.electronAPI.endDay();

    if (result.success) {
      hideQuickProgressCard();
      stopStatsUpdate();
      const appState = await window.electronAPI.getAppState();
      currentAppState = appState || currentAppState;
      updateDashboard(appState);
      await refreshDailySummary();
      showDashboardAlert('success', result.message || 'Work day ended cleanly. Great work today!');
    } else if (result.code === 'PROGRESS_NOT_SET') {
      showDashboardAlert(
        'warning',
        'Daily progress update is required before ending your day. Fill out the quick update below or update it on the web Progress tab.'
      );
      await openQuickProgressCard();
    } else {
      showDashboardAlert('error', result.error || 'Failed to end day. Please try again.');
    }
  } catch (error) {
    showDashboardAlert('error', error.message || 'Unexpected error ending day.');
  } finally {
    endDayBtn.disabled = false;
    endDayBtn.innerHTML = originalHtml;
  }
}

/**
 * Open inline Quick Daily Progress card prefilled with user tasks
 */
async function openQuickProgressCard() {
  const card = document.getElementById('quickProgressCard');
  const select = document.getElementById('progressTaskSelect');
  const activeTaskSelect = document.getElementById('activeTaskSelect');
  if (!card || !select) return;

  if (cachedTasks.length === 0) {
    await loadTasks();
  }

  select.innerHTML = '';
  if (cachedTasks.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No assigned tasks found';
    select.appendChild(opt);
  } else {
    cachedTasks.forEach((task) => {
      const opt = document.createElement('option');
      opt.value = task._id;
      opt.textContent = task.title || 'Untitled Task';
      select.appendChild(opt);
    });
    if (activeTaskSelect && activeTaskSelect.value) {
      select.value = activeTaskSelect.value;
    }
  }

  card.classList.add('visible');
  const notesEl = document.getElementById('progressNotes');
  if (notesEl) notesEl.focus();
}

function hideQuickProgressCard() {
  const card = document.getElementById('quickProgressCard');
  if (card) {
    card.classList.remove('visible');
  }
}

/**
 * Submit progress update and automatically retry End Day
 */
async function handleSaveProgressAndEndDay() {
  const saveBtn = document.getElementById('saveProgressEndBtn');
  const taskId = document.getElementById('progressTaskSelect')?.value;
  const pct = document.getElementById('progressPercent')?.value || '75';
  const notes = document.getElementById('progressNotes')?.value?.trim() || '';

  if (!taskId) {
    showDashboardAlert('error', 'No assigned task available here. Please submit daily progress from the web Progress tab.');
    return;
  }

  if (!notes) {
    showDashboardAlert('warning', 'Please enter a brief note describing today’s work.');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const progRes = await window.electronAPI.submitProgress({
      taskId,
      progressPercentage: Number(pct),
      notes,
      achievements: notes
    });

    if (!progRes || !progRes.success) {
      showDashboardAlert('error', progRes?.error || 'Could not save daily progress.');
      return;
    }

    hideQuickProgressCard();
    document.getElementById('progressNotes').value = '';
    await handleEndDayClick();
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Progress & End Day';
  }
}

/**
 * Compute crisp two-letter initials for employee avatar
 */
function getInitials(name) {
  if (!name || typeof name !== 'string') return 'EM';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Update dashboard display with app state
 */
function updateDashboard(appState) {
  currentAppState = appState || currentAppState;
  if (currentAppState.startTime) {
    dailySummaryState.startTimeIso = currentAppState.startTime;
  }
  const userNameEl = document.getElementById('userName');
  const userEmailEl = document.getElementById('userEmail');
  const userAvatarEl = document.getElementById('userAvatar');
  const trackingStatus = document.getElementById('trackingStatus');
  const trackingStatusText = document.getElementById('trackingStatusText');
  const startDayBtn = document.getElementById('startDayBtn');
  const endDayBtn = document.getElementById('endDayBtn');
  const statsContainer = document.getElementById('statsContainer');
  const taskBox = document.getElementById('taskBox');

  if (appState.user) {
    const name = appState.user.name || 'Employee';
    userNameEl.textContent = name;
    userEmailEl.textContent = appState.user.email || '';
    if (userAvatarEl) {
      userAvatarEl.textContent = getInitials(name);
    }
  }

  if (appState.isDayStarted) {
    trackingStatus.className = 'status-pill active';
    if (trackingStatusText) trackingStatusText.textContent = 'Tracking Active';
    startDayBtn.style.display = 'none';
    endDayBtn.style.display = 'inline-flex';
    statsContainer.style.display = 'grid';
    if (taskBox) taskBox.style.display = 'block';
    startActiveTimerLoop();
  } else {
    trackingStatus.className = 'status-pill inactive';
    if (trackingStatusText) trackingStatusText.textContent = 'Standby';
    startDayBtn.style.display = 'inline-flex';
    endDayBtn.style.display = 'none';
    statsContainer.style.display = 'none';
    if (taskBox) taskBox.style.display = 'none';
    stopActiveTimerLoop();
    updateActiveTimeUI();
  }
}

/**
 * Load assigned tasks into dropdown
 */
async function loadTasks() {
  if (!window.electronAPI.getTasks) return;
  try {
    const tasks = await window.electronAPI.getTasks();
    renderTasks(tasks);
  } catch (e) {
    console.warn('Could not load tasks:', e.message);
  }
}

function renderTasks(tasks) {
  cachedTasks = Array.isArray(tasks) ? tasks : [];
  const select = document.getElementById('activeTaskSelect');
  if (!select) return;

  const previous = select.value;
  select.innerHTML = '<option value="">— Not attributed to a task —</option>';

  cachedTasks.forEach((task) => {
    const opt = document.createElement('option');
    opt.value = task._id;
    opt.textContent = task.status ? `${task.title} (${task.status})` : task.title;
    select.appendChild(opt);
  });

  if (previous) select.value = previous;
}

/**
 * Update TRINETRA capture indicator
 */
function updateCaptureStatus(status) {
  const dot = document.getElementById('captureDot');
  const text = document.getElementById('captureStatus');
  const next = document.getElementById('captureNext');
  if (!dot || !text || !next) return;

  if (!status || !status.running) {
    dot.className = 'capture-dot';
    text.textContent = 'Capture: standby';
    next.textContent = '';
    return;
  }

  if (status.paused) {
    dot.className = 'capture-dot paused';
    text.textContent = `Capture paused (${status.pauseReason || 'idle'})`;
    next.textContent = '';
    return;
  }

  dot.className = 'capture-dot active';
  text.textContent = `Capture active (${status.captureCount || 0} today)`;

  if (status.nextCaptureInMs != null) {
    const mins = Math.max(0, Math.round(status.nextCaptureInMs / 60000));
    next.textContent = mins <= 1 ? 'next <1m' : `next ~${mins}m`;
  } else {
    next.textContent = '';
  }
}

/**
 * Update activity telemetry counters from main process
 */
async function updateStats() {
  try {
    const stats = await window.electronAPI.getTrackingStats();
    const mouseCountEl = document.getElementById('mouseCount');
    const keyCountEl = document.getElementById('keyCount');
    const activeAppEl = document.getElementById('activeApp');
    const idleTimeEl = document.getElementById('idleTime');

    if (mouseCountEl) mouseCountEl.textContent = (stats.mouseEvents || 0).toLocaleString();
    if (keyCountEl) keyCountEl.textContent = (stats.keyboardEvents || 0).toLocaleString();

    if (activeAppEl) {
      const appName = stats.activeApp || 'Desktop';
      activeAppEl.textContent = appName;
      activeAppEl.title = appName;
    }

    if (idleTimeEl) {
      const idle = stats.idleSeconds || 0;
      if (idle < 60) {
        idleTimeEl.textContent = `${idle}s`;
      } else {
        idleTimeEl.textContent = `${Math.floor(idle / 60)}m ${idle % 60}s`;
      }
    }

    if (window.electronAPI.getScreenshotStatus) {
      const ss = await window.electronAPI.getScreenshotStatus();
      updateCaptureStatus(ss);
    }
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

function startStatsUpdate() {
  updateStats();
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(updateStats, 2000);
}

function stopStatsUpdate() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// IPC listeners from main process
if (window.electronAPI.onTasksUpdated) {
  window.electronAPI.onTasksUpdated((tasks) => {
    if (currentScreen === 'dashboard') renderTasks(tasks);
  });
}

if (window.electronAPI.onScreenshotStatus) {
  window.electronAPI.onScreenshotStatus((status) => {
    if (currentScreen === 'dashboard') updateCaptureStatus(status);
  });
}

window.electronAPI.onShowConsent(() => {
  showScreen('consent');
});

window.electronAPI.onShowLogin(() => {
  stopStatsUpdate();
  stopActiveTimerLoop();
  stopSummarySync();
  showScreen('login');
});

if (window.electronAPI.onShowDashboard) {
  window.electronAPI.onShowDashboard(async () => {
    showScreen('dashboard');
    const appState = await window.electronAPI.getAppState();
    updateDashboard(appState);
    await refreshDailySummary();
    await loadTasks();
    startSummarySync();
    if (appState.isDayStarted) {
      startStatsUpdate();
    }
  });
}

window.addEventListener('focus', async () => {
  if (currentScreen === 'dashboard') {
    const appState = await window.electronAPI.getAppState();
    updateDashboard(appState);
    await refreshDailySummary();
    if (appState.isDayStarted) {
      startStatsUpdate();
    }
  }
});

window.electronAPI.onDayStatusChanged(async (data) => {
  console.log('Day status changed from backend:', data);
  const appState = await window.electronAPI.getAppState();

  if (currentScreen === 'dashboard') {
    updateDashboard(appState);
    await refreshDailySummary();

    if (appState.isDayStarted) {
      startStatsUpdate();
      await loadTasks();
    } else {
      stopStatsUpdate();
    }
  }
});

document.addEventListener('DOMContentLoaded', init);
