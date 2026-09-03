import Head from 'next/head'
import Link from 'next/link'

export default function Home() {
  return (
    <>
      <Head>
        <title>RecoverFlow AI — Intelligent Checkout Recovery</title>
        <meta name="description" content="AI-powered checkout recovery intelligence for payment failures and cart abandonment." />
      </Head>

      <main className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
        {/* Navigation */}
        <nav className="bg-white sticky top-0 z-10" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: '#2563EB' }}>
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M12 3L4 8v9l8 4 8-4V8L12 3z" fill="white" fillOpacity="0.9" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold leading-none" style={{ color: '#0F172A' }}>RecoverFlow AI</p>
                <p className="text-xs leading-none mt-0.5" style={{ color: '#94A3B8' }}>Intelligent Checkout Recovery</p>
              </div>
            </div>

            <div />
          </div>
        </nav>

        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <div className="flex flex-col items-center">
            <div className="max-w-2xl">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: '#2563EB' }}>
                Payment Intelligence Platform
              </p>

              <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight" style={{ color: '#0F172A' }}>
                Turn Failed Checkouts Into{' '}
                <br className="hidden md:block" />
                <span style={{ color: '#2563EB' }}>Recovered Revenue.</span>
              </h1>

              <p className="mt-6 text-lg leading-8 mx-auto" style={{ color: '#475569' }}>
                RecoverFlow AI analyzes abandoned and failed checkout events, predicts recovery probability, and recommends the most effective action for each customer — automatically.
              </p>

              <div className="mt-8 flex justify-center">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-lg px-8 py-3.5 font-medium text-white transition-colors text-lg"
                  style={{ backgroundColor: '#2563EB' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1E4FA8')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563EB')}
                >
                  View Recovery Dashboard
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section style={{ borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  ),
                  title: 'Risk Detection',
                  desc: 'Identify failed and abandoned checkout sessions with the highest potential for revenue recovery.',
                  bg: '#EFF6FF',
                  color: '#2563EB',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  ),
                  title: 'AI Recommendations',
                  desc: 'Generate targeted recovery actions using a hybrid rule-based and ML-assisted decision engine.',
                  bg: '#EEF2FF',
                  color: '#4F46E5',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  title: 'Revenue Recovery',
                  desc: 'Estimate recoverable revenue and prioritize opportunities with the highest expected business impact.',
                  bg: '#ECFEFF',
                  color: '#0891B2',
                },
              ].map(({ icon, title, desc, bg, color }) => (
                <div key={title} className="rounded-xl p-6" style={{ border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                  <div className="mb-4 w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg, color: color }}>
                    {icon}
                  </div>
                  <h3 className="text-base font-semibold mb-2" style={{ color: '#0F172A' }}>{title}</h3>
                  <p className="text-sm leading-6" style={{ color: '#64748B' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#2563EB' }}>
              How It Works
            </p>
            <h2 className="text-3xl font-bold" style={{ color: '#0F172A' }}>
              From checkout failure to intelligent recovery.
            </h2>
            <p className="mt-3 text-base" style={{ color: '#64748B' }}>
              Three focused steps to turn lost transactions into recovered revenue.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Analyze Checkout Events',
                desc: 'Payment and checkout events are analyzed to identify abandoned and failed transactions with recovery potential.',
              },
              {
                step: '02',
                title: 'Generate Recovery Decisions',
                desc: 'The hybrid engine — rule-based policy plus ML scoring — recommends the best action based on customer and payment context.',
              },
              {
                step: '03',
                title: 'Prioritize Revenue Opportunities',
                desc: 'Cases are ranked by expected recoverable revenue so teams can focus where business impact is highest.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step}>
                <div className="mb-4 text-2xl font-bold" style={{ color: '#BFDBFE', fontVariantNumeric: 'tabular-nums' }}>{step}</div>
                <div className="w-px h-4 mb-4" style={{ backgroundColor: '#BFDBFE', marginLeft: '1px' }} />
                <h3 className="font-semibold mb-2" style={{ color: '#0F172A' }}>{title}</h3>
                <p className="text-sm leading-6" style={{ color: '#64748B' }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer strip */}
        <footer className="border-t" style={{ borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }}>
          <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs" style={{ color: '#94A3B8' }}>RecoverFlow AI — Payment Intelligence Platform</p>
            <Link
              href="/dashboard"
              className="text-sm font-medium transition-colors"
              style={{ color: '#2B63C6' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#1E4FA8')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#2B63C6')}
            >
              View Recovery Dashboard →
            </Link>
          </div>
        </footer>
      </main>
    </>
  )
}