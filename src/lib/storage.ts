import { supabase } from './supabase'

/**
 * Redimensiona a imagem no canvas do navegador e gera um Blob JPEG leve.
 * Garante que nenhuma string base64 / data-URL seja gerada ou propagada.
 */
export function compressImageToBlob(file: File, maxDim = 512, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas 2D context indisponível'))
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          blob => {
            if (!blob) return reject(new Error('Falha ao comprimir imagem'))
            resolve(blob)
          },
          'image/jpeg',
          quality
        )
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Faz upload de imagem para um bucket público ('avatars' ou 'business-logos')
 * e retorna a URL HTTPS curta gerada pelo Supabase Storage.
 */
export async function uploadPublicImage(
  file: File,
  bucket: 'avatars' | 'business-logos',
  path: string
): Promise<string> {
  const blob = await compressImageToBlob(file, 512, 0.82)
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })

  if (error) {
    throw error
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  // Adiciona timestamp para quebrar cache local do navegador caso seja substituição da mesma foto
  return `${data.publicUrl}?t=${Date.now()}`
}
