"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClientSupabaseClient();
    const nextPath = searchParams.get("next") || "/dashboard";

    const authAction = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });

    const { error: authError } = await authAction;

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <div className="login-bg">
      <form onSubmit={handleSubmit} className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 12L5.5 6L9 9.5L11.5 5.5L14 12"
                stroke="#fafafa"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="login-brand-name">FinRAG</span>
        </div>

        <h1 className="login-title">
          {isSignUp ? "Create account" : "Welcome back"}
        </h1>
        <p className="login-subtitle">
          {isSignUp
            ? "Sign up to start analyzing your financial documents."
            : "Sign in to access your dashboard and chat."}
        </p>

        <div className="form-group">
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary btn-lg btn-full"
          style={{ marginTop: 6 }}
        >
          {isLoading
            ? "Please wait..."
            : isSignUp
            ? "Create account"
            : "Sign in"}
        </button>

        <div className="form-divider" />

        <button
          type="button"
          onClick={() => {
            setIsSignUp((prev) => !prev);
            setError(null);
          }}
          className="btn btn-ghost btn-full"
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "Don't have an account? Sign up"}
        </button>
      </form>
    </div>
  );
}
