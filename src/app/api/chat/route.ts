import { z } from "zod";
import { NextResponse } from "next/server";
import { generateRagReply } from "@/lib/ai/rag";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { retrieveContext } from "@/lib/rag/retrieve-context";

const payloadSchema = z.object({
  message: z.string().min(1).max(5000),
  threadId: z.string().uuid().nullable().optional(),
});

const CHAT_LOG_PREFIX = "[api/chat]";
const MAX_PREVIEW_LENGTH = 120;

function getMessagePreview(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PREVIEW_LENGTH)}...`;
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  console.log(`${CHAT_LOG_PREFIX} request received`);

  const supabase = await createServerSupabaseClient();
  console.log(`${CHAT_LOG_PREFIX} supabase client created`);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn(`${CHAT_LOG_PREFIX} unauthorized request`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`${CHAT_LOG_PREFIX} user authenticated`, { userId: user.id });

  const json = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    console.warn(`${CHAT_LOG_PREFIX} invalid payload`, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let threadId = parsed.data.threadId ?? null;
  console.log(`${CHAT_LOG_PREFIX} payload parsed`, {
    hasThreadId: Boolean(threadId),
    messageLength: parsed.data.message.length,
    messagePreview: getMessagePreview(parsed.data.message),
  });

  if (threadId) {
    console.log(`${CHAT_LOG_PREFIX} validating existing thread`, { threadId });
    const { data: existingThread } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existingThread) {
      console.warn(`${CHAT_LOG_PREFIX} thread not found`, { threadId, userId: user.id });
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    console.log(`${CHAT_LOG_PREFIX} existing thread verified`, { threadId });
  } else {
    console.log(`${CHAT_LOG_PREFIX} creating new thread`);
    const { data: createdThread, error: createThreadError } = await supabase
      .from("chat_threads")
      .insert({
        user_id: user.id,
        title: parsed.data.message.slice(0, 60),
      })
      .select("id")
      .single();

    if (createThreadError || !createdThread) {
      console.error(`${CHAT_LOG_PREFIX} failed to create thread`, {
        error: createThreadError?.message ?? "Unknown thread creation error",
      });
      return NextResponse.json({ error: createThreadError?.message ?? "Failed to create thread" }, { status: 500 });
    }

    threadId = createdThread.id;
    console.log(`${CHAT_LOG_PREFIX} new thread created`, { threadId });
  }

  console.log(`${CHAT_LOG_PREFIX} storing user message`, { threadId, userId: user.id });
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
    console.error(`${CHAT_LOG_PREFIX} failed to store user message`, {
      threadId,
      error: userMessageError?.message ?? "Unknown user message error",
    });
    return NextResponse.json({ error: userMessageError?.message ?? "Failed to store message" }, { status: 500 });
  }

  console.log(`${CHAT_LOG_PREFIX} user message stored`, {
    threadId,
    userMessageId: userMessage.id,
  });

  console.log(`${CHAT_LOG_PREFIX} retrieving document context`, { threadId });
  const context = await retrieveContext({ supabase, userId: user.id, query: parsed.data.message });
  console.log(`${CHAT_LOG_PREFIX} document context retrieved`, {
    threadId,
    contextCount: context.length,
  });

  console.log(`${CHAT_LOG_PREFIX} generating assistant reply`, { threadId });
  const assistantText = await generateRagReply({
    question: parsed.data.message,
    context,
  });
  console.log(`${CHAT_LOG_PREFIX} assistant reply generated`, {
    threadId,
    responseLength: assistantText.length,
    responsePreview: getMessagePreview(assistantText),
  });

  console.log(`${CHAT_LOG_PREFIX} storing assistant message`, { threadId });
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
    console.error(`${CHAT_LOG_PREFIX} failed to store assistant message`, {
      threadId,
      error: assistantError?.message ?? "Unknown assistant message error",
    });
    return NextResponse.json({ error: assistantError?.message ?? "Failed to generate response" }, { status: 500 });
  }

  console.log(`${CHAT_LOG_PREFIX} assistant message stored`, {
    threadId,
    assistantMessageId: assistantMessage.id,
  });

  console.log(`${CHAT_LOG_PREFIX} request completed`, {
    threadId,
    durationMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    threadId,
    userMessage,
    assistantMessage,
  });
}
