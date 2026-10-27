import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  ShieldCheckIcon,
  CheckIcon,
  AlertCircleIcon,
  LocationIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  WhatsAppIcon,
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

  async function abrirDetalhes(id: string) {
    setSelectedId(id)
    setDetail(null)
    setDetailLoading(true)
    setPhotoUrls([])
    setShowRejectBox(false)
    setRejectComment('')
    setActionMsg('')

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
      const msgTraduzida =
        error.message.includes('already_decided')
          ? 'Esta solicitação já foi decidida por outro aprovador.'
          : error.message.includes('cannot_review_own')
          ? 'Você não pode decidir a solicitação do seu próprio negócio.'
          : error.message.includes('comment_required')
          ? 'O comentário de reprovação deve conter no mínimo 10 caracteres.'
          : error.message.includes('forbidden')
          ? 'Acesso não autorizado para perfil de aprovador.'
          : error.message

      setActionMsg(msgTraduzida)
      // Atualiza detalhes para sincronizar com o estado atual do banco
      abrirDetalhes(detail.application.id)
      return
    }

    // Sucesso: fecha detalhes e recarrega a lista
    fecharDetalhes()
    carregarLista(filter, 0, true)
  }

  return (
    <main className="container" style={{ padding: '2rem 1rem 4rem' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.35rem' }}>
          <div style={{ color: 'var(--primary)', display: 'inline-flex' }}>
            <ShieldCheckIcon size={26} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
            Painel de Aprovadores
          </h1>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem', margin: 0 }}>
          Homologação e análise cadastral dos novos negócios cadastrados no Schedia.
        </p>
      </div>

      {/* Abas de filtro */}
      <div
        style={{
          display: 'flex',
          gap: '.5rem',
          borderBottom: '1px solid var(--line)',
          marginBottom: '1.5rem',
        }}
      >
        <button
          className={`btn ${filter === 'pending' ? '' : 'ghost'}`}
          onClick={() => setFilter('pending')}
          style={{
            borderRadius: 'var(--r-md) var(--r-md) 0 0',
            borderBottom: filter === 'pending' ? '2px solid var(--primary)' : 'none',
            minHeight: '44px',
            padding: '.6rem 1.25rem',
            fontWeight: 600,
          }}
        >
          Pendentes
        </button>
        <button
          className={`btn ${filter === 'approved' ? '' : 'ghost'}`}
          onClick={() => setFilter('approved')}
          style={{
            borderRadius: 'var(--r-md) var(--r-md) 0 0',
            borderBottom: filter === 'approved' ? '2px solid var(--primary)' : 'none',
            minHeight: '44px',
            padding: '.6rem 1.25rem',
            fontWeight: 600,
          }}
        >
          Aprovados
        </button>
        <button
          className={`btn ${filter === 'rejected' ? '' : 'ghost'}`}
          onClick={() => setFilter('rejected')}
          style={{
            borderRadius: 'var(--r-md) var(--r-md) 0 0',
            borderBottom: filter === 'rejected' ? '2px solid var(--primary)' : 'none',
            minHeight: '44px',
            padding: '.6rem 1.25rem',
            fontWeight: 600,
          }}
        >
          Reprovados
        </button>
      </div>

      {/* Lista de Solicitações */}
      {loading ? (
        <div className="center" style={{ padding: '3rem 0' }}>
          <div className="spinner" />
          <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando solicitações...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card empty" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--bg-sub)', borderRadius: '50%', color: 'var(--muted)', marginBottom: '.75rem' }}>
            <ShieldCheckIcon size={32} />
          </div>
          <h2>Nenhuma solicitação encontrada</h2>
          <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.25rem auto' }}>
            Não há cadastros com status <strong>{filter === 'pending' ? 'pendente' : filter === 'approved' ? 'aprovado' : 'reprovado'}</strong> no momento.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
          {items.map(item => (
            <div
              key={item.id}
              className="card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                borderLeft: `4px solid ${
                  item.status === 'approved'
                    ? '#10b981'
                    : item.status === 'rejected'
                    ? '#ef4444'
                    : '#3b82f6'
                }`,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, overflowWrap: 'break-word' }}>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem', flexWrap: 'wrap', fontSize: '.82rem', color: 'var(--muted)' }}>
                  {item.city && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '.25rem' }}>
                      <LocationIcon size={13} />
                      {item.city}
                    </span>
                  )}
                  <span>
                    Solicitante: <strong>{item.applicant_name || 'Usuário'}</strong>
                    {item.applicant_phone ? ` (${item.applicant_phone})` : ''}
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
                  style={{ minHeight: '44px', padding: '.5rem 1rem' }}
                  onClick={() => abrirDetalhes(item.id)}
                >
                  Revisar solicitação →
                </button>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="center" style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn ghost sm"
                disabled={loadingMore}
                onClick={() => carregarLista(filter, pageOffset, false)}
                style={{ minHeight: '44px', minWidth: '160px' }}
              >
                {loadingMore ? 'Carregando mais...' : 'Carregar mais solicitações'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal / Gaveta de Detalhamento da Solicitação */}
      {selectedId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={fecharDetalhes}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '820px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.75rem',
              position: 'relative',
              background: 'var(--card)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--sh-lg)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '1rem' }}>
              <div>
                <button
                  type="button"
                  className="link"
                  onClick={fecharDetalhes}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.84rem', marginBottom: '.5rem' }}
                >
                  <ArrowLeftIcon size={14} />
                  <span>Voltar para listagem</span>
                </button>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
                  {detail?.application.trade_name || 'Carregando solicitação...'}
                </h2>
                <small style={{ color: 'var(--muted)', fontSize: '.8rem' }}>
                  ID da Solicitação: {selectedId}
                </small>
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={fecharDetalhes}
                aria-label="Fechar"
                style={{ minWidth: '44px', minHeight: '44px', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="center" style={{ padding: '3rem 0' }}>
                <div className="spinner" />
                <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando dados da moderação...</p>
              </div>
            ) : detail ? (
              <div>
                {/* Status e Identificação do Negócio */}
                <div
                  style={{
                    background: 'var(--bg-sub)',
                    borderRadius: 'var(--r-md)',
                    padding: '1rem',
                    marginBottom: '1.25rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '.75rem',
                    fontSize: '.85rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '.75rem' }}>STATUS DA ANÁLISE</span>
                    <span
                      className={`badge ${
                        detail.application.status === 'approved'
                          ? 'badge-ok'
                          : detail.application.status === 'rejected'
                          ? 'badge-danger'
                          : 'badge-info'
                      }`}
                      style={{ marginTop: '.25rem' }}
                    >
                      {detail.application.status === 'approved'
                        ? 'Aprovado'
                        : detail.application.status === 'rejected'
                        ? 'Reprovado'
                        : 'Pendente'}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '.75rem' }}>PÁGINA PÚBLICA</span>
                    <a
                      href={`/n/${detail.business.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontWeight: 600, marginTop: '.25rem' }}
                    >
                      <span>/n/{detail.business.slug}</span>
                      <ExternalLinkIcon size={12} />
                    </a>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '.75rem' }}>CATEGORIA</span>
                    <strong style={{ display: 'block', marginTop: '.25rem' }}>
                      {detail.business.category_name || 'Sem categoria'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '.75rem' }}>FAIXA DE FATURAMENTO</span>
                    <strong style={{ display: 'block', marginTop: '.25rem' }}>
                      {FAIXA_MAP[detail.application.revenue_range] || detail.application.revenue_range}
                    </strong>
                  </div>
                </div>

                {/* Dados do Solicitante e CNPJ */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  {/* Solicitante */}
                  <div className="card" style={{ padding: '1rem', background: 'var(--bg-sub)' }}>
                    <h3 style={{ margin: '0 0 .5rem', fontSize: '.9rem', fontWeight: 600 }}>Dados do Solicitante</h3>
                    <p style={{ margin: 0, fontSize: '.84rem' }}>
                      Nome: <strong>{detail.applicant.full_name || 'Não informado'}</strong>
                    </p>
                    <p style={{ margin: '.25rem 0 0', fontSize: '.84rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                      Telefone: <strong>{detail.applicant.phone || 'Sem telefone'}</strong>
                      {detail.applicant.phone && (
                        <a
                          href={`https://wa.me/55${detail.applicant.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#25d366', display: 'inline-flex' }}
                          title="Abrir no WhatsApp"
                        >
                          <WhatsAppIcon size={15} />
                        </a>
                      )}
                    </p>
                    <small style={{ display: 'block', marginTop: '.4rem', color: 'var(--muted)', fontSize: '.76rem' }}>
                      Enviado em {new Date(detail.application.created_at).toLocaleString('pt-BR')}
                    </small>
                  </div>

                  {/* Documento e Social */}
                  <div className="card" style={{ padding: '1rem', background: 'var(--bg-sub)' }}>
                    <h3 style={{ margin: '0 0 .5rem', fontSize: '.9rem', fontWeight: 600 }}>Documentos & Contato</h3>
                    <p style={{ margin: 0, fontSize: '.84rem' }}>
                      CNPJ: <strong>{formatCNPJ(detail.application.cnpj)}</strong>
                    </p>
                    <p style={{ margin: '.25rem 0 0', fontSize: '.84rem' }}>
                      Instagram:{' '}
                      {detail.application.instagram ? (
                        <a
                          href={
                            detail.application.instagram.startsWith('http')
                              ? detail.application.instagram
                              : `https://instagram.com/${detail.application.instagram.replace('@', '')}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--primary)', fontWeight: 600 }}
                        >
                          {detail.application.instagram}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>Não informado</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Endereço Físico Completo */}
                <div className="card" style={{ padding: '1rem', background: 'var(--bg-sub)', marginBottom: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 .4rem', fontSize: '.9rem', fontWeight: 600 }}>Endereço Completo do Estabelecimento</h3>
                  <p style={{ margin: 0, fontSize: '.86rem', lineHeight: 1.45 }}>
                    {detail.application.street}, {detail.application.number}
                    {detail.application.complement ? ` - ${detail.application.complement}` : ''}
                    <br />
                    {detail.application.district} · {detail.application.city} - {detail.application.state} · CEP {formatCEP(detail.application.zip_code)}
                  </p>
                </div>

                {/* Descrição do Espaço */}
                {detail.application.description && (
                  <div className="card" style={{ padding: '1rem', background: 'var(--bg-sub)', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: '0 0 .4rem', fontSize: '.9rem', fontWeight: 600 }}>Descrição das Instalações e Atendimento</h3>
                    <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                      {detail.application.description}
                    </p>
                  </div>
                )}

                {/* Galeria de Fotos */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '.95rem', fontWeight: 600 }}>
                      Fotos da Análise ({photoUrls.length} anexada{photoUrls.length === 1 ? '' : 's'})
                    </h3>
                    <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                      Clique em uma foto para ampliar
                    </span>
                  </div>

                  {photoUrls.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: '.84rem' }}>
                      Nenhuma foto carregada ou expirada.
                    </p>
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
                          onClick={() => setActivePhoto(p.url)}
                          style={{
                            aspectRatio: '4/3',
                            borderRadius: 'var(--r-md)',
                            overflow: 'hidden',
                            border: '1px solid var(--line)',
                            cursor: 'pointer',
                            background: '#000',
                          }}
                        >
                          <img
                            src={p.url}
                            alt={`Foto ${idx + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
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
                      padding: '1rem',
                      background: detail.application.status === 'approved' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                      borderColor: detail.application.status === 'approved' ? '#10b981' : '#f87171',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '.88rem', color: detail.application.status === 'approved' ? '#047857' : '#dc2626' }}>
                      {detail.application.status === 'approved' ? 'Aprovado' : 'Reprovado'} por {detail.reviewer?.full_name || 'Aprovador'} em{' '}
                      {detail.application.reviewed_at ? new Date(detail.application.reviewed_at).toLocaleString('pt-BR') : '-'}
                    </div>
                    {detail.application.review_comment && (
                      <p style={{ margin: '.35rem 0 0', fontSize: '.85rem', whiteSpace: 'pre-wrap' }}>
                        <strong>Comentário:</strong> {detail.application.review_comment}
                      </p>
                    )}
                  </div>
                )}

                {/* Mensagem de Erro / Feedback de Ação */}
                {actionMsg && (
                  <div
                    className="card"
                    style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      borderColor: '#f87171',
                      padding: '.75rem',
                      marginBottom: '1rem',
                      color: '#dc2626',
                      fontSize: '.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.5rem',
                    }}
                  >
                    <AlertCircleIcon size={16} />
                    <span>{actionMsg}</span>
                  </div>
                )}

                {/* Ações de Moderação (só se pending) */}
                {detail.application.status === 'pending' && (
                  <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
                    {!showRejectBox ? (
                      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn"
                          disabled={actionBusy}
                          onClick={() => {
                            if (window.confirm('Confirma a APROVAÇÃO deste negócio?')) {
                              decidir(true)
                            }
                          }}
                          style={{
                            background: '#10b981',
                            borderColor: '#10b981',
                            color: '#fff',
                            flex: 1,
                            minHeight: '44px',
                            fontWeight: 600,
                          }}
                        >
                          {actionBusy ? 'Processando...' : '✓ Aprovar Negócio'}
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={actionBusy}
                          onClick={() => setShowRejectBox(true)}
                          style={{
                            color: '#ef4444',
                            borderColor: '#fca5a5',
                            flex: 1,
                            minHeight: '44px',
                            fontWeight: 600,
                          }}
                        >
                          ✕ Reprovar com Justificativa
                        </button>
                      </div>
                    ) : (
                      <div style={{ background: 'var(--bg-sub)', padding: '1rem', borderRadius: 'var(--r-md)' }}>
                        <label style={{ margin: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: '.88rem', color: '#dc2626' }}>
                            Motivo da Reprovação (obrigatório, mín. 10 caracteres):
                          </span>
                          <textarea
                            rows={3}
                            value={rejectComment}
                            onChange={e => setRejectComment(e.target.value)}
                            placeholder="Descreva detalhadamente o que o solicitante deve corrigir (ex.: foto da fachada ilegível, endereço inconsistente, etc.)..."
                            style={{ marginTop: '.4rem', fontSize: '.85rem' }}
                          />
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.35rem' }}>
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
                              style={{ minHeight: '38px' }}
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
                                minHeight: '38px',
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
            ) : null}
          </div>
        </div>
      )}

      {/* Lightbox / Zoom da Foto */}
      {activePhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <img
            src={activePhoto}
            alt="Foto ampliada"
            style={{
              maxWidth: '95vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 'var(--r-md)',
            }}
          />
          <button
            type="button"
            onClick={() => setActivePhoto(null)}
            aria-label="Fechar foto ampliada"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              fontSize: '1.25rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </main>
  )
}
