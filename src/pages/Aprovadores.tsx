import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import {
  ShieldCheckIcon,
  CheckIcon,
  AlertCircleIcon,
  LocationIcon,
  ExternalLinkIcon,
  WhatsAppIcon,
  BuildingIcon,
  UserIcon,
  CameraIcon,
} from '../components/Icons'

type ApplicationListItem = {
  id: string
  business_id: string
  trade_name: string
  business_name: string
  business_slug: string
  city: string | null
  category_name: string | null
  applicant_name: string | null
  applicant_phone: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
}

type ApplicationDetail = {
  application: {
    id: string
    business_id: string
    submitted_by: string
    trade_name: string
    cnpj: string | null
    zip_code: string
    street: string
    number: string
    complement: string | null
    district: string
    city: string
    state: string
    revenue_range: string
    description: string | null
    instagram: string | null
    photos: string[]
    status: 'pending' | 'approved' | 'rejected'
    review_comment: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    created_at: string
  }
  business: {
    id: string
    name: string
    slug: string
    description: string | null
    city: string | null
    phone: string | null
    logo_url: string | null
    category_id: number | null
    category_name: string | null
    is_published: boolean
    approval_status: string
  }
  applicant: {
    id: string
    full_name: string
    phone: string | null
    avatar_url: string | null
  }
  reviewer: {
    id: string
    full_name: string
  } | null
}

const FAIXA_MAP: Record<string, string> = {
  ate_5k: 'Até R$ 5.000 / mês',
  '5k_10k': 'R$ 5.000 a R$ 10.000 / mês',
  '10k_20k': 'R$ 10.000 a R$ 20.000 / mês',
  '20k_50k': 'R$ 20.000 a R$ 50.000 / mês',
  acima_50k: 'Acima de R$ 50.000 / mês',
}

function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return 'Não informado'
  const limpo = cnpj.replace(/\D/g, '')
  if (limpo.length !== 14) return cnpj
  return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function formatCEP(cep: string | null | undefined): string {
  if (!cep) return ''
  const limpo = cep.replace(/\D/g, '')
  if (limpo.length !== 8) return cep
  return limpo.replace(/^(\d{5})(\d{3})$/, '$1-$2')
}

export default function Aprovadores() {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [items, setItems] = useState<ApplicationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [pageOffset, setPageOffset] = useState(0)
  const PAGE_SIZE = 20

  // Detalhe selecionado
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApplicationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<{ path: string; url: string }[]>([])
  const [activePhoto, setActivePhoto] = useState<string | null>(null)

  // Ações de moderação
  const [showRejectBox, setShowRejectBox] = useState(false)
  const [rejectComment, setRejectComment] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  useEffect(() => {
    carregarLista(filter, 0, true)
  }, [filter])

  // Bloqueio de rolagem do body e suporte a Escape quando o modal estiver aberto
  useEffect(() => {
    if (selectedId) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (activePhoto) {
            setActivePhoto(null)
          } else {
            fecharDetalhes()
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => {
        document.body.style.overflow = originalOverflow
        window.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [selectedId, activePhoto])

  async function carregarLista(status: string, offset: number, reset = false) {
    if (reset) {
      setLoading(true)
      setPageOffset(0)
    } else {
      setLoadingMore(true)
    }

    const { data, error } = await supabase.rpc('approver_list_applications', {
      p_status: status,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    })

    if (!error && data) {
      const novasList = data as ApplicationListItem[]
      setItems(prev => (reset ? novasList : [...prev, ...novasList]))
      setHasMore(novasList.length === PAGE_SIZE)
      setPageOffset(offset + novasList.length)
    } else {
      if (reset) setItems([])
      setHasMore(false)
    }

    setLoading(false)
    setLoadingMore(false)
  }

  async function abrirDetalhes(id: string, manterMsg = false) {
    setSelectedId(id)
    setDetailLoading(true)
    setShowRejectBox(false)
    setRejectComment('')
    if (!manterMsg) {
      setActionMsg('')
    }

    const { data, error } = await supabase.rpc('approver_get_application', { p_id: id })

    if (!error && data) {
      const appData = data as unknown as ApplicationDetail
      setDetail(appData)

      // Gera URLs assinadas temporárias para visualização das fotos privadas
      if (appData.application.photos && appData.application.photos.length > 0) {
        const urls: { path: string; url: string }[] = []
        for (const p of appData.application.photos) {
          const { data: signed } = await supabase.storage
            .from('business-applications')
            .createSignedUrl(p, 300) // 5 minutos de validade
          if (signed?.signedUrl) {
            urls.push({ path: p, url: signed.signedUrl })
          }
        }
        setPhotoUrls(urls)
      }
    } else {
      setActionMsg(error?.message || 'Falha ao carregar detalhes da solicitação.')
    }

    setDetailLoading(false)
  }

  function fecharDetalhes() {
    setSelectedId(null)
    setDetail(null)
    setPhotoUrls([])
    setShowRejectBox(false)
    setRejectComment('')
    setActionMsg('')
    setActivePhoto(null)
  }

  async function decidir(aprovar: boolean) {
    if (!detail) return
    setActionMsg('')

    if (!aprovar && rejectComment.trim().length < 10) {
      setActionMsg('O comentário de reprovação deve ter no mínimo 10 caracteres.')
      return
    }

    setActionBusy(true)

    const { error } = await supabase.rpc('approver_decide_application', {
      p_id: detail.application.id,
      p_approve: aprovar,
      p_comment: aprovar ? (rejectComment.trim() || null) : rejectComment.trim(),
    })

    setActionBusy(false)

    if (error) {
      console.error('Erro ao decidir solicitação:', error)
      const raw = error.message || ''
      const msgTraduzida =
        raw.includes('already_decided')
          ? 'Esta solicitação já foi homologada por outro aprovador.'
          : raw.includes('cannot_review_own')
          ? 'Regra do banco: Você não pode homologar o seu próprio negócio de teste. Execute o script SQL no Supabase para liberar aprovação de testes pelo próprio aprovador.'
          : raw.includes('comment_required')
          ? 'O comentário de reprovação deve conter no mínimo 10 caracteres.'
          : raw.includes('forbidden')
          ? 'Acesso não autorizado para o papel de aprovador.'
          : `Falha ao processar solicitação: ${raw}`

      setActionMsg(msgTraduzida)
      alert(msgTraduzida)
      await abrirDetalhes(detail.application.id, true)
      return
    }

    // Sucesso: fecha detalhes, notifica e recarrega a lista
    fecharDetalhes()
    alert(aprovar ? 'Estabelecimento APROVADO com sucesso!' : 'Estabelecimento REPROVADO com sucesso!')
    carregarLista(filter, 0, true)
  }

  return (
    <main className="container" style={{ padding: '2rem 1rem 4rem' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', marginBottom: '.35rem' }}>
          <div
            style={{
              color: 'var(--primary)',
              background: 'var(--primary-lt)',
              width: '40px',
              height: '40px',
              borderRadius: 'var(--r-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldCheckIcon size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--fg)' }}>
              Painel de Aprovadores
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.15rem 0 0' }}>
              Homologação e análise cadastral dos novos negócios cadastrados no Schedia.
            </p>
          </div>
        </div>
      </div>

      {/* Abas de filtro estilizadas */}
      <div className="section-tabs" style={{ maxWidth: '480px', marginBottom: '1.75rem' }}>
        <button
          type="button"
          className="section-tab-btn"
          aria-selected={filter === 'pending'}
          onClick={() => setFilter('pending')}
        >
          Pendentes
        </button>
        <button
          type="button"
          className="section-tab-btn"
          aria-selected={filter === 'approved'}
          onClick={() => setFilter('approved')}
        >
          Aprovados
        </button>
        <button
          type="button"
          className="section-tab-btn"
          aria-selected={filter === 'rejected'}
          onClick={() => setFilter('rejected')}
        >
          Reprovados
        </button>
      </div>

      {/* Lista de Solicitações */}
      {loading ? (
        <div className="center" style={{ padding: '4rem 0' }}>
          <div className="spinner" />
          <p style={{ marginTop: '1rem', fontSize: '.88rem', color: 'var(--muted)' }}>
            Carregando solicitações...
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="card empty" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '1.25rem',
              background: 'var(--bg-sub)',
              borderRadius: '50%',
              color: 'var(--muted)',
              marginBottom: '1rem',
            }}
          >
            <ShieldCheckIcon size={36} />
          </div>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Nenhuma solicitação encontrada</h2>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', margin: '.4rem auto 0', maxWidth: '420px' }}>
            Não há estabelecimentos com status <strong>{filter === 'pending' ? 'pendente' : filter === 'approved' ? 'aprovado' : 'reprovado'}</strong> nesta fila de análise.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.95rem' }}>
          {items.map(item => (
            <div
              key={item.id}
              className="card"
              style={{
                padding: '1.35rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1.25rem',
                borderLeft: `4px solid ${
                  item.status === 'approved'
                    ? '#10b981'
                    : item.status === 'rejected'
                    ? '#ef4444'
                    : 'var(--primary)'
                }`,
                transition: 'transform var(--tr), box-shadow var(--tr), border-color var(--tr)',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap', marginBottom: '.45rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--fg)', overflowWrap: 'break-word' }}>
                    {item.trade_name || item.business_name}
                  </h2>
                  <span
                    className={`badge ${
                      item.status === 'approved'
                        ? 'badge-ok'
                        : item.status === 'rejected'
                        ? 'badge-danger'
                        : 'badge-info'
                    }`}
                  >
                    {item.status === 'approved'
                      ? 'Aprovado'
                      : item.status === 'rejected'
                      ? 'Reprovado'
                      : 'Aguardando Análise'}
                  </span>
                  {item.category_name && (
                    <span className="badge badge-muted">{item.category_name}</span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '.84rem', color: 'var(--muted)' }}>
                  {item.city && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                      <LocationIcon size={14} style={{ color: 'var(--primary)' }} />
                      <span>{item.city}</span>
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                    <UserIcon size={14} />
                    <span>
                      Solicitante: <strong style={{ color: 'var(--fg)' }}>{item.applicant_name || 'Usuário'}</strong>
                      {item.applicant_phone ? ` (${item.applicant_phone})` : ''}
                    </span>
                  </span>
                  <span>
                    Enviado em:{' '}
                    {new Date(item.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              <div style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn sm"
                  style={{ minHeight: '44px', padding: '.55rem 1.25rem', fontWeight: 600 }}
                  onClick={() => abrirDetalhes(item.id)}
                >
                  Revisar solicitação →
                </button>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="center" style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn ghost sm"
                disabled={loadingMore}
                onClick={() => carregarLista(filter, pageOffset, false)}
                style={{ minHeight: '44px', minWidth: '180px' }}
              >
                {loadingMore ? 'Carregando mais...' : 'Carregar mais solicitações'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal / Dialog de Detalhamento da Solicitação (via Portal para posicionamento perfeito na tela) */}
      {selectedId && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="modal-backdrop"
          onClick={fecharDetalhes}
        >
          <div
            className="modal-dialog modal-review"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal (Fixo no Topo) */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem', minWidth: 0 }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--primary-lt)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <BuildingIcon size={22} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                    <h2
                      className="modal-title"
                      style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {detail?.application.trade_name || detail?.business.name || 'Detalhes da Solicitação'}
                    </h2>
                    {detail && (
                      <span
                        className={`badge ${
                          detail.application.status === 'approved'
                            ? 'badge-ok'
                            : detail.application.status === 'rejected'
                            ? 'badge-danger'
                            : 'badge-info'
                        }`}
                      >
                        {detail.application.status === 'approved'
                          ? 'Aprovado'
                          : detail.application.status === 'rejected'
                          ? 'Reprovado'
                          : 'Pendente'}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.2rem', fontSize: '.78rem', color: 'var(--muted)' }}>
                    <span>ID: <code style={{ fontSize: '.74rem', background: 'var(--bg-sub)', padding: '1px 5px', borderRadius: '4px' }}>{selectedId.slice(0, 8)}</code></span>
                    {detail?.business.category_name && (
                      <>
                        <span>•</span>
                        <span>{detail.business.category_name}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={fecharDetalhes}
                aria-label="Fechar"
                title="Fechar (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo com Scroll Suave */}
            <div className="modal-body">
              {detailLoading ? (
                <div className="center" style={{ padding: '4rem 0' }}>
                  <div className="spinner" />
                  <p style={{ marginTop: '1rem', fontSize: '.88rem', color: 'var(--muted)' }}>
                    Carregando dados da moderação...
                  </p>
                </div>
              ) : detail ? (
                <>
                  {/* Resumo Executivo / Métricas Rápidas */}
                  <div className="approver-metric-grid">
                    <div className="approver-metric-card">
                      <span className="approver-metric-label">Status da Análise</span>
                      <div className="approver-metric-val">
                        <span
                          className={`badge ${
                            detail.application.status === 'approved'
                              ? 'badge-ok'
                              : detail.application.status === 'rejected'
                              ? 'badge-danger'
                              : 'badge-info'
                          }`}
                        >
                          {detail.application.status === 'approved'
                            ? 'Aprovado'
                            : detail.application.status === 'rejected'
                            ? 'Reprovado'
                            : 'Pendente'}
                        </span>
                      </div>
                    </div>

                    <div className="approver-metric-card">
                      <span className="approver-metric-label">Página Pública</span>
                      <div className="approver-metric-val">
                        <a
                          href={`/n/${detail.business.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: 'var(--primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.35rem',
                            fontSize: '.88rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                          title="Abrir página pública em nova aba"
                        >
                          <span>/n/{detail.business.slug}</span>
                          <ExternalLinkIcon size={13} />
                        </a>
                      </div>
                    </div>

                    <div className="approver-metric-card">
                      <span className="approver-metric-label">Categoria</span>
                      <div className="approver-metric-val" style={{ fontSize: '.88rem' }}>
                        {detail.business.category_name || 'Sem categoria'}
                      </div>
                    </div>

                    <div className="approver-metric-card">
                      <span className="approver-metric-label">Faixa de Faturamento</span>
                      <div className="approver-metric-val" style={{ fontSize: '.88rem' }}>
                        {FAIXA_MAP[detail.application.revenue_range] || detail.application.revenue_range}
                      </div>
                    </div>
                  </div>

                  {/* Informações em 2 Colunas */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    {/* Card 1: Solicitante */}
                    <div className="approver-card-section">
                      <h3 className="approver-section-title">
                        <UserIcon size={16} style={{ color: 'var(--primary)' }} />
                        <span>Dados do Solicitante</span>
                      </h3>

                      <div className="approver-data-row">
                        <span className="approver-data-label">Nome Completo</span>
                        <span className="approver-data-value">{detail.applicant.full_name || 'Não informado'}</span>
                      </div>

                      <div className="approver-data-row">
                        <span className="approver-data-label">Telefone / Contato</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <span className="approver-data-value">{detail.applicant.phone || 'Sem telefone'}</span>
                          {detail.applicant.phone && (
                            <a
                              href={`https://wa.me/55${detail.applicant.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '.25rem',
                                padding: '.25rem .5rem',
                                background: 'rgba(37, 211, 102, 0.12)',
                                border: '1px solid rgba(37, 211, 102, 0.35)',
                                color: '#16a34a',
                                borderRadius: 'var(--r-sm)',
                                fontSize: '.76rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                              }}
                              title="Conversar pelo WhatsApp"
                            >
                              <WhatsAppIcon size={13} />
                              <span>WhatsApp</span>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="approver-data-row">
                        <span className="approver-data-label">Data de Envio</span>
                        <span className="approver-data-value" style={{ fontSize: '.82rem' }}>
                          {new Date(detail.application.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    {/* Card 2: Documentos & Identidade */}
                    <div className="approver-card-section">
                      <h3 className="approver-section-title">
                        <BuildingIcon size={16} style={{ color: 'var(--primary)' }} />
                        <span>Documentos & Presença Digital</span>
                      </h3>

                      <div className="approver-data-row">
                        <span className="approver-data-label">CNPJ</span>
                        <span className="approver-data-value">
                          {formatCNPJ(detail.application.cnpj)}
                        </span>
                      </div>

                      <div className="approver-data-row">
                        <span className="approver-data-label">Nome Fantasia</span>
                        <span className="approver-data-value">{detail.application.trade_name}</span>
                      </div>

                      <div className="approver-data-row">
                        <span className="approver-data-label">Instagram</span>
                        {detail.application.instagram ? (
                          <a
                            href={
                              detail.application.instagram.startsWith('http')
                                ? detail.application.instagram
                                : `https://instagram.com/${detail.application.instagram.replace('@', '')}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}
                          >
                            <span>{detail.application.instagram}</span>
                            <ExternalLinkIcon size={12} />
                          </a>
                        ) : (
                          <span className="approver-data-value" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                            Não informado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Endereço Físico Completo */}
                  <div className="approver-card-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
                      <h3 className="approver-section-title">
                        <LocationIcon size={16} style={{ color: 'var(--primary)' }} />
                        <span>Endereço Completo do Estabelecimento</span>
                      </h3>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${detail.application.street}, ${detail.application.number}, ${detail.application.district}, ${detail.application.city} - ${detail.application.state}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn ghost sm"
                        style={{
                          fontSize: '.78rem',
                          padding: '.25rem .65rem',
                          minHeight: '30px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.3rem',
                        }}
                      >
                        <span>Abrir no Google Maps</span>
                        <ExternalLinkIcon size={11} />
                      </a>
                    </div>
                    <div style={{ fontSize: '.88rem', color: 'var(--fg)', lineHeight: 1.5 }}>
                      <strong>{detail.application.street}, {detail.application.number}</strong>
                      {detail.application.complement ? ` · Compl: ${detail.application.complement}` : ''}
                      <br />
                      <span style={{ color: 'var(--muted)' }}>
                        {detail.application.district} · {detail.application.city} - {detail.application.state} · CEP: {formatCEP(detail.application.zip_code)}
                      </span>
                    </div>
                  </div>

                  {/* Descrição do Espaço (se preenchida) */}
                  {detail.application.description && (
                    <div className="approver-card-section">
                      <h3 className="approver-section-title">
                        <span>Descrição das Instalações e Atendimento</span>
                      </h3>
                      <p style={{ margin: 0, fontSize: '.86rem', color: 'var(--fg)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {detail.application.description}
                      </p>
                    </div>
                  )}

                  {/* Galeria de Fotos */}
                  <div className="approver-card-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
                      <h3 className="approver-section-title">
                        <CameraIcon size={16} style={{ color: 'var(--primary)' }} />
                        <span>Fotos do Estabelecimento</span>
                        <span className="badge badge-muted" style={{ marginLeft: '.25rem' }}>
                          {photoUrls.length} {photoUrls.length === 1 ? 'foto' : 'fotos'}
                        </span>
                      </h3>
                      <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                        Clique em uma imagem para ampliar
                      </span>
                    </div>

                    {photoUrls.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--card)', borderRadius: 'var(--r-md)', border: '1px dashed var(--line)' }}>
                        <p style={{ color: 'var(--muted)', fontSize: '.85rem', margin: 0 }}>
                          Nenhuma foto anexada nesta solicitação.
                        </p>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                          gap: '.75rem',
                        }}
                      >
                        {photoUrls.map((p, idx) => (
                          <div
                            key={p.path}
                            className="approver-photo-item"
                            onClick={() => setActivePhoto(p.url)}
                            title={`Foto ${idx + 1} - Clique para ampliar`}
                          >
                            <img
                              src={p.url}
                              alt={`Foto ${idx + 1}`}
                              loading="lazy"
                            />
                            <div className="approver-photo-overlay">
                              <span>Foto {idx + 1}</span>
                              <span>🔍</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Histórico da Decisão (se já decidido) */}
                  {detail.application.status !== 'pending' && (
                    <div
                      className="card"
                      style={{
                        padding: '1.15rem',
                        background:
                          detail.application.status === 'approved'
                            ? 'rgba(16, 185, 129, 0.08)'
                            : 'rgba(239, 68, 68, 0.08)',
                        borderColor:
                          detail.application.status === 'approved' ? '#10b981' : '#f87171',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '.45rem',
                          fontWeight: 700,
                          fontSize: '.92rem',
                          color:
                            detail.application.status === 'approved' ? '#059669' : '#dc2626',
                        }}
                      >
                        {detail.application.status === 'approved' ? (
                          <>
                            <CheckIcon size={18} />
                            <span>Aprovado por {detail.reviewer?.full_name || 'Aprovador'}</span>
                          </>
                        ) : (
                          <>
                            <AlertCircleIcon size={18} />
                            <span>Reprovado por {detail.reviewer?.full_name || 'Aprovador'}</span>
                          </>
                        )}
                        <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.82rem' }}>
                          em {detail.application.reviewed_at ? new Date(detail.application.reviewed_at).toLocaleString('pt-BR') : '-'}
                        </span>
                      </div>
                      {detail.application.review_comment && (
                        <div style={{ marginTop: '.6rem', fontSize: '.86rem', color: 'var(--fg)', lineHeight: 1.5, background: 'var(--card)', padding: '.75rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
                          <strong>Parecer / Motivo:</strong> {detail.application.review_comment}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mensagem de Erro / Alerta */}
                  {actionMsg && (
                    <div
                      className="card"
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        borderColor: '#f87171',
                        padding: '.85rem 1rem',
                        color: '#dc2626',
                        fontSize: '.86rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '.6rem',
                      }}
                    >
                      <AlertCircleIcon size={18} />
                      <span>{actionMsg}</span>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Rodapé Fixo com Ações de Moderação */}
            <div className="modal-footer">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '.75rem' }}>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={fecharDetalhes}
                  style={{ minHeight: '40px' }}
                >
                  ← Fechar
                </button>

                {detail && detail.application.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {!showRejectBox ? (
                      <>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={actionBusy}
                          onClick={() => setShowRejectBox(true)}
                          style={{
                            color: '#ef4444',
                            borderColor: 'rgba(239, 68, 68, 0.4)',
                            minHeight: '40px',
                            fontWeight: 600,
                          }}
                        >
                          ✕ Reprovar com Justificativa
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          disabled={actionBusy}
                          onClick={() => {
                            if (window.confirm(`Confirma a APROVAÇÃO de "${detail.application.trade_name}" para publicação no Hub?`)) {
                              decidir(true)
                            }
                          }}
                          style={{
                            background: '#10b981',
                            borderColor: '#10b981',
                            color: '#fff',
                            minHeight: '40px',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.35rem',
                          }}
                        >
                          <CheckIcon size={16} />
                          <span>{actionBusy ? 'Processando...' : 'Aprovar Estabelecimento'}</span>
                        </button>
                      </>
                    ) : (
                      <div style={{ width: '100%', background: 'var(--bg-sub)', padding: '1rem', borderRadius: 'var(--r-md)', border: '1px solid rgba(239,68,68,0.3)', marginTop: '.5rem' }}>
                        <label style={{ margin: 0, display: 'block' }}>
                          <span style={{ fontWeight: 600, fontSize: '.86rem', color: '#dc2626' }}>
                            Motivo da Reprovação (obrigatório, mín. 10 caracteres):
                          </span>
                          <textarea
                            rows={3}
                            autoFocus
                            value={rejectComment}
                            onChange={e => setRejectComment(e.target.value)}
                            placeholder="Descreva detalhadamente o que precisa ser corrigido pelo solicitante (ex.: foto ilegível, endereço inconsistente, etc.)..."
                            style={{ marginTop: '.4rem', fontSize: '.85rem', width: '100%' }}
                          />
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.4rem' }}>
                          <small style={{ color: rejectComment.trim().length < 10 ? '#ef4444' : 'var(--muted)', fontSize: '.76rem' }}>
                            {rejectComment.trim().length} / 10 caracteres mínimos
                          </small>
                          <div style={{ display: 'flex', gap: '.5rem' }}>
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => {
                                setShowRejectBox(false)
                                setRejectComment('')
                              }}
                              disabled={actionBusy}
                              style={{ minHeight: '36px' }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => decidir(false)}
                              disabled={actionBusy || rejectComment.trim().length < 10}
                              style={{
                                background: '#dc2626',
                                borderColor: '#dc2626',
                                color: '#fff',
                                minHeight: '36px',
                                fontWeight: 600,
                              }}
                            >
                              {actionBusy ? 'Reprovando...' : 'Confirmar Reprovação'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox / Zoom da Foto em Tela Cheia (via Portal) */}
      {activePhoto && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            animation: 'fadeIn .18s ease both',
          }}
        >
          <img
            src={activePhoto}
            alt="Foto ampliada"
            style={{
              maxWidth: '92vw',
              maxHeight: '88vh',
              objectFit: 'contain',
              borderRadius: 'var(--r-md)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            }}
          />
          <button
            type="button"
            onClick={() => setActivePhoto(null)}
            aria-label="Fechar foto ampliada"
            title="Fechar (Esc)"
            style={{
              position: 'absolute',
              top: '1.25rem',
              right: '1.25rem',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '50%',
              width: '42px',
              height: '42px',
              fontSize: '1.15rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background var(--tr)',
            }}
          >
            ✕
          </button>
        </div>,
        document.body
      )}
    </main>
  )
}
