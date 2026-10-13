export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const toCents = (v: string) => {
  const n = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v
  return Math.round(parseFloat(n) * 100)
}
export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
