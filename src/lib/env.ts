// Use static `process.env.NEXT_PUBLIC_*` access only. Next.js inlines these at build
// time for the Edge middleware bundle; dynamic `process.env[key]` stays empty there.

function requireNonEmpty(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return normalized;
}

function parseEnumValue<T extends readonly string[]>(
  name: string,
  value: string | undefined,
  allowedValues: T,
  fallback: T[number],
): T[number] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if ((allowedValues as readonly string[]).includes(normalized)) {
    return normalized as T[number];
  }

  throw new Error(
    `Invalid ${name}: expected one of ${allowedValues.join(", ")}, received "${value}"`,
  );
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, received "${value}"`);
  }

  return parsed;
}

const AI_PROVIDERS = ["openai", "ollama"] as const;

export const env = {
  get backendBaseUrl() {
    return process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://127.0.0.1:5000";
  },
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
  get aiProvider() {
    return parseEnumValue("AI_PROVIDER", process.env.AI_PROVIDER, AI_PROVIDERS, "openai");
  },
  get ragEmbeddingDimensions() {
    return parsePositiveInteger("RAG_EMBEDDING_DIMENSIONS", process.env.RAG_EMBEDDING_DIMENSIONS, 1024);
  },
  get openaiApiKey() {
    return requireNonEmpty("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  },
  get openaiEmbeddingModel() {
    return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  },
  get openaiChatModel() {
    return process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini";
  },
  get openaiVisionModel() {
    return process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini";
  },
  get ollamaBaseUrl() {
    return process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  },
  get ollamaEmbeddingModel() {
    return process.env.OLLAMA_EMBEDDING_MODEL?.trim() || "bge-m3";
  },
  get ollamaChatModel() {
    return process.env.OLLAMA_CHAT_MODEL?.trim() || "qwen3:8b";
  },
};
