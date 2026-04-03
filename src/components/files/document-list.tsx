"use client";

import { useEffect, useState } from "react";
import { fetchBackendJson } from "@/lib/backend/client";

type DocumentRecord = {
  id: string;
  name: string;
  size: number;
  mime_type: string | null;
  created_at: string;
};

type DocumentListResponse = {
  documents: DocumentRecord[];
};

type DocumentDownloadResponse = {
  downloadUrl: string;
};

type DocumentListProps = {
  refreshKey: number;
};

export function DocumentList({ refreshKey }: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDocuments() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchBackendJson<DocumentListResponse>("/get");
        if (!isCancelled) {
          setDocuments(response.documents);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load documents");
          setDocuments([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDocuments();

    return () => {
      isCancelled = true;
    };
  }, [refreshKey]);

  async function downloadDocument(documentId: string) {
    setDownloadingId(documentId);
    setError(null);

    try {
      const response = await fetchBackendJson<DocumentDownloadResponse>(`/get/${documentId}`);
      window.location.assign(response.downloadUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  if (isLoading) {
    return <div className="empty-state">Loading documents...</div>;
  }

  if (error) {
    return <p className="error-msg">{error}</p>;
  }

  if (!documents.length) {
    return <div className="empty-state">No files uploaded yet.</div>;
  }

  return (
    <table className="files-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Size</th>
          <th>Uploaded</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((document) => (
          <tr key={document.id}>
            <td>{document.name}</td>
            <td>{document.mime_type ?? "unknown"}</td>
            <td>{Math.round(document.size / 1024)} KB</td>
            <td>{new Date(document.created_at).toLocaleString()}</td>
            <td>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={downloadingId === document.id}
                onClick={() => void downloadDocument(document.id)}
              >
                {downloadingId === document.id ? "Preparing..." : "Download"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
