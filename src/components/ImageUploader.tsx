import { useState, useRef, type ChangeEvent } from 'react'
import { CameraIcon } from './Icons'

type Props = {
  value?: string | null
  fallbackText?: string
  onChange: (url: string) => void
  label?: string
  shape?: 'circle' | 'square'
  size?: number
}

/** Redimensiona imagem no canvas do navegador para produzir uma data URL leve (máx 360x360). */
function resizeImage(file: File, maxDim = 360, quality = 0.82): Promise<string> {
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
        if (!ctx) return resolve(img.src)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function ImageUploader({
  value,
  fallbackText = 'S',
  onChange,
  label = 'Foto / Logo',
  shape = 'circle',
  size = 72,
}: Props) {
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlVal, setUrlVal] = useState(value ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const resized = await resizeImage(file)
      onChange(resized)
    } catch {
      // fallback
    }
  }

  function handleUrlApply() {
    onChange(urlVal.trim())
    setShowUrlInput(false)
  }

  const isCircle = shape === 'circle'

  return (
    <div style={{ margin: '.75rem 0' }}>
      <label style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '.4rem', display: 'block' }}>
        {label}
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Preview Container */}
        <div
          style={{
            position: 'relative',
            width: size,
            height: size,
            borderRadius: isCircle ? '50%' : 'var(--r)',
            overflow: 'hidden',
            border: '2px solid var(--line)',
            background: 'var(--bg-sub)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            cursor: 'pointer',
          }}
          onClick={() => fileInputRef.current?.click()}
          title="Clique para alterar a imagem"
        >
          {value ? (
            <img
              src={value}
              alt="Prévia"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: `${size * 0.4}px`, fontWeight: 800, color: 'var(--primary)' }}>
              {fallbackText.slice(0, 2).toUpperCase()}
            </span>
          )}

          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              opacity: 0,
              transition: 'opacity var(--tr)',
            }}
            className="uploader-overlay"
          >
            <CameraIcon size={20} />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => fileInputRef.current?.click()}
            >
              <CameraIcon size={14} style={{ marginRight: '.3rem' }} />
              Carregar imagem
            </button>

            <button
              type="button"
              className="btn sm ghost"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
              onClick={() => setShowUrlInput(!showUrlInput)}
            >
              {showUrlInput ? 'Ocultar URL' : 'Inserir link (URL)'}
            </button>

            {value && (
              <button
                type="button"
                className="link"
                style={{ fontSize: '.8rem', color: 'var(--err)', marginLeft: '.25rem' }}
                onClick={() => {
                  onChange('')
                  setUrlVal('')
                }}
              >
                Remover
              </button>
            )}
          </div>
          <small style={{ color: 'var(--muted)', fontSize: '.75rem' }}>
            Formatos recomendados: JPG, PNG ou WebP.
          </small>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

      {showUrlInput && (
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem', maxWidth: '420px' }}>
          <input
            type="url"
            placeholder="https://exemplo.com/minha-imagem.jpg"
            value={urlVal}
            onChange={e => setUrlVal(e.target.value)}
            style={{ fontSize: '.84rem' }}
          />
          <button type="button" className="btn sm" onClick={handleUrlApply}>
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
