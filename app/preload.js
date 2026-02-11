const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getBrowserConfig: () => ipcRenderer.invoke('browser:getConfig'),
  getPrivatePartition: () => ipcRenderer.invoke('browser:newPrivatePartition'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (updates) => ipcRenderer.invoke('settings:update', updates),
  addProfile: (name) => ipcRenderer.invoke('profiles:add', name),
  relaunchApp: () => ipcRenderer.invoke('app:relaunch'),

  getPrivacySettings: () => ipcRenderer.invoke('privacy:get'),
  updatePrivacySettings: (updates) => ipcRenderer.invoke('privacy:update', updates),

  getPermissions: (origin) => ipcRenderer.invoke('permissions:get', origin),
  setPermission: (origin, permission, value) => ipcRenderer.invoke('permissions:set', origin, permission, value),

  getSearchSuggestions: (query) => ipcRenderer.invoke('search:suggest', query),

  getDownloads: () => ipcRenderer.invoke('downloads:list'),
  openDownloadInFolder: (id) => ipcRenderer.invoke('downloads:open', id),

  openPrivateWindow: () => ipcRenderer.invoke('window:new-private'),

  onDownloadsUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('downloads:update', listener);
    return () => ipcRenderer.removeListener('downloads:update', listener);
  },

  onOpenLinkInNewTab: (handler) => {
    const listener = (_event, url) => handler(url);
    ipcRenderer.on('context:open-link-new-tab', listener);
    return () => ipcRenderer.removeListener('context:open-link-new-tab', listener);
  },

  onCertificateError: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('security:certificate-error', listener);
    return () => ipcRenderer.removeListener('security:certificate-error', listener);
  },
});
