"use client";

import { env } from "@/lib/env";
import { createClientSupabaseClient } from "@/lib/supabase/client";

function getBackendUrl(path: string): string {
  const baseUrl = env.backendBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function getAccessToken(): Promise<string> {
  const supabase = createClientSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    throw new Error("You must be signed in to continue");
  }

  return token;
}

export async function fetchBackend(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(getBackendUrl(path), {
    ...init,
    headers,
  });
}

export async function fetchBackendJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchBackend(path, init);
  const body = (await response.json().catch(() => null)) as { error?: string } | T | null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Request failed";
    throw new Error(message);
  }

  return body as T;
}
