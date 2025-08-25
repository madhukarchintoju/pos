import { useEffect, useState } from 'react'

export function Orders({ store, theme }) {
  const [orders, setOrders] = useState([])
  const light = theme !== 'dark'
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const list = await store.getRecentOrders(10)
      if (!cancelled) setOrders(list)
    }
    load()
    const unsub = store.on('change', (e) => {
      if (e.collection === 'orders') load()
    })
    return () => { cancelled = true; unsub?.() }
  }, [store])

  const next = (status) => {
    switch (status) {
      case 'pending': return 'preparing'
      case 'preparing': return 'ready'
      case 'ready': return 'completed'
      default: return null
    }
  }

  return (
    <div className={`rounded-lg border shadow-sm ${light ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'}`}>
      <div className={`border-b p-3 font-medium ${light ? 'border-gray-200' : 'border-slate-700'}`}>Recent Orders</div>
      <div className="divide-y">
        {orders.map((o) => (
          <div key={o.id} className={`flex items-center justify-between p-3 text-sm ${light ? 'divide-gray-100' : 'divide-slate-700'}`}>
            <div>
              <div className="font-medium">#{o.id}</div>
              <div className={`${light ? 'text-gray-600' : 'text-slate-400'}`}>{o.status}</div>
            </div>
            <div className="flex items-center gap-2">
              {next(o.status) && (
                <button className={`rounded-md px-2 py-1 text-white ${light ? 'bg-sky-600 hover:bg-sky-700' : 'bg-indigo-600 hover:bg-indigo-700'}`} onClick={() => store.updateOrderStatus(o.id, next(o.status))}>
                  Mark {next(o.status)}
                </button>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className={`p-3 text-sm ${light ? 'text-gray-600' : 'text-slate-400'}`}>No orders yet</div>
        )}
      </div>
    </div>
  )
}
