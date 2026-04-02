import OpenAI from "openai";
import { env } from "@/lib/env";

type GenerateRagReplyParams = {
  question: string;
  context: string[];
};

type OllamaEmbedResponse = {
  embedding?: number[];
  embeddings?: number[][];
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

let openAIClient: OpenAI | undefined;

function getOpenAIClient(): OpenAI {
  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  return openAIClient;
}

function getOllamaUrl(path: string): string {
  return new URL(path, env.ollamaBaseUrl).toString();
}

function validateEmbeddingCount(texts: string[], embeddings: number[][]): number[][] {
  if (embeddings.length !== texts.length) {
    throw new Error("Embedding generation returned an unexpected number of vectors");
  }

  for (const embedding of embeddings) {
    if (embedding.length !== env.ragEmbeddingDimensions) {
      throw new Error(
        `Embedding vector dimension mismatch: expected ${env.ragEmbeddingDimensions}, received ${embedding.length}`,
      );
    }
  }

  return embeddings;
}

function buildRagSystemPrompt(): string {
  return [
    "You are a finance-focused retrieval-augmented assistant.",
    "Answer the user using the retrieved context when it is relevant.",
    "If the context is missing or insufficient, say so clearly instead of inventing facts.",
    "Cite the most relevant sources by file name when possible.",
    "Keep the response concise and practical.",
  ].join(" ");
}

export function buildRagUserPrompt(question: string, context: string[]): string {
  const formattedContext = context.length
    ? context.map((item, index) => `[${index + 1}] ${item}`).join("\n\n")
    : "No uploaded document context found.";

  return [`Question:`, question, "", `Retrieved context:`, formattedContext].join("\n");
}

export function sanitizeModelText(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/gi, "").trim();
}

async function createOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await getOpenAIClient().embeddings.create({
    model: env.openaiEmbeddingModel,
    input: texts,
    dimensions: env.ragEmbeddingDimensions,
  });

  return validateEmbeddingCount(
    texts,
    response.data.sort((left, right) => left.index - right.index).map((item) => item.embedding),
  );
}

async function createOllamaEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch(getOllamaUrl("/api/embed"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.ollamaEmbeddingModel,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OllamaEmbedResponse;
  const embeddings = Array.isArray(payload.embeddings)
    ? payload.embeddings
    : Array.isArray(payload.embedding)
      ? [payload.embedding]
      : null;

  if (!embeddings) {
    throw new Error("Ollama embedding response did not include embeddings");
  }

  return validateEmbeddingCount(texts, embeddings);
}

async function generateOpenAIReply({ question, context }: GenerateRagReplyParams): Promise<string> {
  const response = await getOpenAIClient().responses.create({
    model: env.openaiChatModel,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildRagSystemPrompt(),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildRagUserPrompt(question, context),
          },
        ],
      },
    ],
  });

  const text = sanitizeModelText(response.output_text);
  if (!text) {
    throw new Error("OpenAI chat response did not include assistant text");
  }

  return text;
}

async function generateOllamaReply({ question, context }: GenerateRagReplyParams): Promise<string> {
  const response = await fetch(getOllamaUrl("/api/chat"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.ollamaChatModel,
      stream: false,
      messages: [
        {
          role: "system",
          content: buildRagSystemPrompt(),
        },
        {
          role: "user",
          content: buildRagUserPrompt(question, context),
        },
      ],
      options: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama chat request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OllamaChatResponse;
  const text = payload.message?.content?.trim();
  if (!text) {
    throw new Error("Ollama chat response did not include assistant text");
  }

  const sanitizedText = sanitizeModelText(text);
  if (!sanitizedText) {
    throw new Error("Ollama chat response did not include assistant text");
  }

  return sanitizedText;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts.length) {
    return [];
  }

  if (env.aiProvider === "ollama") {
    return createOllamaEmbeddings(texts);
  }

  return createOpenAIEmbeddings(texts);
}

export async function generateRagReply(params: GenerateRagReplyParams): Promise<string> {
  if (env.aiProvider === "ollama") {
    return generateOllamaReply(params);
  }

  return generateOpenAIReply(params);
}
