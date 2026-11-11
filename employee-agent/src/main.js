const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const ActivityTracker = require('./managers/activityTracker');
const AttendanceStatusPoller = require('./managers/attendancePoller');
const ScreenshotEngine = require('./managers/screenshotEngine');
const ApiService = require('./services/apiService');

// Initialize store for persistent data
const store = new Store();

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
let apiService = null;
let screenshotEngine = null;
let assignedTasks = [];
let assignedAims = [];

// App state
let appState = {
  isLoggedIn: false,
  isDayStarted: false,
  user: null,
  startTime: null,
  consentGiven: true
};

function createWindow() {
  const windowOptions = {
    width: 400,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    frame: true,
    resizable: false
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
    
    if (appState.isLoggedIn) {
      mainWindow.webContents.send('show-dashboard', { user: appState.user });
      const startMinimized = envConfig.AGENT_START_MINIMIZED !== 'false';
      if (!startMinimized) {
        mainWindow.show();
      } else {
        console.log('✓ Agent running silently in background (system tray)');
      }
    } else {
      mainWindow.webContents.send('show-login');
      mainWindow.show();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon;
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 16, height: 16 });
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
async function beginTracking(attendanceId) {
  if (!attendanceId) return;

  if (activityTracker) {
    activityTracker.start(attendanceId);
  }

  // Restore the task the employee had selected before the app restarted.
  const storedTaskId = store.get('activeTaskId');
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

function endTracking() {
  if (activityTracker) {
    activityTracker.stop();
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
      
      startAttendancePoller();
      
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

ipcMain.handle('logout', () => {
  if (attendancePoller) {
    attendancePoller.stop();
  }
  
  if (appState.isDayStarted) {
    endTracking();
    appState.isDayStarted = false;
  }
  
  appState.isLoggedIn = false;
  appState.user = null;
  store.delete('authToken');
  store.delete('savedCredentials');
  apiService.setAuthToken(null);
  updateTrayMenu();
  
  return { success: true };
});

ipcMain.handle('start-day', async () => {
  try {
    const result = await apiService.startDay();
    if (result.success) {
      appState.isDayStarted = true;
      await beginTracking(result.attendanceId);
      updateTrayMenu();
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
      appState.isDayStarted = false;
      endTracking();
      updateTrayMenu();
    }
    return result;
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
      if (currentStatus.startTime) {
        appState.startTime = currentStatus.startTime;
      }
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
  
  return {
    isLoggedIn: appState.isLoggedIn,
    isDayStarted: appState.isDayStarted,
    user: appState.user,
    startTime: appState.startTime,
    consentGiven: appState.consentGiven
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
  if (activityTracker) {
    activityTracker.setActiveTask(taskId);
  }
  if (screenshotEngine) {
    screenshotEngine.setActiveTask(taskId);
  }
  store.set('activeTaskId', taskId || null);
  return { success: true, activeTaskId: taskId || null };
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
app.whenReady().then(async () => {
  // 1. Setup auto-start with Windows on PC boot
  if (process.platform === 'win32' && envConfig.AGENT_AUTO_START_ON_BOOT !== 'false') {
    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true
      });
      console.log('✓ Configured to launch automatically on Windows boot');
    } catch (e) {
      console.warn('Could not set Windows auto-start:', e.message);
    }
  }

  // 2. Initialize services
  apiService = new ApiService();
  activityTracker = new ActivityTracker(apiService);

  // TRINETRA periodic capture engine (starts/stops with the workday)
  screenshotEngine = new ScreenshotEngine(apiService);
  screenshotEngine.on('status', (status) => sendToRenderer('screenshot-status', status));

  // 3. Mark consent as automatically given
  store.set('consentGiven', true);
  appState.consentGiven = true;

  // 4. Automatic session recovery / login
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
    try {
      const status = await apiService.checkAttendanceStatus();
      const tokenUser = apiService.getUserFromToken();
      appState.isLoggedIn = true;
      appState.startTime = status.startTime || null;
      appState.user = {
        name: status.userName || tokenUser?.name || savedUser?.name || savedCredentials?.email?.split('@')[0] || 'Employee',
        email: status.userEmail || tokenUser?.email || savedUser?.email || savedCredentials?.email || ''
      };
      sessionRestored = true;
      console.log(`✓ Automatically restored session for: ${appState.user.name} (${appState.user.email})`);

      startAttendancePoller();

      if (status.dayStarted) {
        console.log('🟢 Workday is active! Starting tracking automatically...');
        appState.isDayStarted = true;
        await beginTracking(status.attendanceId);
      }
    } catch (err) {
      console.log('⚠️ Saved token expired, attempting automatic re-login...');
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
        sessionRestored = true;
        console.log('✓ Automatic login successful!');

        startAttendancePoller();

        const status = await apiService.checkAttendanceStatus();
        if (status.dayStarted) {
          console.log('🟢 Workday is active! Starting tracking automatically...');
          appState.isDayStarted = true;
          await beginTracking(status.attendanceId);
        }
      }
    } catch (err) {
      console.error('❌ Automatic login error:', err.message);
    }
  }

  createWindow();
  createTray();

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

function startAttendancePoller() {
  if (!attendancePoller) {
    attendancePoller = new AttendanceStatusPoller(apiService);
    
    attendancePoller.on('day-started', (data) => {
      console.log('🟢 Workday started! Attendance ID:', data.attendanceId);
      appState.isDayStarted = true;
      appState.startTime = data.startTime || new Date().toISOString();
      if (data.userName) {
        appState.user = { ...(appState.user || {}), name: data.userName, email: data.userEmail || appState.user?.email };
      }
      
      beginTracking(data.attendanceId).catch((error) =>
        console.warn('Failed to start tracking:', error.message)
      );
      
      updateTrayMenu();
      
      if (mainWindow) {
        mainWindow.webContents.send('day-status-changed', { 
          dayStarted: true,
          startTime: appState.startTime,
          user: appState.user
        });
      }
    });
    
    attendancePoller.on('day-ended', () => {
      console.log('🔴 Workday ended! Stopping tracking...');
      appState.isDayStarted = false;
      appState.startTime = null;
      
      endTracking();
      
      updateTrayMenu();
      
      if (mainWindow) {
        mainWindow.webContents.send('day-status-changed', { dayStarted: false });
      }
    });
  }
  
  attendancePoller.start();
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
