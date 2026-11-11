// App State
let currentScreen = 'consent';
let updateInterval = null;

// Initialize app
async function init() {
  const consentGiven = await window.electronAPI.getConsentStatus();
  const appState = await window.electronAPI.getAppState();

  if (!consentGiven) {
    showScreen('consent');
  } else if (!appState.isLoggedIn) {
    showScreen('login');
  } else {
    showScreen('dashboard');
    updateDashboard(appState);
    if (appState.isDayStarted) {
      startStatsUpdate();
    }
    loadTasks();
  }

  setupEventListeners();
}

// Screen Management
function showScreen(screenName) {
  const screens = ['consent', 'login', 'dashboard'];
  screens.forEach(screen => {
    const element = document.getElementById(`${screen}Screen`);
    if (element) {
      element.classList.remove('active');
    }
  });

  const activeScreen = document.getElementById(`${screenName}Screen`);
  if (activeScreen) {
    activeScreen.classList.add('active');
  }
  currentScreen = screenName;
}

function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.add('show');
    setTimeout(() => {
      errorElement.classList.remove('show');
    }, 5000);
  }
}

// Event Listeners
function setupEventListeners() {
  // Consent Screen
  const acceptConsentBtn = document.getElementById('acceptConsentBtn');
  const consentCheckbox = document.getElementById('consentCheckbox');

  if (acceptConsentBtn) {
    acceptConsentBtn.addEventListener('click', async () => {
      if (!consentCheckbox.checked) {
        showError('consentError', 'You must accept the consent to continue');
        return;
      }

      const result = await window.electronAPI.giveConsent();
      if (result.success) {
        showScreen('login');
      }
    });
  }

  // Login Screen
  const loginBtn = document.getElementById('loginBtn');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showError('loginError', 'Please enter both email and password');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Logging in...';

      const result = await window.electronAPI.login({ email, password });

      if (result.success) {
        showScreen('dashboard');
        const appState = await window.electronAPI.getAppState();
        updateDashboard(appState);
        startStatsUpdate();
      } else {
        showError('loginError', result.error || 'Login failed. Please check your credentials.');
      }

      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    });
  }

  // Allow Enter key to submit login
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        loginBtn.click();
      }
    });
  }

  // Dashboard Screen
  const startDayBtn = document.getElementById('startDayBtn');
  const endDayBtn = document.getElementById('endDayBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (startDayBtn) {
    startDayBtn.addEventListener('click', async () => {
      startDayBtn.disabled = true;
      startDayBtn.textContent = 'Starting...';

      const result = await window.electronAPI.startDay();

      if (result.success) {
        const appState = await window.electronAPI.getAppState();
        updateDashboard(appState);
        startStatsUpdate();
      } else {
        showError('loginError', result.error || 'Failed to start day');
      }

      startDayBtn.disabled = false;
      startDayBtn.textContent = 'Start Day';
    });
  }

  if (endDayBtn) {
    endDayBtn.addEventListener('click', async () => {
      endDayBtn.disabled = true;
      endDayBtn.textContent = 'Ending...';

      const result = await window.electronAPI.endDay();

      if (result.success) {
        const appState = await window.electronAPI.getAppState();
        updateDashboard(appState);
        stopStatsUpdate();
      } else {
        showError('loginError', result.error || 'Failed to end day');
      }

      endDayBtn.disabled = false;
      endDayBtn.textContent = 'End Day';
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.electronAPI.logout();
      stopStatsUpdate();
      showScreen('login');
      
      // Clear form
      emailInput.value = '';
      passwordInput.value = '';
    });
  }

  // Task attribution selector (TRINETRA)
  const activeTaskSelect = document.getElementById('activeTaskSelect');
  if (activeTaskSelect) {
    activeTaskSelect.addEventListener('change', async (event) => {
      const taskId = event.target.value || null;
      try {
        await window.electronAPI.setActiveTask(taskId);
      } catch (error) {
        console.warn('Could not set active task:', error.message);
      }
    });
  }
}

// Active session start time tracker
let currentStartTime = null;

function formatActiveTime(startTime) {
  if (!startTime) return '00:00:00';
  const start = new Date(startTime).getTime();
  if (isNaN(start)) return '00:00:00';
  const diff = Math.max(0, Date.now() - start);
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Dashboard Updates
function updateDashboard(appState) {
  const userNameElement = document.getElementById('userName');
  const userEmailElement = document.getElementById('userEmail');
  const trackingStatusElement = document.getElementById('trackingStatus');
  const startDayBtn = document.getElementById('startDayBtn');
  const endDayBtn = document.getElementById('endDayBtn');
  const statsContainer = document.getElementById('statsContainer');

  if (appState.startTime) {
    currentStartTime = appState.startTime;
  } else if (!appState.isDayStarted) {
    currentStartTime = null;
  }

  if (userNameElement && appState.user) {
    userNameElement.textContent = appState.user.name || appState.user.email?.split('@')[0] || 'Employee';
  }

  if (userEmailElement && appState.user) {
    userEmailElement.textContent = appState.user.email || '';
  }

  if (trackingStatusElement) {
    if (appState.isDayStarted) {
      trackingStatusElement.textContent = 'Tracking Active';
      trackingStatusElement.classList.remove('status-inactive');
      trackingStatusElement.classList.add('status-active');
    } else {
      trackingStatusElement.textContent = 'Day Not Started';
      trackingStatusElement.classList.remove('status-active');
      trackingStatusElement.classList.add('status-inactive');
    }
  }

  if (startDayBtn && endDayBtn) {
    if (appState.isDayStarted) {
      startDayBtn.style.display = 'none';
      endDayBtn.style.display = 'block';
    } else {
      startDayBtn.style.display = 'block';
      endDayBtn.style.display = 'none';
    }
  }

  if (statsContainer) {
    statsContainer.style.display = appState.isDayStarted ? 'grid' : 'none';
  }

  const taskBox = document.getElementById('taskBox');
  if (taskBox) {
    taskBox.style.display = appState.isDayStarted ? 'block' : 'none';
  }
}

// ---------------------------------------------------------------------------
// TRINETRA: task attribution + capture telemetry
// ---------------------------------------------------------------------------

let captureInterval = null;

async function loadTasks() {
  try {
    const result = await window.electronAPI.getTasks();
    renderTasks(result?.tasks || []);
  } catch (error) {
    console.warn('Could not load assigned tasks:', error.message);
  }
}

function renderTasks(tasks) {
  const select = document.getElementById('activeTaskSelect');
  if (!select) return;

  const previous = select.value;
  select.innerHTML = '<option value="">— Not attributed to a task —</option>';

  tasks.forEach((task) => {
    const option = document.createElement('option');
    option.value = task.task_id || task.id;
    option.textContent = task.title;
    option.title = `${task.status}${task.due_date ? ' · due ' + new Date(task.due_date).toLocaleDateString() : ''}`;
    select.appendChild(option);
  });

  if (previous && Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

async function updateCaptureStatus() {
  const statusText = document.getElementById('captureStatus');
  const nextText = document.getElementById('captureNext');
  const dot = document.getElementById('captureDot');
  if (!statusText || !dot) return;

  try {
    const status = await window.electronAPI.getScreenshotStatus();

    if (!status || !status.running) {
      dot.className = 'capture-dot';
      statusText.textContent = 'Capture: stopped';
      if (nextText) nextText.textContent = '';
      return;
    }

    if (!status.periodic_enabled) {
      dot.className = 'capture-dot off';
      statusText.textContent = 'Capture: policy (no periodic)';
      if (nextText) nextText.textContent = '';
      return;
    }

    dot.className = 'capture-dot on';
    const last = status.last_capture_at ? new Date(status.last_capture_at) : null;
    statusText.textContent = last
      ? `Capture: last ${last.toLocaleTimeString()}`
      : 'Capture: armed';

    if (nextText) {
      nextText.textContent = status.next_capture_at
        ? `next ~${new Date(status.next_capture_at).toLocaleTimeString()}`
        : '';
    }
  } catch (error) {
    // Non-fatal: capture status is informational only.
  }
}

async function updateStats() {
  const stats = await window.electronAPI.getTrackingStats();
  
  if (stats) {
    const mouseCount = document.getElementById('mouseCount');
    const keyCount = document.getElementById('keyCount');
    const idleTime = document.getElementById('idleTime');
    const activeApp = document.getElementById('activeApp');

    if (mouseCount) mouseCount.textContent = (stats.mouseEvents || 0).toLocaleString();
    if (keyCount) keyCount.textContent = (stats.keyboardEvents || 0).toLocaleString();
    if (idleTime) idleTime.textContent = `${stats.idleSeconds || 0}s`;
    if (activeApp) {
      const appName = stats.activeApp || 'Desktop';
      activeApp.textContent = appName;
      activeApp.title = appName;
    }

    // Auto-heal if user name is still showing placeholder 'Employee'
    const userNameEl = document.getElementById('userName');
    if (userNameEl && (userNameEl.textContent === 'Employee' || !userNameEl.textContent.trim())) {
      window.electronAPI.getAppState().then(state => {
        if (state && state.user && state.user.name && state.user.name !== 'Employee') {
          updateDashboard(state);
        }
      }).catch(() => {});
    }
  }
}

function startStatsUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  // Update stats every 1 second for live feedback
  updateInterval = setInterval(updateStats, 1000);
  updateStats(); // Initial update

  if (captureInterval) clearInterval(captureInterval);
  captureInterval = setInterval(updateCaptureStatus, 5000);
  updateCaptureStatus();
}

function stopStatsUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
}

// Listen for IPC events
window.electronAPI.onTasksUpdated((data) => {
  renderTasks(data?.tasks || []);
});

window.electronAPI.onScreenshotStatus((status) => {
  if (currentScreen === 'dashboard') {
    updateCaptureStatus();
  }
});

window.electronAPI.onShowConsent(() => {
  showScreen('consent');
});

window.electronAPI.onShowLogin(() => {
  showScreen('login');
});

if (window.electronAPI.onShowDashboard) {
  window.electronAPI.onShowDashboard(async () => {
    showScreen('dashboard');
    const appState = await window.electronAPI.getAppState();
    updateDashboard(appState);
    if (appState.isDayStarted) {
      startStatsUpdate();
    }
  });
}

// When window comes into focus, refresh immediately
window.addEventListener('focus', async () => {
  if (currentScreen === 'dashboard') {
    const appState = await window.electronAPI.getAppState();
    updateDashboard(appState);
    if (appState.isDayStarted) {
      startStatsUpdate();
    }
  }
});

// Listen for day status changes from backend polling
window.electronAPI.onDayStatusChanged(async (data) => {
  console.log('📡 Day status changed from backend:', data);
  
  // Get fresh app state
  const appState = await window.electronAPI.getAppState();
  
  // Update dashboard if we're on the dashboard screen
  if (currentScreen === 'dashboard') {
    updateDashboard(appState);
    
    if (appState.isDayStarted) {
      startStatsUpdate();
      loadTasks();
    } else {
      stopStatsUpdate();
    }
  }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
