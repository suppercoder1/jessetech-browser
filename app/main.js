const {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  ipcMain,
  session,
  shell,
} = require('electron');
const fs = require('fs');
const path = require('path');

const START_URL = 'https://searxng.jessetech.nl';
const DEFAULT_PROFILE = 'personal';
const STATE_SCHEMA_VERSION = 1;
const privatePartitions = new Set();
const configuredPartitions = new Set();
const windowsState = new Map();
const downloads = new Map();

const defaultState = {
  schemaVersion: STATE_SCHEMA_VERSION,
  settings: {
    startupPage: START_URL,
    defaultZoom: 1,
    restoreSession: true,
    blockPopups: true,
    clearDataOnExit: false,
    blockThirdPartyCookies: false,
    blockTrackers: false,
    currentProfile: DEFAULT_PROFILE,
    profiles: ['personal', 'work'],
  },
  sitePermissions: {},
};

let appState = structuredClone(defaultState);
let isQuittingAfterClear = false;
let statePath = '';
let crashLogPath = '';

function appendCrashLog(type, payload = {}) {
  try {
    if (!crashLogPath) {
      crashLogPath = path.join(app.getPath('userData'), 'crash.log');
    }
    const entry = {
      ts: new Date().toISOString(),
      type,
      ...payload,
    };
    fs.appendFileSync(crashLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Avoid recursive logging failures.
  }
}

function installCrashLogging() {
  process.on('uncaughtException', (error) => {
    appendCrashLog('uncaughtException', {
      message: error?.message || 'Unknown error',
      stack: error?.stack || '',
    });
  });

  process.on('unhandledRejection', (reason) => {
    appendCrashLog('unhandledRejection', {
      reason: String(reason),
    });
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    appendCrashLog('render-process-gone', {
      webContentsId: webContents?.id || null,
      reason: details?.reason || 'unknown',
      exitCode: details?.exitCode ?? null,
    });
  });

  app.on('child-process-gone', (_event, details) => {
    appendCrashLog('child-process-gone', {
      type: details?.type || 'unknown',
      reason: details?.reason || 'unknown',
      exitCode: details?.exitCode ?? null,
      serviceName: details?.serviceName || '',
      name: details?.name || '',
    });
  });
}

function migrateState(parsed) {
  const schemaVersion = Number(parsed?.schemaVersion || 0);

  if (schemaVersion >= STATE_SCHEMA_VERSION) {
    return parsed;
  }

  const migrated = {
    schemaVersion: STATE_SCHEMA_VERSION,
    settings: {
      ...defaultState.settings,
      ...(parsed?.settings || {}),
    },
    sitePermissions: parsed?.sitePermissions || {},
  };

  return migrated;
}

function loadState() {
  statePath = path.join(app.getPath('userData'), 'browser-state.json');
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = migrateState(JSON.parse(raw));
    appState = {
      schemaVersion: STATE_SCHEMA_VERSION,
      settings: {
        ...defaultState.settings,
        ...(parsed.settings || {}),
      },
      sitePermissions: parsed.sitePermissions || {},
    };
  } catch {
    appState = structuredClone(defaultState);
  }
}

function saveState() {
  try {
    const nextState = {
      ...appState,
      schemaVersion: STATE_SCHEMA_VERSION,
    };
    fs.writeFileSync(statePath, JSON.stringify(nextState, null, 2), 'utf8');
  } catch {
    // Keep running if persistence fails.
  }
}

function sanitizeProfileName(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .slice(0, 32);
}

function getPartitionForWindow({ privateMode, profile }) {
  if (privateMode) {
    return `temp:private-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  const normalizedProfile = sanitizeProfileName(profile) || DEFAULT_PROFILE;
  return `persist:profile-${normalizedProfile}`;
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function getSitePermission(origin, permission) {
  const site = appState.sitePermissions[origin] || {};
  return site[permission] || 'ask';
}

function setSitePermission(origin, permission, value) {
  if (!origin || !permission) return;
  if (!appState.sitePermissions[origin]) appState.sitePermissions[origin] = {};
  appState.sitePermissions[origin][permission] = value;
  saveState();
}

function mapPermissionName(permission) {
  const map = {
    media: 'camera',
    microphone: 'microphone',
    camera: 'camera',
    geolocation: 'geolocation',
    notifications: 'notifications',
  };
  return map[permission] || permission;
}

function isThirdPartyRequest(details) {
  try {
    const target = new URL(details.url);
    const referrerHeader = details.requestHeaders?.Referer || details.requestHeaders?.Origin;
    if (!referrerHeader) return false;

    const referrer = new URL(referrerHeader);
    return target.hostname !== referrer.hostname;
  } catch {
    return false;
  }
}

function isTrackerRequest(url) {
  const blockedHosts = [
    'doubleclick.net',
    'google-analytics.com',
    'googletagmanager.com',
    'facebook.net',
    'adservice.google.com',
    'taboola.com',
    'outbrain.com',
  ];
  try {
    const host = new URL(url).hostname.toLowerCase();
    return blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

function currentSettings() {
  return appState.settings;
}

function normalizeSuggestions(query, payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    if (Array.isArray(payload[1])) return payload[1].map((item) => String(item)).filter(Boolean);
    return payload.map((item) => String(item)).filter(Boolean);
  }

  if (Array.isArray(payload.suggestions)) {
    return payload.suggestions.map((item) => String(item)).filter(Boolean);
  }

  if (Array.isArray(payload.results)) {
    return payload.results
      .map((item) => (typeof item === 'string' ? item : item?.title || item?.content || ''))
      .map((item) => String(item))
      .filter(Boolean);
  }

  return [];
}

async function fetchSuggestions(query) {
  const endpoints = [
    `${START_URL}/autocomplete?q=${encodeURIComponent(query)}&format=json`,
    `${START_URL}/autocomplete?q=${encodeURIComponent(query)}`,
    `${START_URL}/suggestions?q=${encodeURIComponent(query)}&format=json`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) continue;

      const payload = await response.json();
      const suggestions = normalizeSuggestions(query, payload);
      if (suggestions.length > 0) return suggestions.slice(0, 8);
    } catch {
      // Try next endpoint.
    }
  }

  return [];
}

function publishDownloads() {
  const payload = [...downloads.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 100);

  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('downloads:update', payload);
  });
}

function installContextMenu(contents) {
  contents.on('context-menu', (event, params) => {
    const menuItems = [];

    if (params.linkURL) {
      menuItems.push({
        label: 'Open Link in New Tab',
        click: () => {
          const host = contents.hostWebContents;
          if (host) {
            host.send('context:open-link-new-tab', params.linkURL);
          }
        },
      });
      menuItems.push({ type: 'separator' });
    }

    if (params.mediaType === 'image' && params.srcURL) {
      menuItems.push({
        label: 'Save Image As...',
        click: () => {
          contents.downloadURL(params.srcURL);
        },
      });
      menuItems.push({ type: 'separator' });
    }

    menuItems.push({ role: 'copy', enabled: params.editFlags.canCopy });
    menuItems.push({ role: 'paste', enabled: params.editFlags.canPaste });
    menuItems.push({ role: 'cut', enabled: params.editFlags.canCut });
    menuItems.push({ role: 'selectAll' });

    if (params.dictionarySuggestions?.length) {
      menuItems.push({ type: 'separator' });
      params.dictionarySuggestions.slice(0, 5).forEach((suggestion) => {
        menuItems.push({
          label: suggestion,
          click: () => contents.replaceMisspelling(suggestion),
        });
      });
    }

    menuItems.push({ type: 'separator' });
    menuItems.push({
      label: 'Inspect Element',
      click: () => contents.inspectElement(params.x, params.y),
    });

    Menu.buildFromTemplate(menuItems).popup({ window: BrowserWindow.fromWebContents(contents) || undefined });
  });
}

function configureSessionPartition(partition) {
  if (configuredPartitions.has(partition)) return;
  configuredPartitions.add(partition);

  const s = session.fromPartition(partition);
  const privateMode = privatePartitions.has(partition);

  s.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const mapped = mapPermissionName(permission);
    const origin = getOrigin(requestingOrigin || webContents?.getURL?.() || '');
    const decision = getSitePermission(origin, mapped);
    if (decision === 'allow') return true;
    if (decision === 'block') return false;
    return false;
  });

  s.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mapped = mapPermissionName(permission);
    const origin = getOrigin(details.requestingUrl || webContents.getURL());
    const decision = getSitePermission(origin, mapped);
    if (decision === 'allow') return callback(true);
    if (decision === 'block') return callback(false);
    return callback(false);
  });

  s.webRequest.onBeforeSendHeaders((details, callback) => {
    if (currentSettings().blockThirdPartyCookies && isThirdPartyRequest(details)) {
      const nextHeaders = { ...details.requestHeaders };
      delete nextHeaders.Cookie;
      delete nextHeaders.cookie;
      callback({ requestHeaders: nextHeaders });
      return;
    }

    callback({ requestHeaders: details.requestHeaders });
  });

  s.webRequest.onBeforeRequest((details, callback) => {
    if (currentSettings().blockTrackers && isTrackerRequest(details.url)) {
      callback({ cancel: true });
      return;
    }
    callback({});
  });

  s.webRequest.onHeadersReceived((details, callback) => {
    if (currentSettings().blockThirdPartyCookies && isThirdPartyRequest(details)) {
      const nextHeaders = { ...details.responseHeaders };
      delete nextHeaders['Set-Cookie'];
      delete nextHeaders['set-cookie'];
      callback({ responseHeaders: nextHeaders });
      return;
    }

    callback({ responseHeaders: details.responseHeaders });
  });

  s.on('will-download', (_event, item) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const entry = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      state: 'progressing',
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      savePath: item.getSavePath() || '',
      startedAt: Date.now(),
      privateMode,
    };

    downloads.set(id, entry);
    publishDownloads();

    item.on('updated', () => {
      const current = downloads.get(id);
      if (!current) return;
      current.state = item.isPaused() ? 'paused' : 'progressing';
      current.receivedBytes = item.getReceivedBytes();
      current.totalBytes = item.getTotalBytes();
      current.savePath = item.getSavePath() || current.savePath;
      publishDownloads();
    });

    item.once('done', (_evt, state) => {
      const current = downloads.get(id);
      if (!current) return;
      current.state = state;
      current.receivedBytes = item.getReceivedBytes();
      current.totalBytes = item.getTotalBytes();
      current.savePath = item.getSavePath() || current.savePath;
      publishDownloads();
    });
  });
}

function getWindowStateBySender(sender) {
  return windowsState.get(sender.id) || null;
}

function createWindow(options = {}) {
  const privateMode = Boolean(options.privateMode);
  const profile = sanitizeProfileName(options.profile || currentSettings().currentProfile) || DEFAULT_PROFILE;
  const partition = getPartitionForWindow({ privateMode, profile });

  if (privateMode) privatePartitions.add(partition);
  configureSessionPartition(partition);

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 620,
    title: privateMode ? 'JesseTech Browser (Private)' : 'JesseTech Browser',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      spellcheck: true,
    },
  });

  const windowKey = win.webContents.id;

  windowsState.set(windowKey, {
    privateMode,
    profile,
    partition,
  });

  win.on('closed', () => {
    windowsState.delete(windowKey);
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

app.on('web-contents-created', (_event, contents) => {
  installContextMenu(contents);

  contents.setWindowOpenHandler(() => {
    if (currentSettings().blockPopups) return { action: 'deny' };

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1200,
        height: 800,
        title: 'JesseTech Browser',
      },
    };
  });
});

app.on('certificate-error', (event, webContents, url, error) => {
  const host = webContents?.hostWebContents;
  if (host) {
    host.send('security:certificate-error', { url, error });
  }
  // Keep Chromium default behavior for certificate failures.
});

ipcMain.handle('browser:getConfig', (event) => {
  const winState = getWindowStateBySender(event.sender);
  return {
    startUrl: currentSettings().startupPage || START_URL,
    partition: winState?.partition || getPartitionForWindow({ privateMode: false, profile: currentSettings().currentProfile }),
    privateMode: Boolean(winState?.privateMode),
    profile: winState?.profile || currentSettings().currentProfile,
    settings: {
      defaultZoom: Number(currentSettings().defaultZoom) || 1,
      restoreSession: Boolean(currentSettings().restoreSession),
      startupPage: currentSettings().startupPage || START_URL,
      currentProfile: currentSettings().currentProfile,
      profiles: currentSettings().profiles,
    },
  };
});

ipcMain.handle('browser:newPrivatePartition', () => {
  const partition = `temp:inline-private-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  privatePartitions.add(partition);
  configureSessionPartition(partition);
  return partition;
});

ipcMain.handle('settings:get', () => currentSettings());

ipcMain.handle('settings:update', (_event, updates) => {
  const next = { ...currentSettings(), ...updates };

  if (typeof next.defaultZoom !== 'number' || Number.isNaN(next.defaultZoom)) next.defaultZoom = 1;
  next.defaultZoom = Math.min(3, Math.max(0.25, next.defaultZoom));
  next.startupPage = String(next.startupPage || START_URL);
  next.currentProfile = sanitizeProfileName(next.currentProfile) || DEFAULT_PROFILE;

  if (!Array.isArray(next.profiles) || next.profiles.length === 0) {
    next.profiles = [DEFAULT_PROFILE, 'work'];
  }
  if (!next.profiles.includes(next.currentProfile)) {
    next.profiles = [next.currentProfile, ...next.profiles.filter((p) => p !== next.currentProfile)];
  }

  appState.settings = next;
  saveState();
  return appState.settings;
});

ipcMain.handle('profiles:add', (_event, name) => {
  const normalized = sanitizeProfileName(name);
  if (!normalized) return currentSettings().profiles;
  if (!currentSettings().profiles.includes(normalized)) {
    appState.settings.profiles = [...currentSettings().profiles, normalized];
    saveState();
  }
  return appState.settings.profiles;
});

ipcMain.handle('privacy:get', () => ({
  blockPopups: currentSettings().blockPopups,
  clearDataOnExit: currentSettings().clearDataOnExit,
  blockThirdPartyCookies: currentSettings().blockThirdPartyCookies,
  blockTrackers: currentSettings().blockTrackers,
}));

ipcMain.handle('privacy:update', (_event, updates) => {
  appState.settings = {
    ...currentSettings(),
    ...updates,
  };
  saveState();
  return {
    blockPopups: currentSettings().blockPopups,
    clearDataOnExit: currentSettings().clearDataOnExit,
    blockThirdPartyCookies: currentSettings().blockThirdPartyCookies,
    blockTrackers: currentSettings().blockTrackers,
  };
});

ipcMain.handle('permissions:get', (_event, origin) => {
  const normalizedOrigin = getOrigin(origin);
  if (!normalizedOrigin) return {};
  return appState.sitePermissions[normalizedOrigin] || {};
});

ipcMain.handle('permissions:set', (_event, origin, permission, value) => {
  const normalizedOrigin = getOrigin(origin);
  const normalizedPermission = mapPermissionName(permission);
  const normalizedValue = ['allow', 'block', 'ask'].includes(value) ? value : 'ask';

  if (!normalizedOrigin || !normalizedPermission) return {};
  setSitePermission(normalizedOrigin, normalizedPermission, normalizedValue);
  return appState.sitePermissions[normalizedOrigin] || {};
});

ipcMain.handle('search:suggest', async (_event, query) => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];
  return fetchSuggestions(normalizedQuery);
});

ipcMain.handle('downloads:list', () => {
  return [...downloads.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 100);
});

ipcMain.handle('downloads:open', (_event, id) => {
  const record = downloads.get(String(id));
  if (!record?.savePath) return false;
  shell.showItemInFolder(record.savePath);
  return true;
});

ipcMain.handle('window:new-private', () => {
  createWindow({ privateMode: true, profile: currentSettings().currentProfile });
  return true;
});

ipcMain.handle('app:relaunch', () => {
  app.relaunch();
  app.quit();
  return true;
});

app.on('before-quit', (event) => {
  if (!currentSettings().clearDataOnExit || isQuittingAfterClear) return;

  event.preventDefault();
  isQuittingAfterClear = true;

  Promise.all(
    [...configuredPartitions]
      .filter((partition) => !privatePartitions.has(partition))
      .map((partition) => session.fromPartition(partition).clearStorageData().catch(() => {})),
  ).finally(() => {
    app.quit();
  });
});

app.whenReady().then(() => {
  installCrashLogging();
  loadState();
  configureSessionPartition(getPartitionForWindow({ privateMode: false, profile: currentSettings().currentProfile }));
  createWindow({ privateMode: false, profile: currentSettings().currentProfile });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({ privateMode: false, profile: currentSettings().currentProfile });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
