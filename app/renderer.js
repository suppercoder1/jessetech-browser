const STORAGE_KEYS = {
  bookmarks: 'jtb.bookmarks',
  historyEntries: 'jtb.historyEntries',
  tabsSession: 'jtb.tabsSession',
  zoomByOrigin: 'jtb.zoomByOrigin',
  themeMode: 'jtb.themeMode',
};

const tabBar = document.getElementById('tabBar');
const newTabBtn = document.getElementById('newTabBtn');
const newPrivateTabBtn = document.getElementById('newPrivateTabBtn');
const newPrivateWindowBtn = document.getElementById('newPrivateWindowBtn');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const reloadBtn = document.getElementById('reloadBtn');
const homeBtn = document.getElementById('homeBtn');
const profileChipBtn = document.getElementById('profileChipBtn');
const securityBadge = document.getElementById('securityBadge');
const findBtn = document.getElementById('findBtn');
const historyBtn = document.getElementById('historyBtn');
const downloadsBtn = document.getElementById('downloadsBtn');
const permissionsBtn = document.getElementById('permissionsBtn');
const urlInput = document.getElementById('urlInput');
const suggestionsList = document.getElementById('suggestionsList');
const bookmarksBtn = document.getElementById('bookmarksBtn');
const settingsBtn = document.getElementById('settingsBtn');

const findPanel = document.getElementById('findPanel');
const findInput = document.getElementById('findInput');
const findPrevBtn = document.getElementById('findPrevBtn');
const findNextBtn = document.getElementById('findNextBtn');
const findCloseBtn = document.getElementById('findCloseBtn');
const findStatus = document.getElementById('findStatus');

const bookmarksPanel = document.getElementById('bookmarksPanel');
const addBookmarkBtn = document.getElementById('addBookmarkBtn');
const bookmarksList = document.getElementById('bookmarksList');

const historyPanel = document.getElementById('historyPanel');
const historySearchInput = document.getElementById('historySearchInput');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const historyList = document.getElementById('historyList');

const downloadsPanel = document.getElementById('downloadsPanel');
const downloadsList = document.getElementById('downloadsList');

const settingsPanel = document.getElementById('settingsPanel');
const startupPageInput = document.getElementById('startupPageInput');
const defaultZoomInput = document.getElementById('defaultZoomInput');
const restoreSessionToggle = document.getElementById('restoreSessionToggle');
const profileSelect = document.getElementById('profileSelect');
const newProfileInput = document.getElementById('newProfileInput');
const addProfileBtn = document.getElementById('addProfileBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const exportBackupBtn = document.getElementById('exportBackupBtn');
const importBackupBtn = document.getElementById('importBackupBtn');
const importBackupInput = document.getElementById('importBackupInput');
const themeSelect = document.getElementById('themeSelect');
const blockPopupsToggle = document.getElementById('blockPopupsToggle');
const blockThirdPartyCookiesToggle = document.getElementById('blockThirdPartyCookiesToggle');
const blockTrackersToggle = document.getElementById('blockTrackersToggle');
const clearDataOnExitToggle = document.getElementById('clearDataOnExitToggle');

const permissionsPanel = document.getElementById('permissionsPanel');
const permissionsOrigin = document.getElementById('permissionsOrigin');
const cameraPermissionSelect = document.getElementById('cameraPermissionSelect');
const microphonePermissionSelect = document.getElementById('microphonePermissionSelect');
const geolocationPermissionSelect = document.getElementById('geolocationPermissionSelect');
const notificationsPermissionSelect = document.getElementById('notificationsPermissionSelect');

const webviewContainer = document.getElementById('webviewContainer');
const pageLoadingOverlay = document.getElementById('pageLoadingOverlay');
const toastContainer = document.getElementById('toastContainer');

const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const isMac = navigator.platform.toUpperCase().includes('MAC');

let browserConfig = {
  startUrl: 'https://searxng.jessetech.nl',
  partition: 'persist:profile-personal',
  privateMode: false,
  profile: 'personal',
  settings: {
    startupPage: 'https://searxng.jessetech.nl',
    defaultZoom: 1,
    restoreSession: true,
    currentProfile: 'personal',
    profiles: ['personal', 'work'],
  },
};

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let bookmarks = loadBookmarks();
let historyEntries = loadHistoryEntries();
let zoomByOrigin = loadJson(STORAGE_KEYS.zoomByOrigin, {});
let downloads = [];
let closedTabs = [];
let suggestionItems = [];
let selectedSuggestionIndex = -1;
let suggestionRequestId = 0;
let removeDownloadsListener = null;
let removeContextListener = null;
let removeCertListener = null;
let downloadsInitialized = false;
let panelsRendered = {
  bookmarks: false,
  history: false,
};

function storageKey(name) {
  const profile = browserConfig.profile || 'default';
  return `${name}.${profile}`;
}

function loadJson(key, fallback = []) {
  try {
    const raw = localStorage.getItem(storageKey(key));
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : parsed || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(storageKey(key), JSON.stringify(value));
}

function loadBookmarks() {
  return loadJson(STORAGE_KEYS.bookmarks, []);
}

function saveBookmarks() {
  saveJson(STORAGE_KEYS.bookmarks, bookmarks);
}

function loadHistoryEntries() {
  return loadJson(STORAGE_KEYS.historyEntries, []);
}

function saveHistoryEntries() {
  saveJson(STORAGE_KEYS.historyEntries, historyEntries);
}

function saveZoomByOrigin() {
  saveJson(STORAGE_KEYS.zoomByOrigin, zoomByOrigin);
}

function getOriginFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function getStoredZoomForUrl(url) {
  const origin = getOriginFromUrl(url);
  if (!origin) return browserConfig.settings.defaultZoom || 1;
  const stored = Number(zoomByOrigin[origin]);
  if (Number.isFinite(stored)) return stored;
  return browserConfig.settings.defaultZoom || 1;
}

function storeZoomForUrl(url, value) {
  const origin = getOriginFromUrl(url);
  if (!origin) return;
  const normalized = Math.min(3, Math.max(0.25, Number(value) || 1));
  zoomByOrigin[origin] = normalized;
  saveZoomByOrigin();
}

function applyStoredZoomForTab(tab) {
  const currentUrl = tab.webview.getURL() || tab.url;
  tab.webview.setZoomFactor(getStoredZoomForUrl(currentUrl));
}

function getThemeMode() {
  return localStorage.getItem(STORAGE_KEYS.themeMode) || 'system';
}

function setThemeMode(mode) {
  localStorage.setItem(STORAGE_KEYS.themeMode, mode);
  applyTheme(mode);
}

function applyTheme(mode) {
  if (mode === 'system') {
    document.documentElement.dataset.theme = mediaQuery.matches ? 'dark' : 'light';
  } else {
    document.documentElement.dataset.theme = mode;
  }
}

function toSearchUrl(input) {
  return `${browserConfig.startUrl}/search?q=${encodeURIComponent(input)}`;
}

function normalizeInputToUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return browserConfig.startUrl;

  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes('.') && !value.includes(' ')) return `https://${value}`;
  return toSearchUrl(value);
}

function mergeSuggestions(items, limit = 8) {
  const seen = new Set();
  const merged = [];

  for (const item of items) {
    const next = String(item || '').trim();
    if (!next) continue;
    const key = next.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(next);
    if (merged.length >= limit) break;
  }

  return merged;
}

function getLocalSuggestions(query) {
  const needle = query.toLowerCase();
  const pool = [
    ...bookmarks.flatMap((bookmark) => [bookmark.title, bookmark.url]),
    ...historyEntries.flatMap((entry) => [entry.title, entry.url]),
  ];

  return mergeSuggestions(pool.filter((value) => String(value || '').toLowerCase().includes(needle)), 8);
}

function renderSuggestions() {
  suggestionsList.innerHTML = '';
  if (suggestionItems.length === 0) {
    suggestionsList.classList.add('hidden');
    return;
  }

  suggestionItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = `suggestion-item ${index === selectedSuggestionIndex ? 'active' : ''}`;
    li.textContent = item;
    li.addEventListener('mousedown', (event) => {
      event.preventDefault();
      urlInput.value = item;
      hideSuggestions();
      navigateActiveTab(item);
    });
    suggestionsList.appendChild(li);
  });

  suggestionsList.classList.remove('hidden');
}

function hideSuggestions() {
  suggestionItems = [];
  selectedSuggestionIndex = -1;
  suggestionsList.classList.add('hidden');
  suggestionsList.innerHTML = '';
}

async function updateSuggestions(query) {
  const normalized = String(query || '').trim();
  if (!normalized) {
    hideSuggestions();
    return;
  }

  const requestId = ++suggestionRequestId;
  const local = getLocalSuggestions(normalized);
  suggestionItems = local;
  selectedSuggestionIndex = -1;
  renderSuggestions();

  try {
    const remote = await window.api.getSearchSuggestions(normalized);
    if (requestId !== suggestionRequestId) return;
    suggestionItems = mergeSuggestions([...local, ...(Array.isArray(remote) ? remote : [])], 8);
    selectedSuggestionIndex = -1;
    renderSuggestions();
  } catch {
    // Keep local suggestions.
  }
}

function getActiveTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function closeAllPanels() {
  findPanel.classList.add('hidden');
  bookmarksPanel.classList.add('hidden');
  historyPanel.classList.add('hidden');
  downloadsPanel.classList.add('hidden');
  settingsPanel.classList.add('hidden');
  permissionsPanel.classList.add('hidden');
}

function isPanelOpen(panel) {
  return !panel.classList.contains('hidden');
}

function notify(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = String(message || '');
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2600);
}

function setSecurityBadge(state, title) {
  securityBadge.classList.remove('secure', 'warning', 'danger');
  securityBadge.classList.add(state);
  if (state === 'secure') securityBadge.textContent = 'Lock';
  if (state === 'warning') securityBadge.textContent = 'Warn';
  if (state === 'danger') securityBadge.textContent = 'Unsafe';
  securityBadge.title = title || '';
}

function showLoadingOverlay() {
  pageLoadingOverlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
  pageLoadingOverlay.classList.add('hidden');
}

function updateSecurityBadgeFromUrl(url) {
  if (!url) {
    setSecurityBadge('warning', 'No page loaded');
    return;
  }
  if (url.startsWith('https://')) {
    setSecurityBadge('secure', 'Secure HTTPS connection');
    return;
  }
  if (url.startsWith('http://')) {
    setSecurityBadge('danger', 'Insecure HTTP connection');
    return;
  }
  setSecurityBadge('warning', 'Unknown security state');
}

function updateNavState() {
  const tab = getActiveTab();
  if (!tab) return;

  backBtn.disabled = !tab.webview.canGoBack();
  forwardBtn.disabled = !tab.webview.canGoForward();

  if (document.activeElement !== urlInput) {
    urlInput.value = tab.webview.getURL() || tab.url || browserConfig.startUrl;
  }

  updateSecurityBadgeFromUrl(tab.webview.getURL() || tab.url);
  if (tab.webview.isLoading?.()) {
    showLoadingOverlay();
  } else {
    hideLoadingOverlay();
  }
}

function renderTabs() {
  tabBar.innerHTML = '';

  tabs.forEach((tab) => {
    const button = document.createElement('button');
    button.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
    button.title = tab.title || tab.url;

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = `${tab.isPrivate ? '[Private] ' : ''}${tab.title || 'New Tab'}`;

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = 'x';
    close.title = 'Close tab';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });

    button.append(label, close);
    button.addEventListener('click', () => setActiveTab(tab.id));
    tabBar.appendChild(button);
  });
}

function saveSession() {
  if (browserConfig.privateMode) return;

  const payload = {
    activeTabId,
    tabs: tabs
      .filter((tab) => !tab.isPrivate)
      .map((tab) => ({
        id: tab.id,
        url: tab.webview.getURL() || tab.url,
      })),
  };

  saveJson(STORAGE_KEYS.tabsSession, payload);
}

function loadSession() {
  try {
    const parsed = loadJson(STORAGE_KEYS.tabsSession, null);
    if (!parsed || !Array.isArray(parsed.tabs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function recordHistory(tab, url, title) {
  if (browserConfig.privateMode || tab.isPrivate) return;

  const normalizedUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) return;

  historyEntries = historyEntries.filter((entry) => entry.url !== normalizedUrl);
  historyEntries.unshift({
    url: normalizedUrl,
    title: String(title || normalizedUrl).slice(0, 200),
    visitedAt: Date.now(),
  });

  historyEntries = historyEntries.slice(0, 500);
  saveHistoryEntries();
  if (panelsRendered.history || isPanelOpen(historyPanel)) {
    renderHistory();
    panelsRendered.history = true;
  }
}

function wireWebviewEvents(tab) {
  const { webview } = tab;

  webview.addEventListener('did-stop-loading', () => {
    tab.url = webview.getURL() || tab.url;
    tab.title = webview.getTitle() || tab.title;
    applyStoredZoomForTab(tab);
    recordHistory(tab, tab.url, tab.title);
    saveSession();
    renderTabs();
    if (tab.id === activeTabId) {
      updateNavState();
      if (isPanelOpen(permissionsPanel)) refreshPermissionsForActiveTab();
      hideLoadingOverlay();
    }
  });

  webview.addEventListener('did-navigate', () => {
    tab.url = webview.getURL() || tab.url;
    applyStoredZoomForTab(tab);
    if (tab.id === activeTabId) {
      updateNavState();
      if (isPanelOpen(permissionsPanel)) refreshPermissionsForActiveTab();
    }
  });

  webview.addEventListener('did-start-loading', () => {
    if (tab.id === activeTabId) showLoadingOverlay();
  });

  webview.addEventListener('did-navigate-in-page', () => {
    tab.url = webview.getURL() || tab.url;
    applyStoredZoomForTab(tab);
    if (tab.id === activeTabId) {
      updateNavState();
      if (isPanelOpen(permissionsPanel)) refreshPermissionsForActiveTab();
    }
  });

  webview.addEventListener('page-title-updated', (event) => {
    tab.title = event.title || tab.title;
    renderTabs();
  });

  webview.addEventListener('did-run-insecure-content', () => {
    if (tab.id === activeTabId) {
      setSecurityBadge('warning', 'Mixed active content blocked or detected');
    }
  });

  webview.addEventListener('did-fail-load', (event) => {
    if (tab.id !== activeTabId || event.errorCode === -3) return;
    setSecurityBadge('danger', `Load error: ${event.errorDescription || 'unknown'}`);
    hideLoadingOverlay();
  });

  webview.addEventListener('found-in-page', (event) => {
    const result = event.result || {};
    const active = result.activeMatchOrdinal || 0;
    const total = result.matches || 0;
    findStatus.textContent = `${active}/${total}`;
  });
}

function createTab(initialUrl = browserConfig.startUrl, options = {}) {
  const isPrivate = Boolean(options.isPrivate || browserConfig.privateMode);
  const partition =
    options.partition ||
    (browserConfig.privateMode ? browserConfig.partition : isPrivate ? `temp:private-tab-${nextTabId}` : browserConfig.partition);
  const tab = {
    id: nextTabId++,
    title: 'New Tab',
    url: normalizeInputToUrl(initialUrl),
    isPrivate,
    webview: document.createElement('webview'),
  };

  tab.webview.className = 'browser-webview';
  tab.webview.setAttribute('partition', partition);
  tab.webview.src = tab.url;
  showLoadingOverlay();

  wireWebviewEvents(tab);
  webviewContainer.appendChild(tab.webview);
  tabs.push(tab);

  setActiveTab(tab.id);
  renderTabs();
  saveSession();

  if (options.focusAddressBar) {
    focusAddressBar();
    stabilizeAddressBarFocusForNewTab(tab);
  }
}

async function createInlinePrivateTab(url = browserConfig.startUrl) {
  const partition = await window.api.getPrivatePartition();
  createTab(url, { isPrivate: true, partition });
}

function setActiveTab(tabId) {
  activeTabId = tabId;
  tabs.forEach((tab) => {
    tab.webview.classList.toggle('active', tab.id === tabId);
  });

  renderTabs();
  updateNavState();
  if (isPanelOpen(permissionsPanel)) refreshPermissionsForActiveTab();
  saveSession();
}

function closeTab(tabId, options = {}) {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return;

  const [removed] = tabs.splice(index, 1);
  if (!options.skipHistory && !removed.isPrivate) {
    closedTabs.unshift({
      title: removed.title,
      url: removed.webview.getURL() || removed.url,
    });
    closedTabs = closedTabs.slice(0, 50);
  }
  removed.webview.remove();

  if (tabs.length === 0) {
    createTab(browserConfig.startUrl);
    return;
  }

  if (activeTabId === tabId) {
    const nextTab = tabs[Math.max(0, index - 1)];
    setActiveTab(nextTab.id);
  } else {
    renderTabs();
  }

  saveSession();
}

function closeActiveTab() {
  const tab = getActiveTab();
  if (!tab) return;
  closeTab(tab.id);
}

function reopenLastClosedTab() {
  const lastClosed = closedTabs.shift();
  if (!lastClosed?.url) return;
  createTab(lastClosed.url, { focusAddressBar: true });
}

function focusAddressBar() {
  urlInput.focus();
  urlInput.select();
}

function stabilizeAddressBarFocusForNewTab(tab) {
  if (!tab) return;

  let ticks = 0;
  const maxTicks = 15;
  const enforceFocus = () => {
    if (activeTabId !== tab.id) return;
    if (document.activeElement !== urlInput) {
      focusAddressBar();
    }
  };

  const timer = setInterval(() => {
    ticks += 1;
    enforceFocus();
    if (ticks >= maxTicks || document.activeElement === urlInput) {
      clearInterval(timer);
    }
  }, 80);

  tab.webview.addEventListener('did-start-loading', enforceFocus, { once: true });
  tab.webview.addEventListener('dom-ready', enforceFocus, { once: true });
  tab.webview.addEventListener('did-stop-loading', enforceFocus, { once: true });
}

function navigateActiveTab(rawValue) {
  const tab = getActiveTab();
  if (!tab) return;

  const url = normalizeInputToUrl(rawValue);
  hideSuggestions();
  showLoadingOverlay();
  tab.webview.src = url;
  tab.url = url;
  updateNavState();
  saveSession();
}

function setActiveZoom(delta) {
  const tab = getActiveTab();
  if (!tab) return;

  const current = Number(tab.webview.getZoomFactor()) || 1;
  const next = Math.min(3, Math.max(0.25, current + delta));
  tab.webview.setZoomFactor(next);
  storeZoomForUrl(tab.webview.getURL() || tab.url, next);
}

function resetActiveZoom() {
  const tab = getActiveTab();
  if (!tab) return;
  const next = browserConfig.settings.defaultZoom || 1;
  tab.webview.setZoomFactor(next);
  storeZoomForUrl(tab.webview.getURL() || tab.url, next);
}

function renderBookmarks() {
  bookmarksList.innerHTML = '';

  if (bookmarks.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No bookmarks yet';
    bookmarksList.appendChild(empty);
    return;
  }

  bookmarks.forEach((bookmark, index) => {
    const item = document.createElement('li');

    const openBtn = document.createElement('button');
    openBtn.className = 'bookmark-link';
    openBtn.textContent = bookmark.title || bookmark.url;
    openBtn.title = bookmark.url;
    openBtn.addEventListener('click', () => {
      navigateActiveTab(bookmark.url);
      bookmarksPanel.classList.add('hidden');
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'bookmark-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      bookmarks.splice(index, 1);
      saveBookmarks();
      renderBookmarks();
    });

    item.append(openBtn, removeBtn);
    bookmarksList.appendChild(item);
  });
}

function renderHistory() {
  historyList.innerHTML = '';
  const filtered = getFilteredHistoryEntries();
  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No history matches';
    historyList.appendChild(empty);
    return;
  }

  filtered.slice(0, 200).forEach((entry) => {
    const item = document.createElement('li');

    const openBtn = document.createElement('button');
    openBtn.className = 'bookmark-link';
    openBtn.textContent = entry.title || entry.url;
    openBtn.title = entry.url;
    openBtn.addEventListener('click', () => {
      navigateActiveTab(entry.url);
      historyPanel.classList.add('hidden');
    });

    const timeLabel = document.createElement('span');
    timeLabel.className = 'history-time';
    timeLabel.textContent = new Date(entry.visitedAt).toLocaleString();

    item.append(openBtn, timeLabel);
    historyList.appendChild(item);
  });
}

function getFilteredHistoryEntries() {
  const query = String(historySearchInput.value || '').trim().toLowerCase();
  return historyEntries.filter((entry) => {
    if (!query) return true;
    return String(entry.title || '').toLowerCase().includes(query) || String(entry.url || '').toLowerCase().includes(query);
  });
}

function renderDownloads() {
  downloadsList.innerHTML = '';

  if (downloads.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No downloads yet';
    downloadsList.appendChild(empty);
    return;
  }

  downloads.forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'download-item';

    const name = document.createElement('div');
    name.className = 'download-name';
    name.textContent = entry.filename || 'download';

    const status = document.createElement('div');
    status.className = 'download-status';
    const total = Number(entry.totalBytes || 0);
    const received = Number(entry.receivedBytes || 0);
    const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
    status.textContent = `${entry.state}${total > 0 ? ` (${percent}%)` : ''}${entry.privateMode ? ' [private]' : ''}`;

    const actions = document.createElement('div');
    actions.className = 'download-actions';
    if (entry.state === 'completed' && entry.savePath) {
      const openBtn = document.createElement('button');
      openBtn.className = 'bookmark-remove';
      openBtn.textContent = 'Show in Folder';
      openBtn.addEventListener('click', () => {
        window.api.openDownloadInFolder(entry.id);
      });
      actions.appendChild(openBtn);
    }

    item.append(name, status, actions);
    downloadsList.appendChild(item);
  });
}

function addBookmark() {
  const tab = getActiveTab();
  if (!tab) return;

  const url = tab.webview.getURL() || tab.url;
  if (!url) return;
  if (bookmarks.some((bookmark) => bookmark.url === url)) return;

  bookmarks.unshift({
    title: tab.webview.getTitle() || 'Saved page',
    url,
  });

  saveBookmarks();
  renderBookmarks();
}

function openFindPanel() {
  closeAllPanels();
  findPanel.classList.remove('hidden');
  findInput.value = '';
  findStatus.textContent = '';
  findInput.focus();
}

function doFind(forward = true) {
  const tab = getActiveTab();
  if (!tab) return;

  const query = findInput.value.trim();
  if (!query) {
    tab.webview.stopFindInPage('clearSelection');
    findStatus.textContent = '';
    return;
  }

  tab.webview.findInPage(query, { forward, findNext: true, matchCase: false });
}

function closeFindPanel() {
  findPanel.classList.add('hidden');
  const tab = getActiveTab();
  if (tab) tab.webview.stopFindInPage('clearSelection');
}

async function initSettingsUI() {
  const latestSettings = await window.api.getSettings();
  browserConfig.settings = {
    ...browserConfig.settings,
    ...latestSettings,
  };
  browserConfig.startUrl = browserConfig.settings.startupPage || browserConfig.startUrl;

  startupPageInput.value = browserConfig.settings.startupPage || browserConfig.startUrl;
  defaultZoomInput.value = String(browserConfig.settings.defaultZoom || 1);
  restoreSessionToggle.checked = Boolean(browserConfig.settings.restoreSession);

  profileSelect.innerHTML = '';
  (browserConfig.settings.profiles || ['personal', 'work']).forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile;
    option.textContent = profile;
    profileSelect.appendChild(option);
  });
  profileSelect.value = browserConfig.profile;
  profileChipBtn.textContent = browserConfig.profile || 'profile';

  const privacy = await window.api.getPrivacySettings();
  blockPopupsToggle.checked = Boolean(privacy.blockPopups);
  blockThirdPartyCookiesToggle.checked = Boolean(privacy.blockThirdPartyCookies);
  blockTrackersToggle.checked = Boolean(privacy.blockTrackers);
  clearDataOnExitToggle.checked = Boolean(privacy.clearDataOnExit);

  const mode = getThemeMode();
  themeSelect.value = mode;
  applyTheme(mode);
}

async function saveSettings() {
  const updates = {
    startupPage: String(startupPageInput.value || browserConfig.startUrl).trim(),
    defaultZoom: Number(defaultZoomInput.value || 1),
    restoreSession: Boolean(restoreSessionToggle.checked),
    currentProfile: profileSelect.value,
  };

  const beforeProfile = browserConfig.profile;
  const next = await window.api.updateSettings(updates);
  browserConfig.settings = {
    ...browserConfig.settings,
    ...next,
  };
  browserConfig.startUrl = browserConfig.settings.startupPage || browserConfig.startUrl;

  if (beforeProfile !== browserConfig.settings.currentProfile) {
    await window.api.relaunchApp();
    return;
  }

  profileChipBtn.textContent = browserConfig.settings.currentProfile || browserConfig.profile || 'profile';

  const activeTab = getActiveTab();
  if (activeTab) {
    applyStoredZoomForTab(activeTab);
  }
}

function buildBackupPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: browserConfig.profile,
    themeMode: getThemeMode(),
    bookmarks,
    historyEntries,
    tabsSession: loadSession(),
    zoomByOrigin,
    settings: {
      startupPage: browserConfig.settings.startupPage,
      defaultZoom: browserConfig.settings.defaultZoom,
      restoreSession: browserConfig.settings.restoreSession,
      blockPopups: blockPopupsToggle.checked,
      blockThirdPartyCookies: blockThirdPartyCookiesToggle.checked,
      blockTrackers: blockTrackersToggle.checked,
      clearDataOnExit: clearDataOnExitToggle.checked,
    },
  };
}

function exportBackup() {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `jessetech-backup-${browserConfig.profile}-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function importBackupFromFile(file) {
  if (!file) return;

  const text = await file.text();
  const data = JSON.parse(text);

  if (Array.isArray(data.bookmarks)) {
    bookmarks = data.bookmarks;
    saveBookmarks();
    renderBookmarks();
  }

  if (Array.isArray(data.historyEntries)) {
    historyEntries = data.historyEntries;
    saveHistoryEntries();
    renderHistory();
  }

  if (data.zoomByOrigin && typeof data.zoomByOrigin === 'object') {
    zoomByOrigin = data.zoomByOrigin;
    saveZoomByOrigin();
  }

  if (data.tabsSession && Array.isArray(data.tabsSession.tabs) && !browserConfig.privateMode) {
    saveJson(STORAGE_KEYS.tabsSession, data.tabsSession);
  }

  if (typeof data.themeMode === 'string') {
    setThemeMode(data.themeMode);
    themeSelect.value = data.themeMode;
  }

  if (data.settings && typeof data.settings === 'object') {
    const updates = {
      startupPage: String(data.settings.startupPage || browserConfig.settings.startupPage || browserConfig.startUrl),
      defaultZoom: Number(data.settings.defaultZoom || browserConfig.settings.defaultZoom || 1),
      restoreSession: Boolean(data.settings.restoreSession),
    };
    await window.api.updateSettings(updates);

    await window.api.updatePrivacySettings({
      blockPopups: Boolean(data.settings.blockPopups),
      blockThirdPartyCookies: Boolean(data.settings.blockThirdPartyCookies),
      blockTrackers: Boolean(data.settings.blockTrackers),
      clearDataOnExit: Boolean(data.settings.clearDataOnExit),
    });
  }

  await initSettingsUI();
}

function getActiveOrigin() {
  const tab = getActiveTab();
  if (!tab) return '';
  try {
    return new URL(tab.webview.getURL() || tab.url).origin;
  } catch {
    return '';
  }
}

async function refreshPermissionsForActiveTab() {
  const origin = getActiveOrigin();
  permissionsOrigin.textContent = origin || 'No active site';
  if (!origin) return;

  const permissions = await window.api.getPermissions(origin);
  cameraPermissionSelect.value = permissions.camera || 'ask';
  microphonePermissionSelect.value = permissions.microphone || 'ask';
  geolocationPermissionSelect.value = permissions.geolocation || 'ask';
  notificationsPermissionSelect.value = permissions.notifications || 'ask';
}

async function updatePermission(permission, value) {
  const origin = getActiveOrigin();
  if (!origin) return;
  await window.api.setPermission(origin, permission, value);
}

function togglePanel(panel) {
  const shouldOpen = panel.classList.contains('hidden');
  closeAllPanels();
  if (shouldOpen) {
    if (panel === bookmarksPanel && !panelsRendered.bookmarks) {
      renderBookmarks();
      panelsRendered.bookmarks = true;
    }
    if (panel === historyPanel && !panelsRendered.history) {
      renderHistory();
      panelsRendered.history = true;
    }
    if (panel === downloadsPanel && !downloadsInitialized) {
      initDownloads();
    }
    panel.classList.remove('hidden');
    if (panel === historyPanel) {
      historySearchInput.focus();
      historySearchInput.select();
    }
  }
}

function registerMainEventHooks() {
  removeContextListener = window.api.onOpenLinkInNewTab((url) => {
    createTab(url);
  });

  removeCertListener = window.api.onCertificateError((payload) => {
    const tab = getActiveTab();
    if (!tab) return;
    const activeUrl = tab.webview.getURL() || tab.url;
    if (payload?.url && activeUrl && payload.url.startsWith(activeUrl)) {
      setSecurityBadge('danger', `Certificate error: ${payload.error || 'unknown'}`);
    }
  });
}

function bindEvents() {
  newTabBtn.addEventListener('click', () => createTab(browserConfig.startUrl, { focusAddressBar: true }));
  newPrivateTabBtn.addEventListener('click', () => createInlinePrivateTab(browserConfig.startUrl));
  newPrivateWindowBtn.addEventListener('click', () => window.api.openPrivateWindow());

  backBtn.addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab?.webview.canGoBack()) tab.webview.goBack();
  });

  forwardBtn.addEventListener('click', () => {
    const tab = getActiveTab();
    if (tab?.webview.canGoForward()) tab.webview.goForward();
  });

  reloadBtn.addEventListener('click', () => {
    const tab = getActiveTab();
    tab?.webview.reload();
  });

  homeBtn.addEventListener('click', () => navigateActiveTab(browserConfig.startUrl));
  profileChipBtn.addEventListener('click', () => togglePanel(settingsPanel));

  findBtn.addEventListener('click', openFindPanel);
  historyBtn.addEventListener('click', () => togglePanel(historyPanel));
  downloadsBtn.addEventListener('click', () => togglePanel(downloadsPanel));
  permissionsBtn.addEventListener('click', () => {
    refreshPermissionsForActiveTab();
    togglePanel(permissionsPanel);
  });

  urlInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && suggestionItems.length > 0) {
      event.preventDefault();
      selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestionItems.length - 1);
      renderSuggestions();
      return;
    }

    if (event.key === 'ArrowUp' && suggestionItems.length > 0) {
      event.preventDefault();
      selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
      renderSuggestions();
      return;
    }

    if (event.key === 'Escape') {
      hideSuggestions();
      return;
    }

    if (event.key === 'Enter') {
      const selected = selectedSuggestionIndex >= 0 ? suggestionItems[selectedSuggestionIndex] : urlInput.value;
      navigateActiveTab(selected);
      hideSuggestions();
      urlInput.blur();
    }
  });

  urlInput.addEventListener('input', () => updateSuggestions(urlInput.value));
  urlInput.addEventListener('focus', () => updateSuggestions(urlInput.value));
  urlInput.addEventListener('blur', () => setTimeout(hideSuggestions, 120));

  findInput.addEventListener('input', () => doFind(true));
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doFind(!event.shiftKey);
  });
  findPrevBtn.addEventListener('click', () => doFind(false));
  findNextBtn.addEventListener('click', () => doFind(true));
  findCloseBtn.addEventListener('click', closeFindPanel);

  addBookmarkBtn.addEventListener('click', addBookmark);
  bookmarksBtn.addEventListener('click', () => togglePanel(bookmarksPanel));

  historySearchInput.addEventListener('input', renderHistory);
  historySearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const first = getFilteredHistoryEntries()[0];
    if (!first?.url) return;
    navigateActiveTab(first.url);
    historyPanel.classList.add('hidden');
  });

  clearHistoryBtn.addEventListener('click', () => {
    historyEntries = [];
    saveHistoryEntries();
    renderHistory();
  });

  settingsBtn.addEventListener('click', () => togglePanel(settingsPanel));
  saveSettingsBtn.addEventListener('click', async () => {
    try {
      await saveSettings();
      notify('Settings saved', 'success');
    } catch (error) {
      console.error('Settings save failed', error);
      notify('Failed to save settings', 'error');
    }
  });

  exportBackupBtn.addEventListener('click', () => {
    try {
      exportBackup();
      notify('Backup exported', 'success');
    } catch (error) {
      console.error('Backup export failed', error);
      notify('Failed to export backup', 'error');
    }
  });
  importBackupBtn.addEventListener('click', () => importBackupInput.click());
  importBackupInput.addEventListener('change', async () => {
    try {
      const file = importBackupInput.files?.[0];
      await importBackupFromFile(file);
      notify('Backup imported', 'success');
    } catch (error) {
      console.error('Backup import failed', error);
      notify('Failed to import backup', 'error');
    } finally {
      importBackupInput.value = '';
    }
  });

  addProfileBtn.addEventListener('click', async () => {
    try {
      const name = String(newProfileInput.value || '').trim();
      if (!name) return;
      const profiles = await window.api.addProfile(name);
      browserConfig.settings.profiles = profiles;
      const current = profileSelect.value;
      profileSelect.innerHTML = '';
      profiles.forEach((profile) => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;
        profileSelect.appendChild(option);
      });
      profileSelect.value = current;
      newProfileInput.value = '';
      notify('Profile added', 'success');
    } catch (error) {
      console.error('Profile add failed', error);
      notify('Failed to add profile', 'error');
    }
  });

  themeSelect.addEventListener('change', () => setThemeMode(themeSelect.value));

  mediaQuery.addEventListener('change', () => {
    if (getThemeMode() === 'system') applyTheme('system');
  });

  blockPopupsToggle.addEventListener('change', () => {
    window.api.updatePrivacySettings({ blockPopups: blockPopupsToggle.checked });
  });

  blockThirdPartyCookiesToggle.addEventListener('change', () => {
    window.api.updatePrivacySettings({ blockThirdPartyCookies: blockThirdPartyCookiesToggle.checked });
  });

  blockTrackersToggle.addEventListener('change', () => {
    window.api.updatePrivacySettings({ blockTrackers: blockTrackersToggle.checked });
  });

  clearDataOnExitToggle.addEventListener('change', () => {
    window.api.updatePrivacySettings({ clearDataOnExit: clearDataOnExitToggle.checked });
  });

  cameraPermissionSelect.addEventListener('change', () => updatePermission('camera', cameraPermissionSelect.value));
  microphonePermissionSelect.addEventListener('change', () => updatePermission('microphone', microphonePermissionSelect.value));
  geolocationPermissionSelect.addEventListener('change', () => updatePermission('geolocation', geolocationPermissionSelect.value));
  notificationsPermissionSelect.addEventListener('change', () => updatePermission('notifications', notificationsPermissionSelect.value));

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!findPanel.classList.contains('hidden')) {
        closeFindPanel();
        return;
      }
      if (suggestionItems.length > 0) {
        hideSuggestions();
        return;
      }
      closeAllPanels();
      return;
    }

    const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
    if (!modifierPressed) return;

    const key = event.key.toLowerCase();
    const tab = getActiveTab();

    if (key === 'l') {
      event.preventDefault();
      urlInput.focus();
      urlInput.select();
      return;
    }

    if (key === 't') {
      if (event.shiftKey) {
        event.preventDefault();
        reopenLastClosedTab();
        return;
      }
      event.preventDefault();
      createTab(browserConfig.startUrl, { focusAddressBar: true });
      return;
    }

    if (key === 'w') {
      event.preventDefault();
      closeActiveTab();
      return;
    }

    if (key === 'r') {
      event.preventDefault();
      tab?.webview.reload();
      return;
    }

    if (key === 'f') {
      event.preventDefault();
      openFindPanel();
      return;
    }

    if (key === ',') {
      event.preventDefault();
      togglePanel(settingsPanel);
      return;
    }

    if (key === '=' || key === '+') {
      event.preventDefault();
      setActiveZoom(0.1);
      return;
    }

    if (key === '-') {
      event.preventDefault();
      setActiveZoom(-0.1);
      return;
    }

    if (key === '0') {
      event.preventDefault();
      resetActiveZoom();
      return;
    }

    if (event.key === '[') {
      event.preventDefault();
      if (tab?.webview.canGoBack()) tab.webview.goBack();
      return;
    }

    if (event.key === ']') {
      event.preventDefault();
      if (tab?.webview.canGoForward()) tab.webview.goForward();
      return;
    }

    if ((isMac ? event.metaKey : event.ctrlKey) && event.shiftKey && key === 'n') {
      event.preventDefault();
      window.api.openPrivateWindow();
    }
  });

  window.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const clickedAddress = Boolean(target.closest('.address-wrap'));
    if (!clickedAddress && suggestionItems.length > 0) {
      hideSuggestions();
    }

    const clickedInsidePanel = Boolean(target.closest('.panel'));
    const clickedPanelToggle = Boolean(
      target.closest(
        '#settingsBtn, #profileChipBtn, #bookmarksBtn, #historyBtn, #downloadsBtn, #permissionsBtn, #findBtn',
      ),
    );

    if (!clickedInsidePanel && !clickedPanelToggle) {
      closeAllPanels();
    }
  });
}

async function initDownloads() {
  if (downloadsInitialized) return;
  downloadsInitialized = true;
  downloads = await window.api.getDownloads();
  renderDownloads();
  removeDownloadsListener = window.api.onDownloadsUpdate((payload) => {
    downloads = Array.isArray(payload) ? payload : [];
    renderDownloads();
  });
}

function restoreSessionOrDefault() {
  if (browserConfig.privateMode || !browserConfig.settings.restoreSession) {
    createTab(browserConfig.startUrl);
    return;
  }

  const sessionData = loadSession();
  if (!sessionData?.tabs?.length) {
    createTab(browserConfig.startUrl);
    return;
  }

  const idMap = new Map();
  sessionData.tabs.forEach((tabData) => {
    const before = nextTabId;
    createTab(tabData.url || browserConfig.startUrl);
    idMap.set(tabData.id, before);
  });

  const restoredActive = idMap.get(sessionData.activeTabId);
  if (restoredActive) {
    setActiveTab(restoredActive);
  }
}

async function init() {
  browserConfig = await window.api.getBrowserConfig();
  bookmarks = loadBookmarks();
  historyEntries = loadHistoryEntries();
  zoomByOrigin = loadJson(STORAGE_KEYS.zoomByOrigin, {});

  bindEvents();
  registerMainEventHooks();
  restoreSessionOrDefault();
  await initSettingsUI();
  profileChipBtn.textContent = browserConfig.profile || 'profile';

  if (browserConfig.privateMode) {
    document.title = 'JesseTech Browser (Private Window)';
  }
}

window.addEventListener('beforeunload', () => {
  if (typeof removeDownloadsListener === 'function') removeDownloadsListener();
  if (typeof removeContextListener === 'function') removeContextListener();
  if (typeof removeCertListener === 'function') removeCertListener();
});

init();
