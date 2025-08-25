import { formatCurrency } from '../utils/currency.js'

// Minimal ESC/POS-like text (not full command set). Real printers would need binary buffers.
export function renderReceipt({ order, items }) {
  const lines = []
  lines.push('*** FOOD TRUCK ***')
  lines.push(`ORDER ${order.id}`)
  lines.push(new Date(order.createdAt).toLocaleString())
  lines.push('')
  for (const it of items) {
    lines.push(`${it.qty} x ${it.name}  ${formatCurrency(it.price * it.qty)}`)
  }
  lines.push('')
  lines.push(`Subtotal: ${formatCurrency(order.subtotal)}`)
  lines.push('')
  lines.push('Thank you!')
  lines.push('')
  return lines.join('\n')
}


