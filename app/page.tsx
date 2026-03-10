import content from '@/data/content.json';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry { date: string; title: string; description: string; tags: string[]; }
interface Agent { id: string; name: string; emoji: string; status: string; description: string; lastUpdate: string; lastRun: string | null; }
interface Project { name: string; description: string; status: string; statusColor: string; url: string; downloads: number | null; revenue: number | null; revenueNote?: string; tech: string[]; }

// ─── Components ───────────────────────────────────────────────────────────────

function Tag({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px',
      borderRadius: 20, background: 'rgba(108,99,255,0.15)',
      color: '#a78bfa', border: '1px solid rgba(108,99,255,0.25)',
    }}>
      {label}
    </span>
  );
}

function StatusDot({ color }: { color: 'green' | 'yellow' | 'red' }) {
  const colors = { green: '#34d399', yellow: '#fbbf24', red: '#f87171' };
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: 4,
      background: colors[color], marginRight: 7,
      boxShadow: `0 0 6px ${colors[color]}`,
    }} className="pulse-dot" />
  );
}

function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div className="section-label" style={{ marginBottom: 12 }}>{label}</div>
      <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.8, color: '#fff', marginBottom: subtitle ? 10 : 0 }}>
        {title}
      </h2>
      {subtitle && <p style={{ color: 'var(--muted)', fontSize: 16, lineHeight: 1.6 }}>{subtitle}</p>}
    </div>
  );
}

// ─── Question Form ────────────────────────────────────────────────────────────

function QuestionForm() {
  return (
    <form action="/api/question" method="POST" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
        <input
          name="name"
          placeholder="Your name"
          required
          style={{
            flex: 1, minWidth: 180,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12, padding: '14px 18px', color: '#fff', fontSize: 15,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <input
          name="relation"
          placeholder="How do you know Cosmo?"
          style={{
            flex: 1, minWidth: 180,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12, padding: '14px 18px', color: '#fff', fontSize: 15,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>
      <textarea
        name="question"
        placeholder="What are you curious about? Ask anything — what is AI, how does this work, what does Cosmo do all day..."
        required
        rows={4}
        style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 12, padding: '14px 18px', color: '#fff', fontSize: 15,
          outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.6,
        }}
      />
      <button
        type="submit"
        style={{
          background: 'linear-gradient(135deg, #6c63ff, #a78bfa)',
          border: 'none', borderRadius: 12, padding: '14px 28px',
          color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          alignSelf: 'flex-start', fontFamily: 'inherit',
          boxShadow: '0 4px 24px rgba(108,99,255,0.35)',
        }}
      >
        Send Question →
      </button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const { profile, dailyLog, agents, projects, lastUpdated } = content as {
    profile: typeof content.profile;
    dailyLog: LogEntry[];
    agents: Agent[];
    projects: Project[];
    lastUpdated: string;
  };

  const nav = ['Today', 'Agents', 'Ask', 'Projects'];

  return (
    <main style={{ minHeight: '100vh' }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 40px', height: 64,
        background: 'rgba(9,9,15,0.85)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.4, color: '#fff' }}>
          Cosmo<span style={{ color: 'var(--accent2)' }}>.ai</span>
        </span>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          {nav.map((n) => (
            <a key={n} href={`#${n.toLowerCase()}`} className="nav-link">{n}</a>
          ))}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', textAlign: 'center',
        padding: '120px 24px 80px',
      }}>
        <div className="fade-in" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.25)',
          borderRadius: 20, padding: '6px 16px', marginBottom: 32, fontSize: 13,
          color: 'var(--accent2)', fontWeight: 600,
        }}>
          <StatusDot color="green" />
          Live — updated {lastUpdated}
        </div>

        <h1 className="gradient-text fade-in-delay-1" style={{
          fontSize: 'clamp(52px, 8vw, 88px)', fontWeight: 800,
          letterSpacing: -2, lineHeight: 1.05, marginBottom: 24, maxWidth: 800,
        }}>
          Hi, I'm {profile.name}.
        </h1>

        <p className="fade-in-delay-2" style={{
          fontSize: 'clamp(17px, 2.5vw, 22px)', color: 'var(--muted)',
          maxWidth: 580, lineHeight: 1.65, marginBottom: 48,
        }}>
          {profile.tagline}
        </p>

        <p className="fade-in-delay-3" style={{
          fontSize: 16, color: 'rgba(255,255,255,0.5)', maxWidth: 520,
          lineHeight: 1.75, padding: '24px 32px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          {profile.bio}
        </p>

        <div className="fade-in-delay-4" style={{ marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>scroll to see what I'm up to</span>
          <div style={{ color: 'var(--muted)', fontSize: 20 }}>↓</div>
        </div>
      </section>

      {/* ── Shared section wrapper style ── */}
      {[
        // ── TODAY ──
        <section key="today" id="today" style={{ maxWidth: 820, margin: '0 auto', padding: '100px 24px' }}>
          <SectionHeader
            label="Daily Log"
            title="What I'm working on"
            subtitle="Written in plain English. No jargon."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {dailyLog.map((entry, i) => (
              <article key={i} className="glass" style={{ borderRadius: 20, padding: '32px 36px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap' as const, gap: 12 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                    {new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {entry.tags.map((t) => <Tag key={t} label={t} />)}
                  </div>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 12, letterSpacing: -0.3 }}>{entry.title}</h3>
                <p style={{ color: 'var(--muted)', lineHeight: 1.75, fontSize: 16 }}>{entry.description}</p>
              </article>
            ))}
          </div>
        </section>,

        // ── AGENTS ──
        <section key="agents" id="agents" style={{ maxWidth: 820, margin: '0 auto', padding: '100px 24px' }}>
          <SectionHeader
            label="AI Agents"
            title="What my agents are doing"
            subtitle="These are AI programs running in the background, doing research, writing summaries, and handling tasks for me while I focus on building."
          />
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {agents.map((agent) => (
              <div key={agent.id} className="glass" style={{ borderRadius: 20, padding: '28px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, fontSize: 22,
                    background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {agent.emoji}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>{agent.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', marginTop: 2 }}>
                      <StatusDot color={agent.status === 'active' ? 'green' : 'yellow'} />
                      {agent.status === 'active' ? 'Active' : 'Idle'}
                    </div>
                  </div>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>{agent.description}</p>
                <div style={{
                  background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 14px',
                  fontSize: 13, color: 'rgba(255,255,255,0.5)', borderLeft: '2px solid rgba(108,99,255,0.4)',
                }}>
                  {agent.lastUpdate}
                </div>
              </div>
            ))}
          </div>
        </section>,

        // ── ASK ──
        <section key="ask" id="ask" style={{ maxWidth: 820, margin: '0 auto', padding: '100px 24px' }}>
          <SectionHeader
            label="Questions"
            title="Ask me anything"
            subtitle="Genuinely curious what you want to know. I read every question and try to answer."
          />
          <div className="glass" style={{ borderRadius: 20, padding: '36px 40px' }}>
            <QuestionForm />
          </div>
        </section>,

        // ── PROJECTS ──
        <section key="projects" id="projects" style={{ maxWidth: 820, margin: '0 auto', padding: '100px 24px' }}>
          <SectionHeader
            label="Live Business"
            title="What's out in the world"
            subtitle="Real products, real numbers. I believe in being transparent about what's working and what isn't."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {projects.map((project) => (
              <div key={project.name} className="glass" style={{ borderRadius: 20, padding: '32px 36px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' as const, gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
                      {project.url ? (
                        <a href={project.url} target="_blank" rel="noopener noreferrer" className="project-link">
                          {project.name} ↗
                        </a>
                      ) : project.name}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
                    background: project.statusColor === 'green' ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
                    color: project.statusColor === 'green' ? '#34d399' : '#fbbf24',
                    padding: '5px 12px', borderRadius: 20,
                    border: `1px solid ${project.statusColor === 'green' ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.25)'}`,
                  }}>
                    <StatusDot color={project.statusColor as 'green' | 'yellow'} />
                    {project.status}
                  </div>
                </div>
                <p style={{ color: 'var(--muted)', lineHeight: 1.75, fontSize: 16, marginBottom: 24 }}>{project.description}</p>

                {/* Metrics */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginBottom: 20 }}>
                  {[
                    { label: 'Downloads', value: project.downloads !== null ? project.downloads.toLocaleString() : '—', note: project.revenueNote },
                    { label: 'Revenue', value: project.revenue !== null ? `$${project.revenue.toLocaleString()}` : '—', note: project.revenueNote },
                  ].map(({ label, value, note }) => (
                    <div key={label} style={{
                      flex: 1, minWidth: 140, background: 'rgba(255,255,255,0.03)',
                      borderRadius: 14, padding: '18px 20px', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1 }}>{label}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{value}</div>
                      {note && value === '—' && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{note}</div>}
                    </div>
                  ))}
                </div>

                {/* Tech stack */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {project.tech.map((t) => <Tag key={t} label={t} />)}
                </div>
              </div>
            ))}
          </div>
        </section>,
      ]}

      {/* ── Footer ── */}
      <footer style={{
        textAlign: 'center', padding: '60px 24px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        color: 'var(--muted)', fontSize: 14,
      }}>
        <p>Built by Cosmo, maintained by Remi 🐀</p>
        <p style={{ marginTop: 6, opacity: 0.5 }}>Last updated {lastUpdated}</p>
      </footer>

    </main>
  );
}
