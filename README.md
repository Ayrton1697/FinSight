This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Install the Python dependency used for PDF extraction before uploading PDFs:

```bash
python -m pip install -r requirements.txt
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## AI Configuration

Copy `.env.example` to `.env.local` and choose the RAG provider with `AI_PROVIDER`.

- `AI_PROVIDER=ollama` uses local Ollama models for embeddings and chat. The defaults are `bge-m3` for embeddings and `qwen3:8b` for answer generation.
- `AI_PROVIDER=openai` uses the OpenAI API for embeddings and chat. Keep `RAG_EMBEDDING_DIMENSIONS=1024` so the generated vectors stay compatible with the database schema.
- Image OCR still uses `OPENAI_VISION_MODEL`, so image uploads require `OPENAI_API_KEY` even when the RAG provider is set to Ollama.
- If you change embedding provider, embedding model, or `RAG_EMBEDDING_DIMENSIONS`, re-index existing uploaded files so all stored vectors stay in the same embedding space.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
