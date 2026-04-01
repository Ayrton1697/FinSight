import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { FileUploadForm } from "@/components/files/file-upload-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type FileRow = {
  id: string;
  name: string;
  size: number;
  mime_type: string | null;
  created_at: string;
};

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: files } = await supabase
    .from("files")
    .select("id,name,size,mime_type,created_at")
    .order("created_at", { ascending: false });

  return (
    <AppShell title="Dashboard" email={user.email}>
      <div className="dashboard-grid">
        <div className="card">
          <h2 className="section-title">Upload document</h2>
          <FileUploadForm />
        </div>

        <div className="card">
          <h2 className="section-title">Your files</h2>
          {!files?.length ? (
            <div className="empty-state">No files uploaded yet.</div>
          ) : (
            <table className="files-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {(files as FileRow[]).map((file) => (
                  <tr key={file.id}>
                    <td>{file.name}</td>
                    <td>{file.mime_type ?? "unknown"}</td>
                    <td>{Math.round(file.size / 1024)} KB</td>
                    <td>{new Date(file.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
