import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { ArrowLeftIcon, CameraIcon, AlertCircleIcon, CheckIcon } from '../components/Icons'

const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

export const FAIXAS_FATURAMENTO = [
  { value: 'ate_5k', label: 'Até R$ 5.000 / mês' },
  { value: '5k_10k', label: 'R$ 5.000 a R$ 10.000 / mês' },
  { value: '10k_20k', label: 'R$ 10.000 a R$ 20.000 / mês' },
  { value: '20k_50k', label: 'R$ 20.000 a R$ 50.000 / mês' },
  { value: 'acima_50k', label: 'Acima de R$ 50.000 / mês' },
]

export function validarCNPJ(cnpj: string): boolean {
  const limpo = cnpj.replace(/\D/g, '')
  if (limpo.length !== 14) return false
  if (/^(\d)\1+$/.test(limpo)) return false

  let tamanho = 12
  let numeros = limpo.substring(0, tamanho)
  const digitos = limpo.substring(tamanho)
  let soma = 0
  let pos = tamanho - 7

  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--
    if (pos < 2) pos = 9
  }
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  if (resultado !== Number(digitos.charAt(0))) return false

  tamanho = 13
  numeros = limpo.substring(0, tamanho)
  soma = 0
  pos = tamanho - 7
  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--
    if (pos < 2) pos = 9
  }
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  return resultado === Number(digitos.charAt(1))
}

function redimensionarImagem(file: File, maxDim = 1280, initialQuality = 0.82): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
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

        const tentarComprimir = (q: number) => {
          canvas.toBlob(
            blob => {
              if (!blob) return reject(new Error('Falha ao gerar imagem compactada'))
              // O bucket tem limite de 2MB (2097152 bytes). Mantemos abaixo de 1.8MB com margem segura.
              if (blob.size > 1.8 * 1024 * 1024 && q > 0.4) {
                return tentarComprimir(Math.max(0.4, Number((q - 0.15).toFixed(2))))
              }
              const safeName = (file.name || 'foto.jpg').replace(/\.[^/.]+$/, '') + '.jpg'
              const safeFile = new File([blob], safeName, { type: 'image/jpeg' })
              resolve(safeFile)
            },
            'image/jpeg',
            q
          )
        }

        tentarComprimir(initialQuality)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

type FotoItem = {
  id: string
  file: File
  previewUrl: string
  name: string
}

export default function AnaliseNegocio() {
  const { id } = useParams()
  const nav = useNavigate()
  const { session } = useAuth()
  const userId = session?.user?.id

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [erroCnpj, setErroCnpj] = useState('')

  const [businessName, setBusinessName] = useState('')
  const [approvalStatus, setApprovalStatus] = useState<string>('pending')
  const [ultimoComentario, setUltimoComentario] = useState<string | null>(null)
  const [temSolicitacaoPendente, setTemSolicitacaoPendente] = useState(false)

  // Campos do formulário
  const [tradeName, setTradeName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('SP')
  const [revenueRange, setRevenueRange] = useState('10k_20k')
  const [description, setDescription] = useState('')
  const [instagram, setInstagram] = useState('')
  const [fotos, setFotos] = useState<FotoItem[]>([])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)

      const [bizRes, appRes] = await Promise.all([
        supabase.from('businesses').select('id, name, city, approval_status').eq('id', id).maybeSingle(),
        supabase
          .from('business_applications')
          .select('*')
          .eq('business_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (bizRes.data) {
        setBusinessName(bizRes.data.name)
        setApprovalStatus(bizRes.data.approval_status || 'pending')
        setTradeName(bizRes.data.name)
        if (bizRes.data.city && !city) {
          const parts = bizRes.data.city.split(',').map((p: string) => p.trim())
          if (parts[0]) setCity(parts[0])
          if (parts[1] && ESTADOS_BR.includes(parts[1].toUpperCase())) {
            setState(parts[1].toUpperCase())
          }
        }
      }

      if (appRes.data) {
        const lastApp = appRes.data
        if (lastApp.status === 'pending') {
          setTemSolicitacaoPendente(true)
        }
        if (lastApp.status === 'rejected') {
          setUltimoComentario(lastApp.review_comment)
        }
        // Pré-preenche campos da última solicitação para facilitar o reenvio
        if (lastApp.trade_name) setTradeName(lastApp.trade_name)
        if (lastApp.cnpj) setCnpj(lastApp.cnpj)
        if (lastApp.zip_code) setZipCode(lastApp.zip_code)
        if (lastApp.street) setStreet(lastApp.street)
        if (lastApp.number) setNumber(lastApp.number)
        if (lastApp.complement) setComplement(lastApp.complement)
        if (lastApp.district) setDistrict(lastApp.district)
        if (lastApp.city) setCity(lastApp.city)
        if (lastApp.state) setState(lastApp.state)
        if (lastApp.revenue_range) setRevenueRange(lastApp.revenue_range)
        if (lastApp.description) setDescription(lastApp.description)
        if (lastApp.instagram) setInstagram(lastApp.instagram)
      }

      setLoading(false)
    })()
  }, [id])

  // Busca automática por CEP via ViaCEP
  async function buscarCep(valor: string) {
    const limpo = valor.replace(/\D/g, '')
    setZipCode(limpo)
    if (limpo.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
        const data = await res.json()
        if (!data.erro) {
          if (data.logradouro) setStreet(data.logradouro)
          if (data.bairro) setDistrict(data.bairro)
          if (data.localidade) setCity(data.localidade)
          if (data.uf && ESTADOS_BR.includes(data.uf.toUpperCase())) {
            setState(data.uf.toUpperCase())
          }
        }
      } catch {
        // Falha de rede no CEP: usuário preenche manualmente
      }
    }
  }

  function handleCnpjChange(val: string) {
    const limpo = val.replace(/\D/g, '').slice(0, 14)
    setCnpj(limpo)
    if (limpo.length > 0 && limpo.length === 14) {
      if (!validarCNPJ(limpo)) {
        setErroCnpj('CNPJ inválido (dígitos verificadores incorretos).')
      } else {
        setErroCnpj('')
      }
    } else {
      setErroCnpj('')
    }
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const restantes = 6 - fotos.length
    if (restantes <= 0) {
      setMsg('Limite máximo de 6 fotos atingido.')
      return
    }

    const selecionados = Array.from(files).slice(0, restantes)
    setMsg('')

    try {
      const novosItens: FotoItem[] = []
      for (const file of selecionados) {
        const compressedFile = await redimensionarImagem(file, 1280, 0.82)
        const previewUrl = URL.createObjectURL(compressedFile)
        novosItens.push({
          id: crypto.randomUUID(),
          file: compressedFile,
          previewUrl,
          name: file.name,
        })
      }
      setFotos(prev => [...prev, ...novosItens])
    } catch {
      setMsg('Falha ao processar imagens selecionadas. Tente novamente.')
    } finally {
      e.target.value = ''
    }
  }

  function removerFoto(idToRemove: string) {
    setFotos(prev => {
      const item = prev.find(f => f.id === idToRemove)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter(f => f.id !== idToRemove)
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMsg('')

    if (!tradeName.trim()) {
      return setMsg('Informe o nome fantasia do estabelecimento.')
    }

    const cnpjLimpo = cnpj.replace(/\D/g, '')
    if (cnpjLimpo && !validarCNPJ(cnpjLimpo)) {
      return setMsg('CNPJ preenchido é inválido.')
    }

    const cepLimpo = zipCode.replace(/\D/g, '')
    if (cepLimpo.length !== 8) {
      return setMsg('CEP deve conter 8 dígitos.')
    }

    if (!street.trim() || !number.trim() || !district.trim() || !city.trim() || !state.trim()) {
      return setMsg('Preencha o endereço completo (Rua, Número, Bairro, Cidade e UF).')
    }

    if (fotos.length < 1) {
      return setMsg('Adicione pelo menos 1 foto do estabelecimento ou espaço de atendimento.')
    }

    if (!id) {
      return setMsg('Negócio não identificado na URL.')
    }

    // 0. Garante sessão ativa e com JWT válido antes das requisições ao Storage
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr || !sessionData?.session) {
      return setMsg('Sua sessão expirou. Por favor, recarregue a página ou faça login novamente.')
    }

    let activeSession = sessionData.session
    const expiresAt = activeSession.expires_at ? activeSession.expires_at * 1000 : 0
    if (expiresAt > 0 && expiresAt - Date.now() < 120000) {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
      if (refreshErr || !refreshData?.session) {
        return setMsg('Sua sessão expirou. Por favor, saia e faça login novamente para reautenticar.')
      }
      activeSession = refreshData.session
    }

    const currentUserId = activeSession.user.id
    if (!currentUserId) {
      return setMsg('Usuário não autenticado.')
    }

    setBusy(true)

    try {
      // 1. Upload das fotos no bucket business-applications
      const caminhosStorage: string[] = []
      for (let i = 0; i < fotos.length; i++) {
        const item = fotos[i]
        const extensao = 'jpg'
        const path = `${currentUserId}/${id}/${Date.now()}-${i + 1}-${Math.random().toString(36).slice(2, 7)}.${extensao}`

        const { error: uploadError } = await supabase.storage
          .from('business-applications')
          .upload(path, item.file, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          console.error(`Erro ao enviar foto ${i + 1}:`, uploadError)
          const detalhe = (uploadError as any).error || (uploadError as any).statusCode || uploadError.message
          throw new Error(`Erro ao enviar foto ${i + 1}: ${uploadError.message}${detalhe && detalhe !== uploadError.message ? ` (${detalhe})` : ''}`)
        }
        caminhosStorage.push(path)
      }

      // 2. Inserção na tabela business_applications
      const { error: insertError } = await supabase.from('business_applications').insert({
        business_id: id,
        submitted_by: currentUserId,
        trade_name: tradeName.trim(),
        cnpj: cnpjLimpo || null,
        zip_code: cepLimpo,
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim() || null,
        district: district.trim(),
        city: city.trim(),
        state: state.toUpperCase(),
        revenue_range: revenueRange,
        description: description.trim() || null,
        instagram: instagram.trim() || null,
        photos: caminhosStorage,
        status: 'pending',
      })

      if (insertError) {
        throw new Error(insertError.message)
      }

      // Sucesso: encaminha para cadastro de serviços
      nav(`/painel/${id}/servicos`, {
        state: { flash: 'Solicitação enviada para análise com sucesso! Configure agora seus serviços.' },
      })
    } catch (err: unknown) {
      console.error('Falha ao submeter análise:', err)
      const erroTexto = err instanceof Error ? err.message : 'Falha ao enviar solicitação.'
      setMsg(erroTexto)
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="center" style={{ padding: '3rem 0' }}>
        <div className="spinner" />
        <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando dados da análise...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', paddingBottom: '2.5rem' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          to={`/painel/${id}/configuracoes`}
          className="link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem', marginBottom: '.75rem' }}
        >
          <ArrowLeftIcon size={14} />
          <span>Voltar para configurações</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
          <span className="badge badge-info" style={{ fontWeight: 600 }}>
            Etapa 2 de 2
          </span>
          {approvalStatus === 'rejected' && (
            <span className="badge badge-danger">Reenvio de Análise</span>
          )}
        </div>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Dados para Análise do Negócio</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.25rem 0 0' }}>
          Para liberar a publicação de <strong>{businessName}</strong> no Hub do Schedia, envie as informações abaixo para a equipe de moderação.
        </p>
      </div>

      {/* Alerta de privacidade */}
      <div
        className="card"
        style={{
          background: 'var(--bg-sub)',
          border: '1px solid var(--line)',
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '.75rem',
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>🔒</span>
        <div style={{ fontSize: '.84rem', lineHeight: 1.45 }}>
          <strong>Dados estritamente confidenciais</strong>
          <p style={{ margin: '.2rem 0 0', color: 'var(--muted)' }}>
            CNPJ, endereço físico, faturamento e fotos de análise são privados e <strong>nunca</strong> ficam visíveis aos clientes ou ao público geral. Apenas os aprovadores do Schedia têm acesso.
          </p>
        </div>
      </div>

      {/* Alerta de reprovação anterior (se houver) */}
      {approvalStatus === 'rejected' && ultimoComentario && (
        <div
          className="card"
          style={{
            borderColor: '#f87171',
            background: 'rgba(239, 68, 68, 0.08)',
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: '#dc2626', fontWeight: 600, fontSize: '.9rem' }}>
            <AlertCircleIcon size={18} />
            <span>Motivo da reprovação anterior:</span>
          </div>
          <p style={{ margin: '.4rem 0 0', fontSize: '.86rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {ultimoComentario}
          </p>
          <small style={{ display: 'block', marginTop: '.5rem', color: 'var(--muted)', fontSize: '.78rem' }}>
            Corrija os pontos apontados acima e reenvie a solicitação com novas fotos/dados.
          </small>
        </div>
      )}

      {/* Aviso se já tem solicitação pendente */}
      {temSolicitacaoPendente && approvalStatus === 'pending' && (
        <div
          className="card"
          style={{
            background: 'rgba(59, 130, 246, 0.08)',
            borderColor: '#60a5fa',
            padding: '1rem',
            marginBottom: '1.25rem',
            fontSize: '.86rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: 600, color: '#2563eb' }}>
            <CheckIcon size={16} />
            <span>Solicitação em análise em andamento</span>
          </div>
          <p style={{ margin: '.3rem 0 0', color: 'var(--muted)' }}>
            Você já possui uma solicitação sendo avaliada pela equipe. O envio de um novo formulário atualizará os dados da análise.
          </p>
        </div>
      )}

      <form className="form" onSubmit={handleSubmit}>
        {/* Identificação Comercial */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.08rem', marginTop: 0, marginBottom: '1rem' }}>1. Identificação do Negócio</h2>

          <label>
            Nome fantasia comercial
            <input
              required
              value={tradeName}
              onChange={e => setTradeName(e.target.value)}
              placeholder="Ex.: Studio Lumina Beleza e Estética"
            />
          </label>

          <label>
            CNPJ (opcional)
            <input
              value={cnpj}
              onChange={e => handleCnpjChange(e.target.value)}
              placeholder="Apenas números (14 dígitos)"
              maxLength={18}
            />
            {erroCnpj && (
              <span style={{ color: '#ef4444', fontSize: '.78rem', marginTop: '.25rem', display: 'block' }}>
                {erroCnpj}
              </span>
            )}
            <small style={{ color: 'var(--muted)', fontSize: '.76rem' }}>
              Microempreendedores individuais e autônomos sem CNPJ podem deixar em branco.
            </small>
          </label>

          <label>
            Faixa de faturamento mensal estimada
            <select
              required
              value={revenueRange}
              onChange={e => setRevenueRange(e.target.value)}
            >
              {FAIXAS_FATURAMENTO.map(f => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Instagram comercial ou portfólio (opcional)
            <input
              value={instagram}
              onChange={e => setInstagram(e.target.value)}
              placeholder="@seu.negocio ou https://instagram.com/..."
            />
          </label>

          <label>
            Descrição do espaço e modelo de atendimento
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex.: Atendimento com hora marcada em sala climatizada, produtos profissionais..."
            />
          </label>
        </div>

        {/* Endereço */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.08rem', marginTop: 0, marginBottom: '1rem' }}>2. Endereço do Estabelecimento</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '.75rem' }}>
            <label>
              CEP
              <input
                required
                value={zipCode}
                onChange={e => buscarCep(e.target.value)}
                placeholder="00000000"
                maxLength={8}
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '.65rem' }}>
              <small style={{ color: 'var(--muted)', fontSize: '.75rem' }}>
                Digite o CEP com 8 números para preenchimento automático.
              </small>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr)', gap: '.75rem' }}>
            <label>
              Logradouro (Rua, Avenida...)
              <input
                required
                value={street}
                onChange={e => setStreet(e.target.value)}
                placeholder="Ex.: Rua das Flores"
              />
            </label>

            <label>
              Número
              <input
                required
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="123"
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1.5fr)', gap: '.75rem' }}>
            <label>
              Complemento (opcional)
              <input
                value={complement}
                onChange={e => setComplement(e.target.value)}
                placeholder="Sala 4, Bloco B..."
              />
            </label>

            <label>
              Bairro
              <input
                required
                value={district}
                onChange={e => setDistrict(e.target.value)}
                placeholder="Bairro"
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.2fr) minmax(0, 1fr)', gap: '.75rem' }}>
            <label>
              Cidade
              <input
                required
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Cidade"
              />
            </label>

            <label>
              Estado (UF)
              <select
                required
                value={state}
                onChange={e => setState(e.target.value)}
              >
                {ESTADOS_BR.map(uf => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Fotos do estabelecimento */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
            <h2 style={{ fontSize: '1.08rem', margin: 0 }}>3. Fotos do Estabelecimento (1 a 6 fotos)</h2>
            <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
              {fotos.length} de 6 adicionadas
            </span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '.82rem', margin: '0 0 1rem' }}>
            Envie fotos nítidas da fachada, recepção, sala de atendimento ou bancada de trabalho para facilitar a aprovação.
          </p>

          {/* Grade de Fotos */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '.75rem',
              marginBottom: '1rem',
            }}
          >
            {fotos.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  position: 'relative',
                  aspectRatio: '4/3',
                  borderRadius: 'var(--r-md)',
                  overflow: 'hidden',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-sub)',
                }}
              >
                <img
                  src={item.previewUrl}
                  alt={`Foto ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  type="button"
                  onClick={() => removerFoto(item.id)}
                  aria-label="Remover foto"
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '26px',
                    height: '26px',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                  }}
                >
                  ✕
                </button>
                <span
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: '4px',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  Foto {idx + 1}
                </span>
              </div>
            ))}

            {fotos.length < 6 && (
              <label
                style={{
                  aspectRatio: '4/3',
                  border: '2px dashed var(--line)',
                  borderRadius: 'var(--r-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: 'var(--bg-sub)',
                  color: 'var(--muted)',
                  fontSize: '.8rem',
                  gap: '.35rem',
                  padding: '.5rem',
                  textAlign: 'center',
                  transition: 'border-color .15s',
                }}
              >
                <CameraIcon size={24} />
                <span>+ Adicionar foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
        </div>

        {msg && (
          <p role="alert" className="msg" style={{ margin: '.75rem 0' }}>
            {msg}
          </p>
        )}

        <div className="actions" style={{ marginTop: '1rem' }}>
          <button
            type="submit"
            className="btn"
            style={{ width: '100%', padding: '.85rem' }}
            disabled={busy || fotos.length === 0}
          >
            {busy ? 'Enviando fotos e dados para análise...' : 'Concluir envio para análise →'}
          </button>
        </div>
      </form>
    </div>
  )
}
