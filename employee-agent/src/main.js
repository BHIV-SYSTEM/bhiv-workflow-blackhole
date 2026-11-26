const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const Store = require('electron-store');
const ActivityTracker = require('./managers/activityTracker');
const AttendanceStatusPoller = require('./managers/attendancePoller');
const ScreenshotEngine = require('./managers/screenshotEngine');
const ApiService = require('./services/apiService');

// Initialize store for persistent data
const store = new Store();

// A single agent must own tracking. Without this lock, a boot-started login
// item plus a manual double-click runs two agents that fight over counters,
// the electron-store config and duplicate activity payloads.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// checkAttendanceStatus() never throws — it returns {error:true} for both a
// rejected token and a transient network failure. Only auth-shaped errors
// should trigger a re-login; everything else is recoverable by the poller.
function isAuthFailure(status) {
  return /401|403|unauthorized|not valid|authorization denied/i.test(
    String(status?.errorMessage || '')
  );
}

function loadEnvConfig() {
  const envPath = path.join(__dirname, '../.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          env[match[1].trim()] = match[2].trim();
        }
      }
    });
  }
  return env;
}

const envConfig = loadEnvConfig();

let tray = null;
let mainWindow = null;
let activityTracker = null;
let attendancePoller = null;
let agentHeartbeatTimer = null;
let apiService = null;
let screenshotEngine = null;
let assignedTasks = [];
let assignedAims = [];

// App state
let appState = {
  isLoggedIn: false,
  isDayStarted: false,
  dayEndedToday: false,
  user: null,
  startTime: null,
  endTime: null,
  consentGiven: true
};

function createWindow() {
  const windowOptions = {
    width: 460,
    height: 740,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: '#090d16',
    title: 'Infiverse Activity Agent',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    frame: true,
    resizable: true
  };
  
  // Add icon if file exists
  const iconPath = path.join(__dirname, '../assets/icon.png');
  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }
  
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    store.set('consentGiven', true);
    appState.consentGiven = true;

    // Always surface the window on launch so the agent appears in the
    // taskbar immediately (closing it still hides it to the tray).
    if (appState.isLoggedIn) {
      mainWindow.webContents.send('show-dashboard', { user: appState.user });
    } else {
      mainWindow.webContents.send('show-login');
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

function createTray() {
  const icoPath = path.join(__dirname, '../assets/icon.ico');
  const pngPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon;

  if (process.platform === 'win32' && fs.existsSync(icoPath)) {
    icon = nativeImage.createFromPath(icoPath);
  } else if (fs.existsSync(pngPath)) {
    icon = nativeImage.createFromPath(pngPath);
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 22, height: 22 });
    }
  } else {
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABHSURBVDiN7dMxDgAgCAPA1v//5o6NJk0aF3EgJCRwAwAA/1YZY1lr7d57cc49hqiqqqoqMzPGmKp67NZ1XVVVVd/rAwD8sQNJMwstxTIWbQAAAABJRU5ErkJggg==');
  }
  
  tray = new Tray(icon);
  updateTrayMenu();
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.webContents.send('show-dashboard');
      }
    }
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: appState.isLoggedIn ? `Logged in as: ${appState.user?.email || 'User'}` : 'Not logged in',
      enabled: false
    },
    { type: 'separator' },
    {
      label: appState.isDayStarted ? 'Day Started ✓' : 'Day Not Started',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('show-dashboard');
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  const status = appState.isDayStarted ? 'Tracking Active' : 'Tracking Inactive';
  tray.setToolTip(`Employee Agent - ${status}`);
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/**
 * Start both collectors for an open workday. Kept in one place so attendance,
 * activity and screenshot capture can never drift out of sync.
 */
async function beginTracking(attendanceId, startTime = null, forceReset = false) {
  if (!attendanceId) return;

  if (activityTracker) {
    activityTracker.start(attendanceId, startTime, forceReset);
  }

  // Restore the task the employee had selected before the app restarted.
  const rawStoredTaskId = store.get('activeTaskId');
  const storedTaskId =
    rawStoredTaskId && rawStoredTaskId !== 'undefined' && rawStoredTaskId !== 'null'
      ? String(rawStoredTaskId)
      : null;
  if (rawStoredTaskId && !storedTaskId) {
    store.set('activeTaskId', null);
  }
  if (storedTaskId) {
    if (activityTracker) activityTracker.setActiveTask(storedTaskId);
    if (screenshotEngine) screenshotEngine.setActiveTask(storedTaskId);
  }

  if (screenshotEngine) {
    try {
      await screenshotEngine.start(attendanceId);
    } catch (error) {
      console.warn('Screenshot engine failed to start:', error.message);
    }
  }

  refreshTasks().catch(() => {});
}

async function endTracking() {
  if (activityTracker) {
    await activityTracker.stop();
  }
  if (screenshotEngine) {
    screenshotEngine.stop();
  }
}

async function refreshTasks() {
  if (!apiService) return { success: false, tasks: [], aims: [] };
  const result = await apiService.fetchMyTasks();
  if (result.success) {
    assignedTasks = result.tasks || [];
    assignedAims = result.aims || [];
    sendToRenderer('tasks-updated', { tasks: assignedTasks, aims: assignedAims });
  }
  return result;
}

// IPC Handlers
ipcMain.handle('get-consent-status', () => {
  return appState.consentGiven;
});

ipcMain.handle('give-consent', () => {
  appState.consentGiven = true;
  store.set('consentGiven', true);
  return { success: true };
});

ipcMain.handle('login', async (event, credentials) => {
  try {
    const result = await apiService.login(credentials);
    
    if (result.success) {
      appState.isLoggedIn = true;
      appState.user = result.user;
      store.set('authToken', result.token);
      store.set('user', result.user);
      store.set('savedCredentials', credentials);
      apiService.setAuthToken(result.token);
      store.set('apiBaseUrl', apiService.getBaseUrl());
      
      startAttendancePoller();
      startAgentHeartbeat();
      
      const currentStatus = await apiService.checkAttendanceStatus();
      if (currentStatus.dayStarted && !appState.isDayStarted) {
        console.log('🟢 Day already started on backend! Syncing...');
        appState.isDayStarted = true;
        await beginTracking(currentStatus.attendanceId);
      }
      
      updateTrayMenu();
      
      if (mainWindow) {
        mainWindow.webContents.send('day-status-changed', { 
          dayStarted: appState.isDayStarted,
          attendanceId: currentStatus.attendanceId 
        });
      }
    }
    
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout', async () => {
  if (attendancePoller) {
    attendancePoller.stop();
  }
  stopAgentHeartbeat();
  
  if (appState.isDayStarted) {
    await Promise.resolve(endTracking());
    appState.isDayStarted = false;
    appState.startTime = null;
  }
  
  appState.isLoggedIn = false;
  appState.user = null;
  appState.startTime = null;
  store.delete('authToken');
  store.delete('savedCredentials');
  apiService.setAuthToken(null);
  updateTrayMenu();
  
  return { success: true };
});

ipcMain.handle('start-day', async (event, payload) => {
  try {
    const result = await apiService.startDay(payload || {});
    if (result.success) {
      appState.isDayStarted = true;
      appState.dayEndedToday = false;
      appState.startTime = result.startTime || new Date().toISOString();
      appState.endTime = null;
      await beginTracking(result.attendanceId, appState.startTime, true);
      if (attendancePoller) {
        attendancePoller.currentStatus.dayStarted = true;
        attendancePoller.currentStatus.dayEndedToday = false;
        attendancePoller.currentStatus.attendanceId = result.attendanceId || null;
        attendancePoller.currentStatus.startTime = appState.startTime;
        attendancePoller.currentStatus.endTime = null;
      }
      updateTrayMenu();
      sendToRenderer('day-status-changed', {
        dayStarted: true,
        dayEndedToday: false,
        attendanceId: result.attendanceId || null,
        startTime: appState.startTime
      });
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('end-day', async () => {
  try {
    const result = await apiService.endDay();
    if (result.success) {
      const endTimeIso = (result.data && result.data.endTime) || new Date().toISOString();
      appState.isDayStarted = false;
      appState.dayEndedToday = true;
      appState.endTime = endTimeIso;
      await endTracking();
      if (attendancePoller) {
        attendancePoller.currentStatus.dayStarted = false;
        attendancePoller.currentStatus.dayEndedToday = true;
        attendancePoller.currentStatus.attendanceId = null;
        attendancePoller.currentStatus.endTime = endTimeIso;
      }
      updateTrayMenu();
      sendToRenderer('day-status-changed', {
        dayStarted: false,
        dayEndedToday: true,
        startTime: appState.startTime,
        endTime: endTimeIso
      });
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-daily-summary', async () => {
  try {
    return await apiService.getDailySummary();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('submit-progress', async (event, payload) => {
  try {
    return await apiService.submitProgress(payload);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-state', async () => {
  // Guarantee user info is loaded from token/store if not present or placeholder
  if (!appState.user || !appState.user.name || appState.user.name === 'Employee') {
    const tokenUser = apiService ? apiService.getUserFromToken() : null;
    const savedUser = store.get('user');
    if (tokenUser?.name && tokenUser.name !== 'Employee') {
      appState.user = { name: tokenUser.name, email: tokenUser.email || appState.user?.email || '' };
      store.set('user', appState.user);
    } else if (savedUser?.name && savedUser.name !== 'Employee') {
      appState.user = savedUser;
    }
  }

  if (appState.isLoggedIn && attendancePoller) {
    try {
      const currentStatus = await attendancePoller.forceCheck();
      appState.isDayStarted = currentStatus.dayStarted;
      appState.dayEndedToday = !!currentStatus.dayEndedToday;
      appState.startTime = currentStatus.startTime || null;
      appState.endTime = currentStatus.endTime || null;
      const tokenUser = apiService ? apiService.getUserFromToken() : null;
      const realName = currentStatus.userName || tokenUser?.name || appState.user?.name;
      const realEmail = currentStatus.userEmail || tokenUser?.email || appState.user?.email;
      if (realName && realName !== 'Employee') {
        appState.user = { 
          name: realName, 
          email: realEmail || '' 
        };
        store.set('user', appState.user);
      }
    } catch (error) {
      console.error('Error fetching app state:', error);
    }
  }
  
  const rawStoredTaskId = store.get('activeTaskId');
  const cleanStoredTaskId =
    rawStoredTaskId && rawStoredTaskId !== 'undefined' && rawStoredTaskId !== 'null'
      ? String(rawStoredTaskId)
      : null;
  if (rawStoredTaskId && !cleanStoredTaskId) {
    store.set('activeTaskId', null);
  }

  return {
    isLoggedIn: appState.isLoggedIn,
    isDayStarted: appState.isDayStarted,
    dayEndedToday: appState.dayEndedToday,
    user: appState.user,
    startTime: appState.startTime,
    endTime: appState.endTime,
    consentGiven: appState.consentGiven,
    activeTaskId: cleanStoredTaskId
  };
});

ipcMain.handle('get-tracking-stats', () => {
  if (activityTracker) {
    return activityTracker.getCurrentStats();
  }
  return null;
});

ipcMain.handle('get-tasks', async () => {
  if (assignedTasks.length === 0) {
    await refreshTasks().catch(() => {});
  }
  return { tasks: assignedTasks, aims: assignedAims };
});

ipcMain.handle('set-active-task', (event, taskId) => {
  const normalizedTaskId =
    taskId && taskId !== 'undefined' && taskId !== 'null' ? String(taskId) : null;
  if (activityTracker) {
    activityTracker.setActiveTask(normalizedTaskId);
  }
  if (screenshotEngine) {
    screenshotEngine.setActiveTask(normalizedTaskId);
  }
  store.set('activeTaskId', normalizedTaskId);
  return { success: true, activeTaskId: normalizedTaskId };
});

ipcMain.handle('get-screenshot-status', () => {
  return screenshotEngine ? screenshotEngine.getStatus() : null;
});

ipcMain.handle('capture-now', async () => {
  if (!screenshotEngine || !appState.isDayStarted) {
    return { captured: false, reason: 'day_not_active' };
  }
  return screenshotEngine.captureOnce('manual');
});

// App lifecycle
app.on('open-url', (event) => { event.preventDefault(); if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } });
app.whenReady().then(async () => {
  try { app.setAsDefaultProtocolClient('niyantran'); } catch (e) { console.warn('protocol register failed', e && e.message); }
  if (!gotSingleInstanceLock) return;

  // 1. Setup auto-start with Windows on PC boot
  if (process.platform === 'win32' && envConfig.AGENT_AUTO_START_ON_BOOT !== 'false') {
    try {
      // Electron 28 writes the Run entry by joining path + args with no
      // quoting, so dev builds (`electron .`) must pass the app path as a
      // quoted arg — otherwise the boot launch starts a bare electron.exe
      // with nothing to run.
      const launchArgs = app.isPackaged ? [] : [`"${app.getAppPath()}"`];
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: launchArgs
      });
      console.log('✓ Configured to launch automatically on Windows boot');
    } catch (e) {
      console.warn('Could not set Windows auto-start:', e.message);
    }
  }

  // 2. Initialize services
  apiService = new ApiService();

  // Reuse the backend that accepted the last successful login. Without this
  // the agent could restore a token issued by one database against a
  // different deployment and show no employee record/tasks.
  const savedBaseUrl = store.get('apiBaseUrl');
  if (savedBaseUrl) {
    apiService.setBaseUrl(savedBaseUrl);
    console.log('✓ Reusing saved backend:', savedBaseUrl);
  }

  activityTracker = new ActivityTracker(apiService);

  // TRINETRA periodic capture engine (starts/stops with the workday)
  screenshotEngine = new ScreenshotEngine(apiService);
  screenshotEngine.on('status', (status) => sendToRenderer('screenshot-status', status));

  // 3. Show the UI immediately. Session recovery below performs network calls
  // that can take seconds (or time out at 30s), so creating the window first
  // is what makes the agent appear on launch instead of silently starting.
  createWindow();
  createTray();
  startLocalStatusServer();

  // 4. Mark consent as automatically given
  store.set('consentGiven', true);
  appState.consentGiven = true;

  // 5. Automatic session recovery / login
  const savedToken = store.get('authToken');
  const savedUser = store.get('user');
  const savedCredentials = store.get('savedCredentials') || 
    (envConfig.AGENT_AUTO_LOGIN_EMAIL && envConfig.AGENT_AUTO_LOGIN_PASSWORD ? {
      email: envConfig.AGENT_AUTO_LOGIN_EMAIL,
      password: envConfig.AGENT_AUTO_LOGIN_PASSWORD
    } : null);

  let sessionRestored = false;

  if (savedToken) {
    apiService.setAuthToken(savedToken);

    // Confirm the token belongs to an account that exists on THIS backend
    // before restoring. A shared JWT_SECRET can make a token issued by
    // another deployment verify while the employee record does not exist
    // there, which showed up as an agent with no tasks/records.
    const session = await apiService.verifySession();
    let status;

    if (session.valid) {
      store.set('apiBaseUrl', apiService.getBaseUrl());
      status = await apiService.checkAttendanceStatus();
    } else if (session.network) {
      // Backend unreachable right now (typical at boot). Keep the previous
      // behaviour: restore the session and let the poller reconcile.
      status = await apiService.checkAttendanceStatus();
    } else {
      console.log(`⚠️ Saved token rejected by ${apiService.getBaseUrl()}: ${session.error}. Re-login required...`);
      status = { error: true, errorMessage: `401 ${session.error}` };
    }

    if (status.error && isAuthFailure(status)) {
      // Rejected token: fall through to the saved-credentials re-login below.
      // The old try/catch around this call never fired because the helper
      // swallows HTTP errors, so expired tokens used to skip re-login and
      // leave the agent polling with a dead token — launched, never tracking.
      console.log('⚠️ Saved token expired, attempting automatic re-login...');
    } else if (status.error) {
      // Server unreachable right now (typical at boot before the network is
      // up). Keep the session; the poller reconciles day state and starts
      // tracking as soon as the server is reachable again.
      console.log('⚠️ Server unreachable at startup — restoring session, poller will sync when it reconnects...');
      const tokenUser = apiService.getUserFromToken();
      appState.isLoggedIn = true;
      appState.user = {
        name: tokenUser?.name || savedUser?.name || savedCredentials?.email?.split('@')[0] || 'Employee',
        email: tokenUser?.email || savedUser?.email || savedCredentials?.email || ''
      };
      sessionRestored = true;
      startAttendancePoller();
      startAgentHeartbeat();
      updateTrayMenu();
      sendToRenderer('show-dashboard', { user: appState.user });
    } else {
      const tokenUser = apiService.getUserFromToken();
      appState.isLoggedIn = true;
      appState.startTime = status.startTime || null;
      appState.endTime = status.endTime || null;
      appState.dayEndedToday = !!status.dayEndedToday;
      appState.user = {
        name: status.userName || tokenUser?.name || savedUser?.name || savedCredentials?.email?.split('@')[0] || 'Employee',
        email: status.userEmail || tokenUser?.email || savedUser?.email || savedCredentials?.email || ''
      };
      sessionRestored = true;
      store.set('apiBaseUrl', apiService.getBaseUrl());
      console.log(`✓ Automatically restored session for: ${appState.user.name} (${appState.user.email})`);

        startAttendancePoller();
        startAgentHeartbeat();
        if (attendancePoller) {
        // Seed the poller with the fresh status so its first poll does not
        // re-emit a day-started transition for a day that is already active.
        attendancePoller.currentStatus = {
          dayStarted: !!status.dayStarted,
          dayEndedToday: !!status.dayEndedToday,
          attendanceId: status.attendanceId || null,
          startTime: status.startTime || null,
          endTime: status.endTime || null,
          workLocation: status.workLocation || null,
          userName: appState.user.name,
          userEmail: appState.user.email
        };
      }

      if (status.dayStarted) {
        console.log('🟢 Workday is active! Starting tracking automatically...');
        appState.isDayStarted = true;
        await beginTracking(status.attendanceId, status.startTime, true);
      }

      updateTrayMenu();
      // The window was created before this restore ran, so tell the renderer
      // to flip from the login screen to the dashboard now that we are in.
      sendToRenderer('show-dashboard', { user: appState.user });
    }
  }

  if (!sessionRestored && savedCredentials) {
    console.log('🔐 Auto-logging in with saved credentials for:', savedCredentials.email);
    try {
      const result = await apiService.login(savedCredentials);
      if (result.success) {
        appState.isLoggedIn = true;
        appState.user = result.user;
        store.set('authToken', result.token);
        store.set('user', result.user);
        store.set('savedCredentials', savedCredentials);
        apiService.setAuthToken(result.token);
        store.set('apiBaseUrl', apiService.getBaseUrl());
        sessionRestored = true;
        console.log('✓ Automatic login successful!');

        startAttendancePoller();
        startAgentHeartbeat();

        const status = await apiService.checkAttendanceStatus();
        if (status.dayStarted) {
          console.log('🟢 Workday is active! Starting tracking automatically...');
          appState.isDayStarted = true;
          await beginTracking(status.attendanceId);
        }

        updateTrayMenu();
        sendToRenderer('show-dashboard', { user: appState.user });
      }
    } catch (err) {
      console.error('❌ Automatic login error:', err.message);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit on window close - keep running in tray
});

app.on('before-quit', () => {
  endTracking();
  if (attendancePoller) {
    attendancePoller.stop();
  }
});

function startAgentHeartbeat() {
  if (agentHeartbeatTimer) return;
  const send = async () => {
    if (!appState.isLoggedIn) return;
    try { await apiService.sendHeartbeat(); } catch (e) { /* ignore */ }
  };
  send();
  agentHeartbeatTimer = setInterval(send, 30000);
}

function stopAgentHeartbeat() {
  if (agentHeartbeatTimer) {
    clearInterval(agentHeartbeatTimer);
    agentHeartbeatTimer = null;
  }
}

function startLocalStatusServer() {
  try {
    const server = http.createServer((req, res) => {
      if (req.url === '/status' || req.url === '/status/') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({
          status: 'ok',
          loggedIn: !!appState.isLoggedIn,
          version: '1.0.0',
          // Which backend/database this agent is signed into, so the web app
          // can surface a mismatch instead of silently showing no records.
          backend: apiService ? apiService.getBaseUrl() : null
        }));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    server.listen(48121, '127.0.0.1', () => {
      console.log('Local agent status server listening on 127.0.0.1:48121');
    });
    server.on('error', (e) => console.warn('Local status server error:', e && e.message));
  } catch (e) {
    console.warn('Failed to start local status server:', e && e.message);
  }
}

function startAttendancePoller() {
  if (!attendancePoller) {
    attendancePoller = new AttendanceStatusPoller(apiService);

    const handleStartOrRestart = (data, forceReset) => {
      console.log('🟢 Workday started! Attendance ID:', data.attendanceId);
      appState.isDayStarted = true;
      appState.dayEndedToday = false;
      appState.startTime = data.startTime || new Date().toISOString();
      appState.endTime = null;
      if (data.userName) {
        appState.user = { ...(appState.user || {}), name: data.userName, email: data.userEmail || appState.user?.email };
      }

      beginTracking(data.attendanceId, appState.startTime, forceReset).catch((error) =>
        console.warn('Failed to start tracking:', error.message)
      );

      updateTrayMenu();
      sendToRenderer('day-status-changed', {
        dayStarted: true,
        dayEndedToday: false,
        startTime: appState.startTime,
        user: appState.user
      });
    };

    attendancePoller.on('day-started', (data) => handleStartOrRestart(data, true));
    attendancePoller.on('day-restarted', (data) => handleStartOrRestart(data, true));

    // The workday was handed to the phone: keep the day open, pause collectors.
    attendancePoller.on('day-suspended', async (data = {}) => {
      console.log('⏸️ Workday now owned by Mobile. Pausing desktop monitoring...');
      await endTracking();
      appState.isDayPaused = true;
      updateTrayMenu();
      sendToRenderer('day-status-changed', {
        dayStarted: true,
        dayPaused: true,
        startTime: appState.startTime,
        activeDevice: data.activeDevice || null
      });
    });

    // Handed back to the laptop/PC: resume collectors without resetting counters.
    attendancePoller.on('day-resumed', (data = {}) => {
      console.log('▶️ Workday now owned by Laptop / PC. Resuming desktop monitoring...');
      appState.isDayPaused = false;
      handleStartOrRestart(data, false);
      sendToRenderer('day-status-changed', {
        dayStarted: true,
        dayPaused: false,
        startTime: appState.startTime,
        activeDevice: data.activeDevice || null
      });
    });

    attendancePoller.on('day-ended', async (data = {}) => {
      console.log('🔴 Workday ended! Stopping tracking...');
      appState.isDayStarted = false;
      appState.isDayPaused = false;
      appState.dayEndedToday = Boolean(data.dayEndedToday ?? true);
      appState.startTime = data.startTime || appState.startTime;
      appState.endTime = data.endTime || new Date().toISOString();

      await endTracking();

      updateTrayMenu();
      sendToRenderer('day-status-changed', {
        dayStarted: false,
        dayEndedToday: appState.dayEndedToday,
        startTime: appState.startTime,
        endTime: appState.endTime
      });
    });

    attendancePoller.on('status-refreshed', (data = {}) => {
      appState.dayEndedToday = !!data.dayEndedToday;
      appState.startTime = data.startTime || null;
      appState.endTime = data.endTime || null;
      sendToRenderer('day-status-changed', {
        dayStarted: false,
        dayEndedToday: appState.dayEndedToday,
        startTime: appState.startTime,
        endTime: appState.endTime
      });
    });
  }
  
  attendancePoller.start();
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
