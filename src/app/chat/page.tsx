import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ChatInterface } from "@/components/chat/chat-interface";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export default async function ChatPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: messages } = thread
    ? await supabase
        .from("chat_messages")
        .select("id,role,content,created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
    : { data: [] as ChatMessage[] };

  return (
    <AppShell title="Chat" email={user.email}>
      <ChatInterface initialThreadId={thread?.id ?? null} initialMessages={(messages as ChatMessage[]) ?? []} />
    </AppShell>
  );
}
