import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmbeddings } from "@/lib/ai/rag";

type RetrieveContextParams = {
  supabase: SupabaseClient;
  userId: string;
  query: string;
};

const CHAT_CONTEXT_LOG_PREFIX = "[api/chat][context]";

type MatchedChunk = {
  file_name: string;
  file_title: string | null;
  chunk_index: number;
  page_number: number | null;
  content: string;
  file_metadata: {
    sourceType?: string;
    columnNames?: string[];
  } | null;
  chunk_metadata: {
    rowStart?: number;
    rowEnd?: number;
    pageLabel?: string | null;
  } | null;
  similarity: number;
};

export async function retrieveContext({ supabase, userId, query }: RetrieveContextParams): Promise<string[]> {
  const startedAt = Date.now();

  console.log(`${CHAT_CONTEXT_LOG_PREFIX} generating query embedding`, {
    userId,
    queryLength: query.length,
  });
  const [queryEmbedding] = await createEmbeddings([query]);
  console.log(`${CHAT_CONTEXT_LOG_PREFIX} query embedding generated`, {
    userId,
    dimensions: queryEmbedding?.length ?? 0,
  });

  console.log(`${CHAT_CONTEXT_LOG_PREFIX} running chunk match query`, {
    userId,
    matchCount: 6,
  });
  const { data: matches, error } = await supabase.rpc("match_file_chunks", {
    query_embedding: queryEmbedding,
    match_user_id: userId,
    match_count: 6,
  });

  if (error) {
    console.error(`${CHAT_CONTEXT_LOG_PREFIX} chunk match query failed`, {
      userId,
      error: error.message,
    });
    throw new Error(`Failed to retrieve document context: ${error.message}`);
  }

  if (!matches?.length) {
    console.log(`${CHAT_CONTEXT_LOG_PREFIX} no matching chunks found`, {
      userId,
      durationMs: Date.now() - startedAt,
    });
    return ["No uploaded document context found."];
  }

  console.log(`${CHAT_CONTEXT_LOG_PREFIX} matching chunks retrieved`, {
    userId,
    matchCount: matches.length,
    durationMs: Date.now() - startedAt,
  });

  return (matches as MatchedChunk[]).map((match) => {
    const sourceName = match.file_title || match.file_name;
    const details = [
      `chunk ${match.chunk_index + 1}`,
      typeof match.page_number === "number" ? `page ${match.page_number}` : null,
      typeof match.chunk_metadata?.pageLabel === "string" && match.chunk_metadata.pageLabel
        ? `label ${match.chunk_metadata.pageLabel}`
        : null,
      typeof match.chunk_metadata?.rowStart === "number" && typeof match.chunk_metadata?.rowEnd === "number"
        ? `rows ${match.chunk_metadata.rowStart}-${match.chunk_metadata.rowEnd}`
        : null,
      Array.isArray(match.file_metadata?.columnNames) && match.file_metadata.columnNames.length
        ? `columns ${match.file_metadata.columnNames.slice(0, 6).join(", ")}`
        : null,
      `score ${Number(match.similarity).toFixed(3)}`,
    ].filter((value): value is string => Boolean(value));

    return `Source: ${sourceName} (${details.join(", ")}): ${match.content}`;
  });
}
