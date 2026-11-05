"use strict";
importScripts("db.js");

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.warn);
});

chrome.tabs.onRemoved.addListener(tabId => {
  ShiyeDB.clear(tabId).catch(console.warn);
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    const live = new Set(tabs.map(tab => tab.id));
    for (const tabId of await ShiyeDB.tabs()) {
      if (!live.has(tabId)) await ShiyeDB.clear(tabId);
    }
  } catch (error) {
    console.warn(error);
  }
});
