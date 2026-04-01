"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ALLOWED_FILE_ACCEPT } from "@/lib/files/allowed-upload";

export function FileUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const payload = new FormData();
    payload.append("file", file);

    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Upload failed");
      setIsUploading(false);
      return;
    }

    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    setIsUploading(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="upload-row">
        <label htmlFor="file-input" className="file-input-label">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 1v8M4 4l3-3 3 3M2 10.5v1A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5v-1"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Choose file
        </label>
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          required
          accept={ALLOWED_FILE_ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
        {file && <span className="file-name">{file.name}</span>}
        <button
          type="submit"
          disabled={isUploading || !file}
          className="btn btn-primary"
        >
          {isUploading ? "Uploading..." : "Upload"}
        </button>
      </div>
      {error && <p className="error-msg" style={{ marginTop: 10 }}>{error}</p>}
    </form>
  );
}
