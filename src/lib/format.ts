export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const toCents = (v: string) => {
  const n = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v
  return Math.round(parseFloat(n) * 100)
}
export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

/**
 * Normaliza um número de telefone para o padrão internacional aceito pelo WhatsApp (apenas dígitos, com código do país).
 * Para números brasileiros com 10 ou 11 dígitos (DDD + número), adiciona o DDI 55.
 */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return null

  // 10 ou 11 dígitos (formato BR padrão: ex: 11999998888 ou 1133334444)
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits
  }

  // 12 ou 13 dígitos já começando com 55 (ex: 5511999998888)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits
  }

  // Números internacionais válidos (entre 8 e 15 dígitos)
  if (digits.length >= 8 && digits.length <= 15) {
    return digits
  }

  return null
}

/**
 * Constrói o link oficial do WhatsApp (wa.me) com mensagem codificada.
 */
export function buildWhatsAppLink(phone: string | null | undefined, text: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone)
  if (!normalized) return null
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
}

