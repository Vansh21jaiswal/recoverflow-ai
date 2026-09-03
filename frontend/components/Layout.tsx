import Head from 'next/head'
import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      <Head>
        <title>RecoverFlow AI</title>
      </Head>
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderColor: '#E2E8F0' }}>
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-6 h-6 rounded" style={{ backgroundColor: '#2563EB' }}>
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 p-1">
                  <path d="M12 2L4 7v10l8 5 8-5V7L12 2z" fill="white" fillOpacity="0.9" />
                </svg>
              </div>
              <span className="text-sm font-bold" style={{ color: '#0F172A' }}>RecoverFlow AI</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#16A34A' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: '#16A34A' }} />
              Live
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-6">{children}</main>
    </div>
  )
}
