import { EventBus } from './event-bus.js'
import { openDatabase, promisifyRequest } from './idb.js'
import { renderReceipt } from '../templates/receipt.js'

export class PrintJobManager {
  constructor({ dbName = 'posdb', version = 1 } = {}) {
    this.events = new EventBus();
    this.dbPromise = openDatabase({ name: dbName, version, upgrade() {} });
    this.running = false;
    this.handlers = new Map(); // destination -> async (payload) => void
    this.maxAttempts = 5;
  }

  on(eventName, handler) {
    return this.events.on(eventName, handler);
  }

  async enqueue(job) {
    const db = await this.dbPromise;
    const tx = db.transaction('printJobs', 'readwrite');
    const store = tx.objectStore('printJobs');
    const now = Date.now();
    const record = {
      id: job.id ?? `${now}-${Math.random().toString(36).slice(2)}`,
      status: 'queued',
      priority: job.priority ?? 0,
      createdAt: now,
      attempts: 0,
      nextRunAt: now,
      error: null,
      ...job,
    };
    await promisifyRequest(store.put(record));
    this.events.emit('queued', record);
    return record;
  }

  async enqueueReceipt({ order, items }) {
    return this.enqueue({
      destination: 'receipt',
      priority: 0,
      payload: { order, items },
    });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try {
        const processed = await this.#processOne();
        // If nothing processed, small idle wait
        if (!processed) await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('print loop error', e);
      } finally {
        setTimeout(loop, 200);
      }
    };
    loop();
  }

  stop() { this.running = false; }

  async #processOne() {
    const db = await this.dbPromise;
    // Find next eligible job: status queued with nextRunAt <= now, lowest priority first
    const now = Date.now();
    const readTx = db.transaction('printJobs', 'readonly');
    const idx = readTx.objectStore('printJobs').index('byStatus');
    const jobs = await new Promise((resolve, reject) => {
      const list = [];
      const req = idx.openCursor('queued');
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { list.push(c.value); c.continue(); } else resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
    const eligible = jobs.filter((j) => (j.nextRunAt ?? 0) <= now);
    if (eligible.length === 0) return false;
    eligible.sort((a, b) => (a.priority - b.priority) || (a.createdAt - b.createdAt));
    const job = eligible[0];

    // Move to printing
    const writeTx = db.transaction('printJobs', 'readwrite');
    await promisifyRequest(writeTx.objectStore('printJobs').put({ ...job, status: 'printing' }));
    this.events.emit('status', { id: job.id, status: 'printing' });

    try {
      await this.#sendToDestination(job.destination, job.payload);
      await promisifyRequest(writeTx.objectStore('printJobs').delete(job.id));
      this.events.emit('printed', job);
    } catch (err) {
      const attempts = (job.attempts ?? 0) + 1;
      if (attempts >= this.maxAttempts) {
        await promisifyRequest(writeTx.objectStore('printJobs').put({ ...job, status: 'failed', attempts, error: String(err) }));
        this.events.emit('status', { id: job.id, status: 'failed', error: String(err) });
      } else {
        const delay = this.#computeDelayMs(attempts);
        const nextRunAt = Date.now() + delay;
        await promisifyRequest(writeTx.objectStore('printJobs').put({ ...job, status: 'queued', attempts, nextRunAt, error: String(err) }));
        this.events.emit('status', { id: job.id, status: 'retry', attempts, nextRunAt });
      }
    }
    return true;
  }

  async #sendToDestination(destination, payload) {
    const handler = this.handlers.get(destination);
    if (handler) return handler(payload);
    // Fallback simulation
    switch (destination) {
      case 'receipt': {
        const text = renderReceipt(payload);
        // eslint-disable-next-line no-console
        console.log('\n--- PRINT (RECEIPT) ---\n' + text + '\n----------------------\n');
        return;
      }
      case 'kitchen':
      case 'bar': {
        // eslint-disable-next-line no-console
        console.log(`\n--- PRINT (${destination.toUpperCase()}) ---\n`, payload, '\n----------------------\n');
        return;
      }
      default:
        throw new Error(`Unknown destination: ${destination}`);
    }
  }

  registerHandler(destination, handler) {
    this.handlers.set(destination, handler);
  }

  #computeDelayMs(attempts) {
    const base = 1000; // 1s
    const max = 30000; // 30s
    const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempts - 1)));
    const jitter = 0.25;
    const rand = (Math.random() * 2 - 1) * jitter;
    return Math.max(0, Math.round(exp * (1 + rand)));
  }
}


