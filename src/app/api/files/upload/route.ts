import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  const storagePath = buildStoragePath(user.id, file.name);
  const bucket = env.storageBucket;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("files").insert({
    user_id: user.id,
    name: file.name,
    storage_path: storagePath,
    size: file.size,
    mime_type: file.type || null,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
