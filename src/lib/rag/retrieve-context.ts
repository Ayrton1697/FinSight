import type { SupabaseClient } from "@supabase/supabase-js";

type RetrieveContextParams = {
  supabase: SupabaseClient;
  userId: string;
  query: string;
};

export async function retrieveContext({ supabase, userId, query }: RetrieveContextParams): Promise<string[]> {
  const { data: files } = await supabase
    .from("files")
    .select("name,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!files?.length) {
    return ["No uploaded documents yet."];
  }

  return files.map((file) => `Potential source: ${file.name} (query: ${query})`);
}
