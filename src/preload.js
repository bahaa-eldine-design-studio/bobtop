const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bobtop', {
  getStore: () => ipcRenderer.invoke('app:getStore'),
  saveSelectedGroups: (ids) => ipcRenderer.invoke('app:saveSelectedGroups', ids),
  toggleMonitoring: (start) => ipcRenderer.invoke('app:toggleMonitoring', start),
  getMonitoringStatus: () => ipcRenderer.invoke('app:getMonitoringStatus'),
  checkLogin: () => ipcRenderer.invoke('fb:checkLogin'),
  openLogin: () => ipcRenderer.invoke('fb:openLogin'),
  logout: () => ipcRenderer.invoke('fb:logout'),
  fetchGroups: () => ipcRenderer.invoke('fb:fetchGroups'),
  testNotification: () => ipcRenderer.invoke('app:testNotification'),
  manualPoll: () => ipcRenderer.invoke('monitor:manualPoll'),
  onNewPost: (cb) => ipcRenderer.on('monitor:newPost', (e, data) => cb(data)),
  onStatus: (cb) => ipcRenderer.on('monitor:status', (e, data) => cb(data)),
});
