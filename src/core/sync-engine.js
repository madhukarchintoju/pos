import { EventBus } from './event-bus.js'
import { openDatabase, promisifyRequest } from './idb.js'
import { ExponentialBackoff } from './backoff.js'

export class SyncEngine {
  constructor({ dbName = 'posdb', version = 1, endpoint = null, batchSize = 50 } = {}) {
    this.endpoint = endpoint; // e.g., '/api'
    this.batchSize = batchSize;
    this.events = new EventBus();
    this.dbPromise = openDatabase({ name: dbName, version, upgrade() {} });
    this.timer = null;
    this.backoff = new ExponentialBackoff({ baseMs: 1000, maxMs: 30000, factor: 2, jitter: 0.25 });
    this.running = false;
  }

  on(eventName, handler) {
    return this.events.on(eventName, handler);
  }

  start(intervalMs = 15000) {
    if (this.timer) return;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      try {
        await this.syncOnce();
        this.backoff.reset();
      } catch (_) {
        // swallow; schedule with backoff
      } finally {
        const delay = this.backoff.nextDelayMs();
        this.timer = setTimeout(tick, Math.max(intervalMs, delay));
      }
    };
    // trigger immediate on online
    const onlineTick = () => { if (this.running) this.syncOnce().catch(() => {}); };
    window.addEventListener('online', onlineTick);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onlineTick();
    });
    tick();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
  }

  async syncOnce() {
    const db = await this.dbPromise;
    // PUSH
    const pushed = await this.#pushOutboxBatches(db);
    // PULL (if endpoint provided)
    let pulled = 0;
    if (this.endpoint) {
      pulled = await this.#pullChanges(db);
    }
    this.events.emit('sync:complete', { pushed, pulled });
  }

  async #pushOutboxBatches(db) {
    const toArray = (store, indexName, limit) => new Promise((resolve, reject) => {
      const list = [];
      const source = indexName ? store.index(indexName) : store;
      const req = source.openCursor();
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (c && list.length < limit) { list.push(c.value); c.continue(); } else resolve(list);
      };
      req.onerror = () => reject(req.error);
    });

    let totalPushed = 0;
    while (true) {
      const readTx = db.transaction('outbox', 'readonly');
      const ops = await toArray(readTx.objectStore('outbox'), 'byCreatedAt', this.batchSize);
      if (ops.length === 0) break;
      this.events.emit('sync:push', { batch: ops.length });
      // Try to send to server if endpoint present; otherwise simulate success
      let ok = true;
      if (this.endpoint) {
        try {
          const res = await fetch(`${this.endpoint}/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operations: ops }),
          });
          ok = res.ok;
          if (!ok) throw new Error(`Push failed: ${res.status}`);
        } catch (e) {
          this.events.emit('sync:error', { phase: 'push', error: String(e) });
          throw e;
        }
      }
      if (ok) {
        const writeTx = db.transaction('outbox', 'readwrite');
        const st = writeTx.objectStore('outbox');
        await Promise.all(ops.map((o) => promisifyRequest(st.delete(o.id))));
        totalPushed += ops.length;
      }
      if (ops.length < this.batchSize) break;
    }
    return totalPushed;
  }

  async #pullChanges(db) {
    const getMeta = (key) => new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    const setMeta = (key, value) => new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      const req = tx.objectStore('meta').put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    const collections = ['products', 'orders', 'orderItems'];
    let totalPulled = 0;
    for (const collection of collections) {
      let cursor = (await getMeta(`cursor:${collection}`)) ?? null;
      let keepGoing = true;
      while (keepGoing) {
        this.events.emit('sync:pull', { collection, cursor });
        let res;
        try {
          res = await fetch(`${this.endpoint}/sync/pull?collection=${encodeURIComponent(collection)}&since=${encodeURIComponent(cursor ?? '')}&limit=${this.batchSize}`);
          if (!res.ok) throw new Error(`Pull failed ${res.status}`);
        } catch (e) {
          this.events.emit('sync:error', { phase: 'pull', collection, error: String(e) });
          throw e;
        }
        const json = await res.json();
        const changes = json.changes ?? [];
        if (changes.length === 0) {
          keepGoing = false;
          break;
        }
        await this.#applyChanges(db, collection, changes);
        cursor = json.nextCursor ?? cursor;
        await setMeta(`cursor:${collection}`, cursor);
        totalPulled += changes.length;
        if (!json.hasMore || changes.length < this.batchSize) keepGoing = false;
      }
    }
    return totalPulled;
  }

  async #applyChanges(db, collection, changes) {
    const tx = db.transaction([collection], 'readwrite');
    const st = tx.objectStore(collection);
    for (const ch of changes) {
      if (ch.type === 'delete') {
        await promisifyRequest(st.delete(ch.id));
      } else {
        await promisifyRequest(st.put(ch.document));
      }
    }
  }
}


