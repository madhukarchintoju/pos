import { createContext } from 'react'
import { useContext, useMemo, useReducer } from 'react'

const CartContext = createContext(null)

function cartReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { product } = action
      const key = product.id
      const existing = state.items[key]
      const qty = (existing?.qty ?? 0) + 1
      const nextItems = { ...state.items, [key]: { product, qty } }
      return { items: nextItems }
    }
    case 'inc': {
      const { id } = action
      const existing = state.items[id]
      if (!existing) return state
      const nextItems = { ...state.items, [id]: { ...existing, qty: existing.qty + 1 } }
      return { items: nextItems }
    }
    case 'dec': {
      const { id } = action
      const existing = state.items[id]
      if (!existing) return state
      const nextQty = existing.qty - 1
      const nextItems = { ...state.items }
      if (nextQty <= 0) delete nextItems[id]
      else nextItems[id] = { ...existing, qty: nextQty }
      return { items: nextItems }
    }
    case 'clear':
      return { items: {} }
    default:
      return state
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, { items: {} })
  const totals = useMemo(() => {
    let subtotal = 0
    for (const item of Object.values(state.items)) {
      subtotal += item.product.price * item.qty
    }
    return { subtotal }
  }, [state.items])

  const api = useMemo(() => ({ state, totals, dispatch }), [state, totals])
  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}


