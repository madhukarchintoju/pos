import { useEffect, useMemo, useRef, useState } from 'react'
import { bootstrapCore } from './core/bootstrap.js'
import { CartProvider, useCart } from './context/cart.jsx'
import { ProductGrid } from './components/ProductGrid.jsx'
import { Cart } from './components/Cart.jsx'
import { Orders } from './components/Orders.jsx'
import { OrdersPage } from './pages/OrdersPage.jsx'

function AppInner() {
  const [core, setCore] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [products, setProducts] = useState([])
  const [page, setPage] = useState(0)
  const pageSize = 24
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef(null)
  const scrollRef = useRef(null)

  // debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250)
    return () => clearTimeout(timer)
  }, [query])
  const [category, setCategory] = useState('All')
  const [theme, setTheme] = useState('light')
  const [route, setRoute] = useState(location.hash || '#/')
  const { dispatch: cartDispatch } = useCart()

  useEffect(() => {
    bootstrapCore().then(setCore)
  }, [])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onHash = () => setRoute(location.hash || '#/')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('hashchange', onHash)
    }
  }, [])

  // initialize theme from storage or system preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'dark' || stored === 'light') {
        setTheme(stored)
        return
      }
    } catch {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(prefersDark ? 'dark' : 'light')
  }, [])

  // apply theme class to <html>
  useEffect(() => {
    const rootEl = document.documentElement
    const bodyEl = document.body
    const appEl = document.getElementById('root')
    const op = theme === 'dark' ? 'add' : 'remove'
    rootEl.classList[op]('dark')
    bodyEl?.classList[op]('dark')
    appEl?.classList[op]('dark')
    // enforce body bg/text for clarity
    if (theme === 'dark') {
      bodyEl?.classList.remove('bg-white','text-gray-900')
      bodyEl?.classList.add('bg-slate-900','text-slate-100')
    } else {
      bodyEl?.classList.remove('bg-slate-900','text-slate-100')
      bodyEl?.classList.add('bg-white','text-gray-900')
    }
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    let aborted = false
    const run = async () => {
      if (!core) return
      setLoading(true)
      const prefix = debouncedQuery.trim().toLowerCase()
      if (prefix.length === 0) {
        // paginated load
        const db = await core.store.dbPromise
        const tx = db.transaction('products', 'readonly')
        const st = tx.objectStore('products')
        const list = []
        let skipped = 0
        await new Promise((resolve, reject) => {
          const req = st.openCursor()
          req.onsuccess = (e) => {
            const c = e.target.result
            if (c) {
              // apply category filter lazily
              const val = c.value
              if (category === 'All' || val.category === category) {
                if (skipped < page * pageSize) { skipped++; c.continue(); return }
                if (list.length < pageSize) { list.push(val); c.continue(); return }
                resolve(); return
              }
              c.continue(); return
            }
            resolve()
          }
          req.onerror = () => reject(req.error)
        })
        if (!aborted) {
          setProducts((prev) => page === 0 ? list : [...prev, ...list])
          setHasMore(list.length === pageSize)
        }
      } else {
        const list = await core.store.queryProductsByPrefix(prefix)
        const filtered = category === 'All' ? list : list.filter((p) => p.category === category)
        if (!aborted) {
          setProducts(filtered)
          setHasMore(false)
        }
      }
      if (!aborted) setLoading(false)
    }
    run()
    return () => { aborted = true }
  }, [core, debouncedQuery, category, page])

  // Reset pagination on filter changes
  useEffect(() => {
    setPage(0)
    setProducts([])
    setHasMore(true)
  }, [debouncedQuery, category])

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current
    const rootEl = scrollRef.current
    if (!el || !rootEl) return
    const obs = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && !loading && hasMore) {
        setPage((p) => p + 1)
      }
    }, { root: rootEl, rootMargin: '200px', threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loading, hasMore])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        const input = document.getElementById('search-input')
        input?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onCharge = async ({ items, note, totals }) => {
    if (!core) return
    const res = await core.store.createOrder({ items, note, totals })
    await core.printer.enqueueReceipt({ order: res.order, items: res.orderItems })
    // clear cart
    cartDispatch({ type: 'clear' })
  }

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
    <div className={`flex min-h-screen flex-col ${theme==='dark' ? 'bg-slate-900 text-slate-100' : 'bg-white text-gray-900'}`}>
      <header className={`sticky top-0 z-10 border-b backdrop-blur ${theme==='dark' ? 'border-slate-700 bg-slate-800/90' : 'border-gray-200 bg-white/90'}`}>
        <div className={`mx-auto flex max-w-6xl items-center justify-between gap-4 p-4 ${theme==='dark' ? 'text-slate-200' : 'text-gray-700'}`}>
          <h1 className="text-xl font-semibold tracking-tight">POS</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className={`rounded-full px-2 py-0.5 ${online ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{online ? 'Online' : 'Offline'}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Sync idle</span>
            <a href="#/" className={`ml-3 rounded-md px-2 py-1 ${route==='#/' ? (theme==='dark'?'bg-slate-700 text-white':'bg-gray-100 text-gray-900') : ''}`}>POS</a>
            <a href="#/orders" className={`rounded-md px-2 py-1 ${route==='#/orders' ? (theme==='dark'?'bg-slate-700 text-white':'bg-gray-100 text-gray-900') : ''}`}>Orders</a>
            <button
              className={`ml-2 rounded-md px-2 py-1 border ${theme==='dark' ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark'
                // immediate apply
                const rootEl = document.documentElement
                const bodyEl = document.body
                const appEl = document.getElementById('root')
                const op = next === 'dark' ? 'add' : 'remove'
                rootEl.classList[op]('dark')
                bodyEl?.classList[op]('dark')
                appEl?.classList[op]('dark')
                if (next === 'dark') {
                  bodyEl?.classList.remove('bg-white','text-gray-900')
                  bodyEl?.classList.add('bg-slate-900','text-slate-100')
                } else {
                  bodyEl?.classList.remove('bg-slate-900','text-slate-100')
                  bodyEl?.classList.add('bg-white','text-gray-900')
                }
                try { localStorage.setItem('theme', next) } catch {}
                setTheme(next)
              }}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </header>
      {route==='#/orders' ? (
        <main className="mx-auto w-full max-w-6xl flex-1 p-4">
          {core && <OrdersPage store={core.store} theme={theme} />}
        </main>
      ) : (
      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-3">
        <section className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative w-full">
              <input
                id="search-input"
                className={`w-full rounded-md border px-3 py-2 pr-9 shadow-sm focus:outline-none ${theme==='dark' ? 'border-slate-600 bg-slate-800 text-slate-100 placeholder:text-slate-400 focus:border-indigo-400' : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-sky-400'}`}
                placeholder="Search products"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 ${theme==='dark' ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.78-5.22a.75.75 0 101.06 1.06L10 11.06l.72.78a.75.75 0 001.06-1.06L11.06 10l.78-.72a.75.75 0 10-1.06-1.06L10 8.94l-.72-.78a.75.75 0 10-1.06 1.06L8.94 10l-.72.78z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            <button className="rounded-md bg-sky-600 px-3 py-2 text-white hover:bg-sky-700 dark:bg-indigo-600 dark:hover:bg-indigo-700">Scan</button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {['All','Food','Drink'].map((c) => {
              const isActive = category === c
              const base = theme==='dark' ? 'border-slate-600' : 'border-gray-300'
              const idle = theme==='dark' ? 'bg-slate-800 text-slate-200' : 'bg-white text-gray-700'
              const active = theme==='dark' ? 'bg-indigo-600 text-white' : 'bg-sky-600 text-white'
              return (
                <button key={c} onClick={() => setCategory(c)} className={`rounded-full border px-3 py-1 ${base} ${isActive ? active : idle}`}>{c}</button>
              )
            })}
          </div>
          <div ref={scrollRef} className="max-h-[65vh] overflow-auto rounded-md border border-transparent">
            <ProductGrid products={products} theme={theme} />
            <div ref={sentinelRef} className="h-8 w-full"></div>
          </div>
        </section>
        <aside className="md:col-span-1 space-y-4">
          <Cart onCharge={onCharge} theme={theme} />
          {core && <Orders store={core.store} theme={theme} />}
        </aside>
      </main>
      )}
    </div>
    </div>
  )
}

export default function App() {
  return (
    <CartProvider>
      <AppInner />
    </CartProvider>
  )
}
