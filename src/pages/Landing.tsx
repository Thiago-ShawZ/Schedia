import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SearchIcon, ClockIcon, BuildingIcon } from '../components/Icons'

const features = [
  {
    Icon: SearchIcon,
    title: 'Descoberta de serviços locais',
    desc: 'Encontre clínicas, barbearias, estúdios e profissionais autônomos com grade de horários em tempo real.',
  },
  {
    Icon: ClockIcon,
    title: 'Agendamento imediato',
    desc: 'Selecione o profissional, o serviço e o horário ideal sem troca de mensagens ou espera por confirmação manual.',
  },
  {
    Icon: BuildingIcon,
    title: 'Gestão completa para o negócio',
    desc: 'Catálogo de serviços e produtos, bloqueios de folga, regras de cancelamento e controle de faturamento em um único lugar.',
  },
]

export default function Landing() {
  const { session } = useAuth()

  return (
    <main>
      <section className="hero">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '.4rem',
            padding: '.3rem .85rem',
            borderRadius: '9999px',
            background: 'var(--primary-lt)',
            color: 'var(--primary)',
            fontSize: '.8rem',
            fontWeight: 700,
            marginBottom: '1.25rem',
            letterSpacing: '.02em',
          }}
        >
          Plataforma de Gestão e Reservas
        </div>
        <h1>Agendamentos inteligentes para microempreendedores</h1>
        <p>
          O Schedia conecta clientes a serviços locais e organiza o dia a dia do seu negócio em uma plataforma moderna, rápida e confiável.
        </p>
        <div className="row" style={{ marginTop: '1.5rem', gap: '.85rem' }}>
          <Link className="btn" to="/hub" style={{ padding: '.75rem 1.75rem', fontSize: '.95rem' }}>
            Explorar Negócios no Hub
          </Link>
          {session ? (
            <Link className="btn ghost" to="/painel" style={{ padding: '.75rem 1.5rem', fontSize: '.95rem' }}>
              Acessar Painel de Gestão
            </Link>
          ) : (
            <Link className="btn ghost" to="/entrar" style={{ padding: '.75rem 1.5rem', fontSize: '.95rem' }}>
              Cadastrar meu negócio
            </Link>
          )}
        </div>

        <div className="hero-features">
          {features.map(({ Icon, title, desc }) => (
            <article className="card" key={title} style={{ textAlign: 'left', padding: '1.5rem 1.35rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--primary-lt)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1rem',
                }}
              >
                <Icon size={20} />
              </div>
              <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>{title}</h2>
              <p style={{ marginTop: '.35rem', lineHeight: 1.5, color: 'var(--muted)', fontSize: '.88rem' }}>
                {desc}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
