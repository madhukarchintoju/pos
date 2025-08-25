import { useState } from 'react'
import { useCart } from '../context/cart.jsx'
import { formatCurrency } from '../utils/currency.js'

export function Cart({ onCharge, theme }) {
  const { state, totals, dispatch } = useCart()
  const items = Object.values(state.items)
  const [note, setNote] = useState('')
  const light = theme !== 'dark'
  return (
    <div className={`rounded-lg border shadow-sm ${light ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'}`}>
      <div className={`border-b p-3 font-medium ${light ? 'border-gray-200' : 'border-slate-700'}`}>Cart</div>
      <div className="max-h-[50vh] overflow-auto p-3 text-sm">
        {items.length === 0 && <div className={`${light ? 'text-gray-600' : 'text-slate-400'}`}>Empty cart</div>}
        {items.map(({ product, qty }) => (
          <div key={product.id} className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">{product.name}</div>
              <div className={`text-xs ${light ? 'text-gray-600' : 'text-slate-400'}`}>{formatCurrency(product.price)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded border px-2" onClick={() => dispatch({ type: 'dec', id: product.id })}>-</button>
              <span>{qty}</span>
              <button className="rounded border px-2" onClick={() => dispatch({ type: 'inc', id: product.id })}>+</button>
            </div>
            <div>{formatCurrency(product.price * qty)}</div>
          </div>
        ))}
      </div>
      <div className="border-t p-3 text-sm space-y-2">
        <input className={`w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none ${light ? 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-sky-400' : 'border-slate-600 bg-slate-700 text-slate-100 placeholder:text-slate-400 focus:border-indigo-400'}`} placeholder="Order note" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex items-center justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(totals.subtotal)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className={`rounded-md border px-3 py-2 ${light ? 'border-gray-300' : 'border-slate-600'}`} onClick={() => dispatch({ type: 'clear' })}>Clear</button>
          <button className={`rounded-md px-3 py-2 text-white disabled:opacity-50 ${light ? 'bg-sky-600 hover:bg-sky-700' : 'bg-indigo-600 hover:bg-indigo-700'}`} disabled={items.length===0} onClick={() => onCharge({ items, note, totals })}>Charge</button>
        </div>
      </div>
    </div>
  )
}


