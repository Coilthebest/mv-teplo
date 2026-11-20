'use strict';
// Store bytes rather than browser-backed File handles, including in private tabs.
window.TeploStore = function (database, store) {
  let connection;
  const queue = new Map();
  const cached = new WeakMap();
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const r = indexedDB.open(database, 1);
      const timer = setTimeout(() => reject(Error('storage_timeout')), 2500);
      r.onupgradeneeded = () => r.result.createObjectStore(store);
      r.onsuccess = () => {
        clearTimeout(timer);
        r.result.onversionchange = () => { r.result.close(); connection = null; };
        resolve(r.result);
      };
      r.onerror = () => { clearTimeout(timer); reject(r.error); };
      r.onblocked = () => { clearTimeout(timer); reject(Error('storage_blocked')); };
    });
    return connection;
  }
  async function encode(value) {
    if (value instanceof Blob) {
      if (!cached.has(value)) cached.set(value, value.arrayBuffer().then(bytes => ({
        teploBytes: bytes, type: value.type, name: value.name, lastModified: value.lastModified
      })));
      return cached.get(value);
    }
    if (Array.isArray(value)) return Promise.all(value.map(encode));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k,v]) => [k, await encode(v)])));
  }
  function decode(value) {
    if (!value || typeof value !== 'object' || value instanceof Blob) return value;
    if (value.teploBytes instanceof ArrayBuffer) {
      return value.name === undefined ? new Blob([value.teploBytes], value) : new File([value.teploBytes], value.name, value);
    }
    if (Array.isArray(value)) return value.map(decode);
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, decode(v)]));
  }
  function toJSON(_, value) {
    if (!(value instanceof ArrayBuffer)) return value;
    const bytes = new Uint8Array(value), chunks = [];
    for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
    return { base64Bytes: btoa(chunks.join('')) };
  }
  function fromJSON(_, value) {
    return value && typeof value.base64Bytes === 'string'
      ? Uint8Array.from(atob(value.base64Bytes), c => c.charCodeAt(0)).buffer : value;
  }
  async function access(action, key, value) {
    const backup = database + ':' + key;
    if (action === 'get') {
      let json;
      try { json = sessionStorage.getItem(backup); } catch {}
      if (json !== null && json !== undefined) return decode(JSON.parse(json, fromJSON));
    }
    const encoded = action === 'put' ? await encode(value) : undefined;
    try {
      const db = await open();
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(store, action === 'get' ? 'readonly' : 'readwrite');
        const data = tx.objectStore(store);
        const r = action === 'get' ? data.get(key) : action === 'delete' ? data.delete(key) : data.put(encoded, key);
        const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(Error('storage_timeout')); }, 5000);
        tx.oncomplete = () => { clearTimeout(timer); resolve(r.result); };
        tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(tx.error || Error('storage_failed')); };
      });
      if (action !== 'get') { try { sessionStorage.removeItem(backup); } catch {} }
      return action === 'get' ? decode(result) : true;
    } catch (error) {
      if (action === 'get') throw error;
      sessionStorage.setItem(backup, JSON.stringify(action === 'delete' ? null : encoded, toJSON));
      return true;
    }
  }
  return (action, key, value) => {
    const job = (queue.get(key) || Promise.resolve()).then(() => access(action, key, value));
    const tail = job.catch(() => {});
    queue.set(key, tail);
    tail.then(() => { if (queue.get(key) === tail) queue.delete(key); });
    return job;
  };
};
