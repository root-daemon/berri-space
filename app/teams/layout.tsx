import React from "react"
import { AppSidebar } from '@/components/app-sidebar';
import { getDbUser } from '@/lib/auth';

export default async function TeamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Automatically sync the user to the database when they access protected routes
  await getDbUser();

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto flex flex-col animate-page-fade-in">
        {children}
      </main>
    </div>
  );
}
