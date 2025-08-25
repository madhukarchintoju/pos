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

  const downloadPdf = async (orderId) => {
    const [{ jsPDF }, items] = await Promise.all([
      import('jspdf'),
      store.getOrderItems(orderId),
    ])
    const order = await store.get('orders', orderId)
    const doc = new jsPDF()
    let y = 10
    doc.setFontSize(14)
    doc.text('FOOD TRUCK - RECEIPT', 10, y)
    y += 8
    doc.setFontSize(11)
    doc.text(`Order ${order.id}`, 10, y)
    y += 6
    doc.text(new Date(order.createdAt).toLocaleString(), 10, y)
    y += 8
    doc.setFontSize(10)
    items.forEach((it) => {
      doc.text(`${it.qty} x ${it.name} - $ ${(it.price*it.qty/100).toFixed(2)}`, 10, y)
      y += 6
    })
    y += 4
    doc.text(`Subtotal: $ ${(order.subtotal/100).toFixed(2)}`, 10, y)
    doc.save(`receipt_${order.id}.pdf`)
  }

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
                <td className="px-3 py-2">
                  <button className={`rounded-md px-2 py-1 text-white ${light ? 'bg-sky-600 hover:bg-sky-700' : 'bg-indigo-600 hover:bg-indigo-700'}`} onClick={() => downloadPdf(o.id)}>Download PDF</button>
                </td>
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


