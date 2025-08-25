export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler);
  }

  off(eventName, handler) {
    const set = this.listeners.get(eventName);
    if (!set) return;
    set.delete(handler);
  }

  emit(eventName, payload) {
    const set = this.listeners.get(eventName);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Event handler error', eventName, err);
      }
    }
  }
}


