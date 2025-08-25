import { useEffect, useState } from 'react'

export function OrdersPage({ store, theme }) {
  const [orders, setOrders] = useState([])
  const light = theme !== 'dark'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const list = await store.getRecentOrders(50)
      if (!cancelled) setOrders(list)
    }
    load()
    const unsub = store.on('change', (e) => { if (e.collection === 'orders') load() })
    return () => { cancelled = true; unsub?.() }
  }, [store])

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h2 className="mb-4 text-xl font-semibold">Recent Orders</h2>
      <div className={`overflow-hidden rounded-lg border ${light ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'}`}>
        <table className="w-full text-left text-sm">
          <thead className={light ? 'bg-gray-50' : 'bg-slate-900'}>
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Subtotal</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className={light ? 'border-t border-gray-100' : 'border-t border-slate-700'}>
                <td className="px-3 py-2">{o.id}</td>
                <td className="px-3 py-2">{o.status}</td>
                <td className="px-3 py-2">$ {(o.subtotal/100).toFixed(2)}</td>
                <td className="px-3 py-2"></td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center" colSpan="4">No orders</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


