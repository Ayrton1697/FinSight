import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardContent } from "@/components/files/dashboard-content";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell title="Dashboard" email={user.email}>
      <DashboardContent />
    </AppShell>
  );
}
