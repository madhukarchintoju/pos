export function openDatabase({ name, version, upgrade }) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => upgrade?.(request.result, event.oldVersion, event.newVersion, event.target.transaction);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transact(db, storeNames, mode, executor) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    let result;
    try {
      result = executor(tx);
    } catch (e) {
      reject(e);
    }
  });
}

export function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getStore(tx, name) {
  return tx.objectStore(name);
}


