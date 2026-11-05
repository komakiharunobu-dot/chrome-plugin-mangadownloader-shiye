"use strict";
(() => {
  let opening;
  function database() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open("shiye-chapters", 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore("chapters");
          db.createObjectStore("images");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { opening = null; reject(request.error); };
      });
    }
    return opening;
  }
  async function read(store, method, key) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const target = db.transaction(store).objectStore(store);
      const req = key === undefined ? target[method]() : target[method](key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function write(operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["chapters", "images"], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("本地缓存写入失败"));
      operation(tx.objectStore("chapters"), tx.objectStore("images"));
    });
  }
  globalThis.ShiyeDB = {
    chapter: tabId => read("chapters", "get", tabId),
    blob: (tabId, key) => read("images", "get", [tabId, key]),
    tabs: () => read("chapters", "getAllKeys"),
    save(tabId, state, blobs = []) {
      return write((chapters, images) => {
        chapters.put(state, tabId);
        for (const [key, blob] of blobs) images.put(blob, [tabId, key]);
      });
    },
    clear(tabId) {
      return write((chapters, images) => {
        chapters.delete(tabId);
        images.delete(IDBKeyRange.bound([tabId], [tabId, []]));
      });
    }
  };
})();
