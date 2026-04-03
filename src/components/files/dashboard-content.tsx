"use client";

import { useState } from "react";
import { DocumentList } from "@/components/files/document-list";
import { FileUploadForm } from "@/components/files/file-upload-form";

export function DashboardContent() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="dashboard-grid">
      <div className="card">
        <h2 className="section-title">Upload document</h2>
        <p style={{ marginBottom: 12, color: "var(--text-muted)", fontSize: 13 }}>
          PDF, CSV, or image files.
        </p>
        <FileUploadForm onUploadComplete={() => setRefreshKey((value) => value + 1)} />
      </div>

      <div className="card">
        <h2 className="section-title">Your files</h2>
        <DocumentList refreshKey={refreshKey} />
      </div>
    </div>
  );
}
