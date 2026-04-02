import Link from "next/link";
import { FinSightLogo } from "@/components/branding/fin-sight-logo";

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
              <FinSightLogo size={14} strokeWidth={1.5} />
            </span>
            FinSight
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
