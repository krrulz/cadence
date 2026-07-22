// AURORA design prototype — a self-contained, dark-first, glassmorphic take on
// the admin dashboard using mock data. Public route (/prototype) so it can be
// viewed without login and iterated on before rolling the system out for real.
// Styling is intentionally self-contained (inline + a scoped <style>) so it
// doesn't touch the live light-mode app.

const EMPLOYEES = [
  { name: 'Aisha Verma', dept: 'Engineering', rating: 4.6, grievances: 0, leave: 12, tags: ['On track'] },
  { name: 'Bram De Vos', dept: 'Design', rating: 3.2, grievances: 1, leave: 6, tags: ['Low rating', 'Grievance'] },
  { name: 'Chen Wei', dept: 'Engineering', rating: 4.9, grievances: 0, leave: 18, tags: ['On track'] },
  { name: 'Diego Ramos', dept: 'Sales', rating: 4.1, grievances: 0, leave: 3, tags: ['Low leave'] },
  { name: 'Elena Novak', dept: 'People', rating: 4.4, grievances: 0, leave: 9, tags: ['On track'] },
  { name: 'Farah Khan', dept: 'Sales', rating: 2.8, grievances: 2, leave: 7, tags: ['Low rating', 'Grievance'] },
]

const NAV = [
  { label: 'Overview', icon: IconGrid, active: true },
  { label: 'Analytics', icon: IconChart },
  { label: 'Calendar', icon: IconCalendar },
  { label: '1:1 Meetings', icon: IconChat },
  { label: 'Goals', icon: IconTarget },
  { label: 'Links', icon: IconLink },
]

const TAG_STYLE = {
  'On track': { fg: '#5EF2B0', bg: 'rgba(0,194,122,.14)', bd: 'rgba(0,194,122,.35)' },
  'Low rating': { fg: '#FF9DB0', bg: 'rgba(239,68,88,.14)', bd: 'rgba(239,68,88,.35)' },
  Grievance: { fg: '#FF9DB0', bg: 'rgba(239,68,88,.14)', bd: 'rgba(239,68,88,.35)' },
  'Low leave': { fg: '#FFD48A', bg: 'rgba(245,158,11,.14)', bd: 'rgba(245,158,11,.35)' },
}

function initials(name) {
  const p = name.split(' ')
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

export default function Prototype() {
  return (
    <div className="aur">
      {/* ambient background glows */}
      <div className="aur-glow aur-glow-a animate-floaty" aria-hidden="true" />
      <div className="aur-glow aur-glow-b animate-floaty-slow" aria-hidden="true" />

      <div className="aur-shell">
        {/* Sidebar */}
        <aside className="aur-side">
          <div className="aur-brand">
            <span className="aur-logo">C</span>
            <span className="aur-wordmark">Cadence</span>
          </div>

          <nav className="aur-nav">
            {NAV.map((n) => (
              <a key={n.label} className={`aur-navitem ${n.active ? 'is-active' : ''}`} href="#">
                <n.icon />
                <span>{n.label}</span>
              </a>
            ))}
          </nav>

          <div className="aur-userchip">
            <span className="aur-av" style={{ background: 'linear-gradient(135deg,#00C27A,#7C5CFF)' }}>
              KR
            </span>
            <span className="aur-userchip-txt">
              <b>Karthik R.</b>
              <small>People Manager</small>
            </span>
          </div>
        </aside>

        {/* Main */}
        <main className="aur-main">
          <header className="aur-top">
            <div>
              <p className="aur-kicker">Team workspace</p>
              <h1 className="aur-h1">Overview</h1>
            </div>
            <div className="aur-topright">
              <div className="aur-search">
                <IconSearch />
                <input placeholder="Search people…" />
                <kbd>⌘K</kbd>
              </div>
              <button className="aur-btn">+ Add Employee</button>
            </div>
          </header>

          {/* Stat cards */}
          <section className="aur-stats">
            <Stat label="Team Size" value="32" delta="+3 this quarter" up />
            <Stat label="Avg. Rating" value="4.3" delta="+0.2 vs H1" up spark />
            <Stat label="Open Grievances" value="5" delta="2 overdue" warn />
            <Stat label="Flagged" value="3" delta="needs attention" warn />
          </section>

          <div className="aur-cols">
            {/* Roster */}
            <section className="aur-card aur-roster">
              <div className="aur-card-head">
                <h2>Roster</h2>
                <span className="aur-muted">32 people</span>
              </div>
              <div className="aur-table">
                <div className="aur-tr aur-th">
                  <span>Name</span>
                  <span>Department</span>
                  <span>Rating</span>
                  <span>Leave</span>
                  <span>Status</span>
                </div>
                {EMPLOYEES.map((e) => (
                  <div key={e.name} className="aur-tr">
                    <span className="aur-person">
                      <span className="aur-av aur-av-sm" style={{ background: avatarGrad(e.name) }}>
                        {initials(e.name)}
                      </span>
                      <b>{e.name}</b>
                    </span>
                    <span className="aur-muted">{e.dept}</span>
                    <span className="aur-rating">
                      <span className="aur-ratebar">
                        <i style={{ width: `${(e.rating / 5) * 100}%` }} />
                      </span>
                      {e.rating.toFixed(1)}
                    </span>
                    <span className="aur-muted">{e.leave}d</span>
                    <span className="aur-tags">
                      {e.tags.map((t) => (
                        <em key={t} style={pill(t)}>
                          {t}
                        </em>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Side column: donut + pulse */}
            <section className="aur-card aur-aside">
              <div className="aur-card-head">
                <h2>Grievances</h2>
              </div>
              <Donut />
              <div className="aur-legend">
                <Legend c="#00C27A" k="Resolved" v="11" />
                <Legend c="#F59E0B" k="In progress" v="3" />
                <Legend c="#EF4444" k="Open" v="5" />
              </div>
              <div className="aur-pulse">
                <p className="aur-kicker">Recognitions this month</p>
                <div className="aur-pulsebars">
                  {[40, 65, 30, 80, 55, 90].map((h, i) => (
                    <span key={i} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <PrototypeStyles />
    </div>
  )
}

function Stat({ label, value, delta, up, warn, spark }) {
  return (
    <div className="aur-card aur-stat">
      <p className="aur-stat-label">{label}</p>
      <p className="aur-stat-value">{value}</p>
      <p className={`aur-stat-delta ${warn ? 'is-warn' : up ? 'is-up' : ''}`}>{delta}</p>
      {spark && (
        <svg className="aur-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
          <polyline points="0,24 20,18 40,20 60,10 80,14 100,4" fill="none" stroke="url(#sg)" strokeWidth="2.5" />
          <defs>
            <linearGradient id="sg" x1="0" x2="1">
              <stop offset="0" stopColor="#00C27A" />
              <stop offset="1" stopColor="#3BE3B0" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  )
}

function Donut() {
  const segs = [
    { c: '#00C27A', v: 11 },
    { c: '#F59E0B', v: 3 },
    { c: '#EF4444', v: 5 },
  ]
  const total = segs.reduce((s, x) => s + x.v, 0)
  const r = 52
  const circ = 2 * Math.PI * r
  let off = 0
  return (
    <svg viewBox="0 0 140 140" className="aur-donut">
      <g transform="rotate(-90 70 70)">
        {segs.map((s, i) => {
          const len = (s.v / total) * circ
          const el = (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={s.c}
              strokeWidth="16"
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-off}
              strokeLinecap="round"
            />
          )
          off += len
          return el
        })}
      </g>
      <text x="70" y="66" textAnchor="middle" className="aur-donut-num">
        {total}
      </text>
      <text x="70" y="86" textAnchor="middle" className="aur-donut-cap">
        total
      </text>
    </svg>
  )
}

function Legend({ c, k, v }) {
  return (
    <span className="aur-leg">
      <i style={{ background: c }} />
      {k}
      <b>{v}</b>
    </span>
  )
}

function avatarGrad(name) {
  // Green-forward: mostly green/teal, violet only as an occasional accent.
  const grads = [
    'linear-gradient(135deg,#00E28E,#12B5C9)',
    'linear-gradient(135deg,#00C27A,#0EA5A5)',
    'linear-gradient(135deg,#12B5C9,#00C27A)',
    'linear-gradient(135deg,#00E28E,#34D399)',
    'linear-gradient(135deg,#00C27A,#7C5CFF)',
    'linear-gradient(135deg,#0EA5A5,#00E28E)',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return grads[h % grads.length]
}

function pill(tag) {
  const s = TAG_STYLE[tag] || TAG_STYLE['On track']
  return { color: s.fg, background: s.bg, border: `1px solid ${s.bd}` }
}

/* --- inline icons (Lucide-style) --- */
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" />
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}
function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
    </svg>
  )
}
function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function PrototypeStyles() {
  return (
    <style>{`
.aur{position:relative;min-height:100vh;overflow:hidden;background:#080B14;color:#E7ECF5;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.aur-glow{position:fixed;border-radius:50%;filter:blur(90px);pointer-events:none;z-index:0}
.aur-glow-a{top:-120px;left:-80px;width:420px;height:420px;background:rgba(0,194,122,.28)}
.aur-glow-b{bottom:-140px;right:-60px;width:460px;height:460px;background:rgba(124,92,255,.28)}
.aur-shell{position:relative;z-index:1;display:grid;grid-template-columns:220px 1fr;min-height:100vh}
@media(max-width:820px){.aur-shell{grid-template-columns:1fr}.aur-side{display:none}}

/* sidebar */
.aur-side{display:flex;flex-direction:column;gap:6px;padding:16px 12px;
  border-right:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);backdrop-filter:blur(12px)}
.aur-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 18px}
.aur-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-weight:800;color:#04120c;
  background:linear-gradient(135deg,#00E28E,#7C5CFF);box-shadow:0 6px 18px -6px rgba(124,92,255,.7)}
.aur-wordmark{font-size:18px;font-weight:700;letter-spacing:-.01em}
.aur-nav{display:flex;flex-direction:column;gap:3px;flex:1}
.aur-navitem{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:11px;
  color:#9AA6C0;font-size:14px;font-weight:500;text-decoration:none;transition:all .15s}
.aur-navitem svg{width:18px;height:18px;opacity:.85}
.aur-navitem:hover{background:rgba(255,255,255,.05);color:#E7ECF5}
.aur-navitem.is-active{color:#fff;background:linear-gradient(90deg,rgba(0,226,142,.22),rgba(0,194,122,.08));
  border:1px solid rgba(0,226,142,.38);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.aur-navitem.is-active svg{color:#3BE8A6;opacity:1}
.aur-userchip{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
.aur-userchip-txt{display:flex;flex-direction:column;line-height:1.25}
.aur-userchip-txt b{font-size:13px}.aur-userchip-txt small{font-size:11px;color:#8b97b3}

/* avatars */
.aur-av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700;color:#fff;flex:none}
.aur-av-sm{width:30px;height:30px;font-size:11px}

/* main */
.aur-main{padding:18px 22px 30px;min-width:0}
.aur-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.aur-kicker{margin:0;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7E8AA8;font-weight:600}
.aur-h1{margin:3px 0 0;font-size:23px;font-weight:800;letter-spacing:-.02em}
.aur-topright{display:flex;align-items:center;gap:12px}
.aur-search{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:11px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);color:#8b97b3}
.aur-search svg{width:16px;height:16px}
.aur-search input{background:transparent;border:0;outline:0;color:#E7ECF5;font-size:13px;width:130px}
.aur-search kbd{font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1)}
.aur-btn{border:0;cursor:pointer;font-weight:600;font-size:13px;color:#04120c;padding:9px 15px;border-radius:10px;
  background:linear-gradient(135deg,#00E28E,#12B981);box-shadow:0 8px 22px -8px rgba(0,226,142,.6);transition:transform .15s}
.aur-btn:hover{transform:translateY(-1px)}

/* glass card */
.aur-card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:14px;
  backdrop-filter:blur(14px);box-shadow:0 20px 50px -24px rgba(0,0,0,.7)}
.aur-card-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px 4px}
.aur-card-head h2{margin:0;font-size:15px;font-weight:700}
.aur-muted{color:#8b97b3;font-size:13px}

/* stats */
.aur-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
@media(max-width:900px){.aur-stats{grid-template-columns:repeat(2,1fr)}}
.aur-stat{position:relative;padding:12px 14px;overflow:hidden}
.aur-stat-label{margin:0;font-size:12px;color:#8b97b3;font-weight:500}
.aur-stat-value{margin:4px 0 2px;font-size:26px;font-weight:800;letter-spacing:-.02em;
  background:linear-gradient(90deg,#00E28E,#3BE3B0);-webkit-background-clip:text;background-clip:text;color:transparent}
.aur-stat-delta{margin:0;font-size:11.5px;color:#8b97b3}
.aur-stat-delta.is-up{color:#5EF2B0}.aur-stat-delta.is-warn{color:#FFB27A}
.aur-spark{position:absolute;right:14px;top:16px;width:64px;height:22px;opacity:.9}

/* columns */
.aur-cols{display:grid;grid-template-columns:1fr 300px;gap:12px}
@media(max-width:1040px){.aur-cols{grid-template-columns:1fr}}

/* table */
.aur-table{padding:6px 8px 12px}
.aur-tr{display:grid;grid-template-columns:1.6fr 1fr .9fr .6fr 1.3fr;align-items:center;gap:10px;
  padding:8px 10px;border-radius:10px}
.aur-tr:not(.aur-th):hover{background:rgba(255,255,255,.04)}
.aur-th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7E8AA8;font-weight:600}
.aur-person{display:flex;align-items:center;gap:10px;min-width:0}
.aur-person b{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aur-rating{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.aur-ratebar{width:46px;height:5px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}
.aur-ratebar i{display:block;height:100%;background:linear-gradient(90deg,#00C27A,#3BE3B0)}
.aur-tags{display:flex;flex-wrap:wrap;gap:5px}
.aur-tags em{font-style:normal;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:99px}

/* aside */
.aur-aside{padding-bottom:16px}
.aur-donut{display:block;width:150px;height:150px;margin:4px auto 0}
.aur-donut-num{fill:#fff;font-size:30px;font-weight:800}
.aur-donut-cap{fill:#8b97b3;font-size:11px}
.aur-legend{display:flex;flex-direction:column;gap:7px;padding:6px 20px 14px}
.aur-leg{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#c3cbdd}
.aur-leg i{width:10px;height:10px;border-radius:3px}
.aur-leg b{margin-left:auto;color:#fff}
.aur-pulse{border-top:1px solid rgba(255,255,255,.08);margin:0 16px;padding:14px 4px 4px}
.aur-pulsebars{display:flex;align-items:flex-end;gap:8px;height:56px;margin-top:10px}
.aur-pulsebars span{flex:1;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#00E28E,rgba(0,194,122,.35))}
`}</style>
  )
}
