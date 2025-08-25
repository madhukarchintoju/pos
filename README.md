# Offline-First POS Prototype

## Run
- Install: `npm i`
- Dev: `npm run dev`
- Build: `npm run build`

## Features
- Offline data (IndexedDB), outbox queue, read-through cache, transactions, events
- Sync engine (push batches, optional pull cursors, backoff)
- Print queue (destinations, priority, retry)
- UI: search (debounced), category chips, infinite scroll, cart/charge, orders page with PDF
- Theme: dark/light toggle; responsive; touch and keyboard

## Notes
- PDF via jsPDF loaded on demand; printer is simulated; conflict resolution simplified

## Data
- Seeds 100 sample products on first run (or up to 100)
