import { EventBus } from './event-bus.js'
import { openDatabase, promisifyRequest } from './idb.js'

export class OfflineDataStore {
  constructor({ dbName = 'posdb', version = 2 } = {}) {
    this.dbName = dbName;
    this.version = version;
    this.events = new EventBus();
    this.dbPromise = this.#init();
    this.cache = new Map();
  }

  async #init() {
    const db = await openDatabase({
      name: this.dbName,
      version: this.version,
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('products')) {
          const store = db.createObjectStore('products', { keyPath: 'id' });
          store.createIndex('byName', 'nameLower');
          store.createIndex('byCategory', 'category');
        }
        if (!db.objectStoreNames.contains('orders')) {
          const store = db.createObjectStore('orders', { keyPath: 'id' });
          store.createIndex('byStatus', 'status');
          store.createIndex('byUpdatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('orderItems')) {
          const s = db.createObjectStore('orderItems', { keyPath: 'id' });
          s.createIndex('byOrder', 'orderId');
        } else if (oldVersion < 2) {
          const s = db.transaction.objectStore('orderItems');
          if (!s.indexNames.contains('byOrder')) s.createIndex('byOrder', 'orderId');
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'id' });
          store.createIndex('byCollection', 'collection');
          store.createIndex('byCreatedAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('printJobs')) {
          const store = db.createObjectStore('printJobs', { keyPath: 'id' });
          store.createIndex('byStatus', 'status');
          store.createIndex('byPriority', 'priority');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      },
    });
    return db;
  }

  on(eventName, handler) {
    return this.events.on(eventName, handler);
  }

  async withTransaction(storeNames, mode, fn, { retries = 2 } = {}) {
    const db = await this.dbPromise;
    let attempt = 0;
    while (true) {
      try {
        const tx = db.transaction(storeNames, mode);
        const result = await fn(tx);
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        });
        return result;
      } catch (e) {
        if (attempt++ >= retries) throw e;
        await new Promise((r) => setTimeout(r, 100 * attempt));
      }
    }
  }

  async put(collection, document) {
    const now = Date.now();
    const doc = { ...document, updatedAt: now };
    await this.withTransaction([collection, 'outbox'], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(collection).put(doc));
      const op = {
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        collection,
        opType: 'upsert',
        docId: doc.id,
        payload: doc,
        createdAt: now,
      };
      await promisifyRequest(tx.objectStore('outbox').put(op));
    });
    this.cache.set(`${collection}:${doc.id}`, doc);
    this.events.emit('change', { collection, type: 'put', doc });
    return doc;
  }

  async createOrder({ items, note, totals }) {
    const id = `o_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    const order = { id, status: 'pending', note: note ?? '', subtotal: totals.subtotal, createdAt: now, updatedAt: now };
    const orderItems = items.map(({ product, qty }) => ({ id: `${id}_${product.id}`, orderId: id, productId: product.id, name: product.name, price: product.price, qty }));
    await this.withTransaction(['orders', 'orderItems', 'outbox'], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore('orders').put(order));
      for (const oi of orderItems) await promisifyRequest(tx.objectStore('orderItems').put(oi));
      const op = { id: `${now}-${Math.random().toString(36).slice(2)}`, collection: 'orders', opType: 'create', docId: id, payload: { order, orderItems }, createdAt: now };
      await promisifyRequest(tx.objectStore('outbox').put(op));
    });
    this.events.emit('change', { collection: 'orders', type: 'create', doc: order });
    return { order, orderItems };
  }

  async get(collection, id) {
    const key = `${collection}:${id}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const db = await this.dbPromise;
    const tx = db.transaction(collection, 'readonly');
    const store = tx.objectStore(collection);
    const doc = await promisifyRequest(store.get(id));
    if (doc) this.cache.set(key, doc);
    return doc;
  }

  async queryProductsByPrefix(prefix) {
    const db = await this.dbPromise;
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const index = store.index('byName');
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const results = [];
    return new Promise((resolve, reject) => {
      const req = index.openCursor(range);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async delete(collection, id) {
    const now = Date.now();
    await this.withTransaction([collection, 'outbox'], 'readwrite', async (tx) => {
      await promisifyRequest(tx.objectStore(collection).delete(id));
      const op = {
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        collection,
        opType: 'delete',
        docId: id,
        createdAt: now,
      };
      await promisifyRequest(tx.objectStore('outbox').put(op));
    });
    this.cache.delete(`${collection}:${id}`);
    this.events.emit('change', { collection, type: 'delete', id });
  }

  async update(collection, id, mutate) {
    const current = await this.get(collection, id);
    const updated = mutate({ ...(current || {}), id });
    return this.put(collection, updated);
  }

  async updateOrderStatus(orderId, nextStatus) {
    const now = Date.now();
    await this.withTransaction(['orders', 'outbox'], 'readwrite', async (tx) => {
      const st = tx.objectStore('orders');
      const order = await new Promise((resolve, reject) => {
        const r = st.get(orderId); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      if (!order) throw new Error('Order not found');
      const updated = { ...order, status: nextStatus, updatedAt: now };
      await promisifyRequest(st.put(updated));
      const op = { id: `${now}-${Math.random().toString(36).slice(2)}`, collection: 'orders', opType: 'update', docId: orderId, payload: { status: nextStatus, updatedAt: now }, createdAt: now };
      await promisifyRequest(tx.objectStore('outbox').put(op));
    });
    this.events.emit('change', { collection: 'orders', type: 'status', id: orderId, status: nextStatus });
  }

  async getRecentOrders(limit = 10) {
    const db = await this.dbPromise;
    const tx = db.transaction('orders', 'readonly');
    const idx = tx.objectStore('orders').index('byUpdatedAt');
    const list = [];
    return new Promise((resolve, reject) => {
      const req = idx.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (c && list.length < limit) { list.push(c.value); c.continue(); }
        else resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getOrderItems(orderId) {
    const db = await this.dbPromise;
    const tx = db.transaction('orderItems', 'readonly');
    const idx = tx.objectStore('orderItems').index('byOrder');
    const list = [];
    return new Promise((resolve, reject) => {
      const req = idx.openCursor(IDBKeyRange.only(orderId));
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { list.push(c.value); c.continue(); } else resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }
}


