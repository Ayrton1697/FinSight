// Use static `process.env.NEXT_PUBLIC_*` access only. Next.js inlines these at build
// time for the Edge middleware bundle; dynamic `process.env[key]` stays empty there.

function requireNonEmpty(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return requireNonEmpty(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey() {
    return requireNonEmpty(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  },
  get storageBucket() {
    return process.env.SUPABASE_STORAGE_BUCKET ?? "user-files";
  },
};
