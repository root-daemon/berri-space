import React from "react"
import { AppSidebar } from '@/components/app-sidebar';
import { getDbUser } from '@/lib/auth';

export default async function TeamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Automatically sync the user to the database when they access protected routes
  // This ensures new users are created in the DB after signup
  try {
    await getDbUser();
  } catch (error) {
    // Log errors instead of silently failing
    // getDbUser() catches AuthenticationError and returns null, so any error here is unexpected
    if (error instanceof Error) {
      console.error("[TeamsLayout] Error syncing user to database:", {
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.error("[TeamsLayout] Unknown error syncing user to database:", error);
    }
    // Re-throw to surface unexpected errors
    throw error;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto flex flex-col animate-page-fade-in">
        {children}
      </main>
    </div>
  );
}
