import { NextResponse } from "next/server";
import { isAllowedUploadFile } from "@/lib/files/allowed-upload";
import { env } from "@/lib/env";
import { processUploadForIndexing } from "@/lib/rag/process-upload";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\-]/g, "_");
}

export function buildStoragePath(userId: string, fileName: string): string {
  return `${userId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received" }, { status: 400 });
  }

  if (!isAllowedUploadFile(file)) {
    return NextResponse.json(
      { error: "Only PDF, CSV, and image files are allowed" },
      { status: 400 },
    );
  }

  const storagePath = buildStoragePath(user.id, file.name);
  const bucket = env.storageBucket;
  let uploadedToStorage = false;
  let fileId: string | null = null;

  try {
    const indexedUpload = await processUploadForIndexing(file);

    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    uploadedToStorage = true;

    const { data: insertedFile, error: insertFileError } = await supabase
      .from("files")
      .insert({
        user_id: user.id,
        name: file.name,
        title: indexedUpload.title,
        storage_path: storagePath,
        size: file.size,
        mime_type: file.type || null,
        metadata: indexedUpload.fileMetadata,
      })
      .select("id")
      .single();

    if (insertFileError || !insertedFile) {
      throw new Error(insertFileError?.message ?? "Failed to save file metadata");
    }

    fileId = insertedFile.id;

    const { error: insertChunkError } = await supabase.from("file_chunks").insert(
      indexedUpload.chunks.map((chunk, index) => ({
        file_id: fileId,
        user_id: user.id,
        chunk_index: index,
        content: chunk.content,
        metadata: chunk.metadata,
        page_number:
          typeof chunk.metadata.pageNumber === "number" ? chunk.metadata.pageNumber : null,
        embedding: indexedUpload.embeddings[index],
      })),
    );

    if (insertChunkError) {
      throw new Error(insertChunkError.message);
    }

    return NextResponse.json({ success: true, chunkCount: indexedUpload.chunks.length });
  } catch (error) {
    if (fileId) {
      await supabase.from("files").delete().eq("id", fileId);
    }
    if (uploadedToStorage) {
      await supabase.storage.from(bucket).remove([storagePath]);
    }

    const message = error instanceof Error ? error.message : "Failed to process file";
    const status = message.includes("No text could be extracted") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
