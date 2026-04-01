import Link from "next/link";

type AppShellProps = {
  title: string;
  email?: string | null;
  children: React.ReactNode;
};

export function AppShell({ email, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-brand">
            <span className="app-brand-icon">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M1.5 10.5L4.5 5.5L7.5 8L10 4.5L12.5 10.5"
                  stroke="#fafafa"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            FinRAG
          </span>
          <nav className="app-nav">
            <Link href="/dashboard" className="nav-link">
              Dashboard
            </Link>
            <Link href="/chat" className="nav-link">
              Chat
            </Link>
          </nav>
        </div>
        <div className="app-header-right">
          {email && <span className="user-email">{email}</span>}
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
