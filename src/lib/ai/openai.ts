import OpenAI from "openai";
import { env } from "@/lib/env";

let openAIClient: OpenAI | undefined;

function getOpenAIClient(): OpenAI {
  if (!openAIClient) {
    openAIClient = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  return openAIClient;
}

export async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  const response = await getOpenAIClient().responses.create({
    model: env.openaiVisionModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Extract all readable text from this image. Preserve the reading order and meaningful line breaks. Return only the extracted text.",
          },
          {
            type: "input_image",
            image_url: `data:${mimeType};base64,${buffer.toString("base64")}`,
            detail: "auto",
          },
        ],
      },
    ],
  });

  return response.output_text.trim();
}
