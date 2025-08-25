import { OfflineDataStore } from './offline-store.js'
import { SyncEngine } from './sync-engine.js'
import { PrintJobManager } from './print-manager.js'

export async function bootstrapCore() {
  const store = new OfflineDataStore({ dbName: 'posdb', version: 1 });
  const sync = new SyncEngine({ dbName: 'posdb', version: 1 });
  const printer = new PrintJobManager({ dbName: 'posdb', version: 1 });

  // seed sample products if empty
  try {
    const db = await store.dbPromise;
    const tx = db.transaction('products', 'readonly');
    const count = await new Promise((resolve, reject) => {
      const req = tx.objectStore('products').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const target = 100;
    if (count < target) {
      const txw = db.transaction('products', 'readwrite');
      const st = txw.objectStore('products');
      const categories = ['Food','Drink','Snacks','Dessert'];
      const toAdd = target - count;
      const start = count + 1;
      const sample = Array.from({ length: toAdd }).map((_, idx) => {
        const i = start + idx;
        return {
          id: `p${i}`,
          name: `Product ${i}`,
          nameLower: `product ${i}`.toLowerCase(),
          price: ((i % 20) + 1) * 150,
          category: categories[i % categories.length],
        };
      });
      await Promise.all(sample.map((p) => new Promise((resolve, reject) => {
        const r = st.put(p);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      })));
    }
  } catch {}

  // start background sync (no-op push in prototype)
  sync.start(20000);
  printer.start();

  return { store, sync, printer };
}


