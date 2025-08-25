import { useCart } from '../context/cart.jsx'
import { formatCurrency } from '../utils/currency.js'

export function ProductGrid({ products, theme }) {
  const { dispatch } = useCart()
  const light = theme !== 'dark'
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${light ? 'text-gray-900' : 'text-slate-100'}`}>
      {products.map((p) => (
        <button
          key={p.id}
          onClick={() => dispatch({ type: 'add', product: p })}
          className={`rounded-lg border p-3 text-left shadow-sm hover:border-gray-400 ${light ? 'border-gray-200 bg-white' : 'border-slate-700 bg-slate-800'}`}
        >
          <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
          <div className={`mt-1 text-xs ${light ? 'text-gray-600' : 'text-slate-400'}`}>{formatCurrency(p.price)}</div>
        </button>
      ))}
    </div>
  )
}


