import { z } from "zod";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { retrieveContext } from "@/lib/rag/retrieve-context";

const payloadSchema = z.object({
  message: z.string().min(1).max(5000),
  threadId: z.string().uuid().nullable().optional(),
});

export function buildAssistantReply(context: string[]): string {
  return `RAG placeholder response. I found ${context.length} context item(s): ${context.join(" | ")}`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let threadId = parsed.data.threadId ?? null;

  if (threadId) {
    const { data: existingThread } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existingThread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
  } else {
    const { data: createdThread, error: createThreadError } = await supabase
      .from("chat_threads")
      .insert({
        user_id: user.id,
        title: parsed.data.message.slice(0, 60),
      })
      .select("id")
      .single();

    if (createThreadError || !createdThread) {
      return NextResponse.json({ error: createThreadError?.message ?? "Failed to create thread" }, { status: 500 });
    }

    threadId = createdThread.id;
  }

  const { data: userMessage, error: userMessageError } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      user_id: user.id,
      role: "user",
      content: parsed.data.message,
    })
    .select("id,role,content,created_at")
    .single();

  if (userMessageError || !userMessage) {
    return NextResponse.json({ error: userMessageError?.message ?? "Failed to store message" }, { status: 500 });
  }

  const context = await retrieveContext({ supabase, userId: user.id, query: parsed.data.message });
  const assistantText = buildAssistantReply(context);

  const { data: assistantMessage, error: assistantError } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      user_id: user.id,
      role: "assistant",
      content: assistantText,
    })
    .select("id,role,content,created_at")
    .single();

  if (assistantError || !assistantMessage) {
    return NextResponse.json({ error: assistantError?.message ?? "Failed to generate response" }, { status: 500 });
  }

  return NextResponse.json({
    threadId,
    userMessage,
    assistantMessage,
  });
}
