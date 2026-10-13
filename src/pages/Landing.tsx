import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const features = [
  {
    icon: '🔍',
    title: 'Descubra serviços locais',
    desc: 'Encontre barbearias, clínicas, estúdios e profissionais autônomos com horários em tempo real.',
  },
  {
    icon: '⚡',
    title: 'Agendamento em segundos',
    desc: 'Escolha o profissional, o serviço e o melhor horário disponível sem troca de mensagens ou espera.',
  },
  {
    icon: '💼',
    title: 'Gestão completa do negócio',
    desc: 'Catálogo de serviços e produtos, bloqueios de folga, regras de cancelamento e controle de agenda.',
  },
]

export default function Landing() {
  const { session } = useAuth()

  return (
    <main>
      <section className="hero">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: '.25rem .75rem', borderRadius: '9999px', background: 'var(--primary-lt)', color: 'var(--primary)', fontSize: '.8rem', fontWeight: 700, marginBottom: '1.25rem' }}>
          ✨ A nova forma de agendar e ser atendido
        </div>
        <h1>Agendamentos inteligentes para microempreendedores</h1>
        <p>
          O Schedia conecta clientes a serviços locais e organiza o dia a dia do seu negócio em uma plataforma moderna, rápida e sem complicação.
        </p>
        <div className="row" style={{ marginTop: '1.5rem', gap: '.85rem' }}>
          <Link className="btn" to="/hub" style={{ padding: '.75rem 1.75rem', fontSize: '.95rem' }}>
            Explorar Negócios no Hub
          </Link>
          {session ? (
            <Link className="btn ghost" to="/painel" style={{ padding: '.75rem 1.5rem', fontSize: '.95rem' }}>
              Acessar Meu Painel
            </Link>
          ) : (
            <Link className="btn ghost" to="/entrar" style={{ padding: '.75rem 1.5rem', fontSize: '.95rem' }}>
              Sou Profissional / Cadastrar
            </Link>
          )}
        </div>

        <div className="hero-features">
          {features.map(f => (
            <article className="card" key={f.title} style={{ textAlign: 'left', padding: '1.5rem 1.25rem' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '.6rem' }}>{f.icon}</div>
              <h2>{f.title}</h2>
              <p style={{ marginTop: '.35rem', lineHeight: 1.5 }}>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
