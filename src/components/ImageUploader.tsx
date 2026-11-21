import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { CameraIcon } from './Icons'
import { uploadPublicImage } from '../lib/storage'

type Props = {
  value?: string | null
  fallbackText?: string
  onChange: (url: string) => void
  label?: string
  shape?: 'circle' | 'square'
  size?: number
  bucket?: 'avatars' | 'business-logos'
  pathPrefix?: string
}

export default function ImageUploader({
  value,
  fallbackText = 'S',
  onChange,
  label = 'Foto / Logo',
  shape = 'circle',
  size = 72,
  bucket = 'avatars',
  pathPrefix,
}: Props) {
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlVal, setUrlVal] = useState(value ?? '')
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUrlVal(value ?? '')
    if (value && !value.startsWith('blob:')) {
      setLocalPreview(null)
    }
  }, [value])

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setErrorMsg('')

    // Preview instantâneo via URL local de objeto (sem data-URL base64 no DOM/estado)
    const preview = URL.createObjectURL(file)
    setLocalPreview(preview)

    // Se houver bucket e pathPrefix configurados, executa upload real no Supabase Storage
    if (bucket && pathPrefix) {
      setUploading(true)
      try {
        const fileExt = 'jpg'
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt}`
        const storagePath = `${pathPrefix.replace(/^\/+|\/+$/g, '')}/${fileName}`

        const publicUrl = await uploadPublicImage(file, bucket, storagePath)
        onChange(publicUrl)
        setLocalPreview(null)
      } catch (err: unknown) {
        console.error('Erro ao enviar imagem para o Storage:', err)
        const msg = err instanceof Error ? err.message : 'Falha no upload'
        setErrorMsg(`Erro no envio: ${msg}`)
        setLocalPreview(null)
      } finally {
        setUploading(false)
      }
    } else {
      setErrorMsg('Destino de upload não configurado.')
      setLocalPreview(null)
    }

    // Limpa o input file para permitir selecionar o mesmo arquivo novamente se necessário
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleUrlApply() {
    const trimmed = urlVal.trim()
    // Bloqueia expressamente qualquer tentativa de inserir data-URL base64 manualmente
    if (trimmed.startsWith('data:')) {
      setErrorMsg('URLs em formato base64 (data:) não são permitidas por motivos de performance e segurança.')
      return
    }
    setErrorMsg('')
    onChange(trimmed)
    setShowUrlInput(false)
  }

  const isCircle = shape === 'circle'
  const displayImage = localPreview || value

  return (
    <div style={{ margin: '.75rem 0' }}>
      <label style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--fg)', marginBottom: '.5rem', display: 'block' }}>
        {label}
      </label>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
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
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'border-color var(--tr)',
            opacity: uploading ? 0.75 : 1,
          }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          title="Clique para alterar a imagem"
        >
          {displayImage ? (
            <img
              src={displayImage}
              alt="Prévia"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: `${size * 0.4}px`, fontWeight: 800, color: 'var(--primary)' }}>
              {fallbackText.slice(0, 2).toUpperCase()}
            </span>
          )}

          {uploading ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div className="spinner sm" style={{ width: 22, height: 22, borderWidth: 2 }} />
            </div>
          ) : (
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
                pointerEvents: 'none',
              }}
              className="uploader-overlay"
            >
              <CameraIcon size={20} />
            </div>
          )}
        </div>

        {/* Buttons + Info */}
        <div style={{ flex: 1, minWidth: '160px' }}>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.4rem' }}>
            <button
              type="button"
              className="btn sm ghost"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <CameraIcon size={14} style={{ marginRight: '.3rem' }} />
              {uploading ? 'Enviando...' : 'Carregar imagem'}
            </button>

            <button
              type="button"
              className="btn sm ghost"
              style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
              disabled={uploading}
              onClick={() => setShowUrlInput(!showUrlInput)}
            >
              {showUrlInput ? 'Ocultar URL' : 'Inserir link (URL)'}
            </button>
          </div>

          {value && (
            <button
              type="button"
              className="link"
              style={{ fontSize: '.8rem', color: 'var(--err)', display: 'block', marginBottom: '.35rem' }}
              disabled={uploading}
              onClick={() => {
                onChange('')
                setUrlVal('')
                setLocalPreview(null)
              }}
            >
              Remover
            </button>
          )}

          {errorMsg ? (
            <span style={{ color: 'var(--err)', fontSize: '.75rem', display: 'block' }}>
              {errorMsg}
            </span>
          ) : (
            <small style={{ color: 'var(--muted)', fontSize: '.75rem' }}>
              Formatos recomendados: JPG, PNG ou WebP (máx 2 MB).
            </small>
          )}
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
          <button type="button" className="btn sm" onClick={handleUrlApply} disabled={uploading}>
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
