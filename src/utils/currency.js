export function formatCurrency(cents) {
  const value = (cents ?? 0) / 100;
  return `$ ${value.toFixed(2)}`;
}


