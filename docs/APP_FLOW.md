# App Flow and Terminology

## Runtime Overview
1. Bootstrap (`src/core/bootstrap.js`)
   - Open/upgrade IndexedDB (object stores: `products`, `orders`, `orderItems`, `outbox`, `printJobs`, `meta`).
   - Seed `products` to a minimum of 100 items.
   - Start `SyncEngine` (periodic, online/visibility triggers).
   - Start `PrintJobManager` loop.
   - Register Service Worker for offline shell caching.
2. UI shell (`src/App.jsx`)
   - Loads core services from bootstrap.
   - Applies theme and sets up hash routing (`#/`, `#/orders`).
   - Initializes search (debounced), category filters, and infinite scroll.

## Data Model & Indexes (IndexedDB)
- `products` (key: `id`)
  - Indexes: `byName` (`nameLower`), `byCategory` (`category`).
- `orders` (key: `id`)
  - Indexes: `byStatus` (`status`), `byUpdatedAt` (`updatedAt`).
- `orderItems` (key: `id`)
  - Indexes: `byOrder` (`orderId`).
- `outbox` (key: `id`) — queued operations for sync
  - Indexes: `byCollection`, `byCreatedAt`.
- `printJobs` (key: `id`)
  - Indexes: `byStatus`, `byPriority`.
- `meta` — cursors and metadata (e.g., `cursor:products`).

## Offline Writes (Outbox)
- API: `OfflineDataStore.put/update/delete/createOrder/updateOrderStatus`.
- Each write occurs inside a single IDB transaction and appends an operation to `outbox` with `{ collection, opType, docId, payload, createdAt }`.
- Emits `events.change` so UI/widgets can react.

## Reads & Caching
- API: `OfflineDataStore.get(collection, id)` implements read-through cache (in-memory).
- Query helpers: `queryProductsByPrefix`, `getRecentOrders`, `getOrderItems` use IDB indexes/cursors for efficiency.

## Synchronization Engine (Prototype)
- Push: batches `outbox` operations (configurable batch size), deletes on success.
- Pull (optional when `endpoint` set): per-collection cursors in `meta`, applies incoming `changes` to local stores.
- Backoff: `ExponentialBackoff` used between attempts; immediate triggers on `online` and `visibilitychange`.
- Events: `sync:push`, `sync:pull`, `sync:complete`, `sync:error`.
- Note: Conflict resolution is simplified and ready to be extended (e.g., LWW on presentational fields, CRDT counters for inventory, idempotency keys).

## Printing Flow
- Submitting a receipt: `PrintJobManager.enqueueReceipt({ order, items })` creates a `printJobs` record.
- Scheduler loop picks eligible jobs (by `status=queued`, `nextRunAt`), sets `printing`, and invokes destination handler.
- Retry/backoff with jitter up to `maxAttempts`, then marks `failed`.
- Default handlers simulate printing and log to console; replace with real ESC/POS transport for devices.

## UI Flow
- Catalog (Home `#/`)
  - Search input (250ms debounce), category chips.
  - Products grid inside its own scroll container with `IntersectionObserver` for infinite paging (24 per page).
  - Tap a product to add to cart; cart shows line totals and subtotal; note input.
  - Charge → creates order, queues receipt print, clears cart, order appears in Recent Orders.
- Orders (`#/orders`)
  - Lists recent orders (by updatedAt desc).
  - "Download PDF" renders a receipt PDF on-demand via `jspdf` dynamic import.

## Errors & Resilience
- IDB operations are wrapped in `withTransaction` with retry-on-transient error.
- Sync/print engines have retry with exponential backoff and emit events for UI to display status.
- Service Worker caches shell for offline availability.

## Performance Considerations
- Preact-compat keeps bundle small; dynamic import for PDF lib.
- Tailwind with content-based purge; minimal runtime allocations.
- IndexedDB indexes for common queries; in-memory cache for hot reads.

## Terminology
- Outbox: Local queue of pending write operations to be pushed to server.
- Operation (op): A change description `{collection, opType, docId, payload, createdAt}` stored in `outbox`.
- Read-through cache: `get()` reads local DB and memoizes result for subsequent reads.
- Backoff: Delay strategy between retries (exponential with jitter) to avoid thrashing.
- Cursor: Server-side position token to continue incremental sync pulls.
- LWW (Last Writer Wins): Conflict rule using authoritative timestamp/version.
- CRDT: Conflict-free replicated data type (e.g., PN-Counter for inventory) — referenced for future extension.
- ESC/POS: Command set for thermal receipt printers.
