"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ChatInterfaceProps = {
  initialThreadId: string | null;
  initialMessages: ChatMessage[];
};

export function ChatInterface({ initialThreadId, initialMessages }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: draft, threadId }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to send message");
      setIsLoading(false);
      return;
    }

    const body = (await response.json()) as {
      threadId: string;
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
    };
    setThreadId(body.threadId);
    setMessages((prev) => [...prev, body.userMessage, body.assistantMessage]);
    setDraft("");
    setIsLoading(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="chat-container">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
              >
                <rect width="32" height="32" rx="8" fill="#f4f4f5" />
                <path
                  d="M9 20L13 12L17 16.5L20.5 11L23 20"
                  stroke="#a1a1aa"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Ask anything about your uploaded documents
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`msg ${message.role === "user" ? "msg-user" : "msg-assistant"}`}
              >
                <div
                  className={`msg-bubble ${
                    message.role === "user" ? "msg-bubble-user" : "msg-bubble-assistant"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="msg msg-assistant">
              <div className="msg-bubble msg-bubble-assistant" style={{ color: "var(--text-dim)" }}>
                Thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          {error && <p className="error-msg" style={{ marginBottom: 10 }}>{error}</p>}
          <form onSubmit={sendMessage} className="chat-input-row">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your documents… (Enter to send)"
              rows={1}
              className="chat-textarea"
            />
            <button
              type="submit"
              disabled={isLoading || !draft.trim()}
              className="btn btn-primary chat-send-btn"
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M14 8L2 2l2.5 6L2 14l12-6z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
