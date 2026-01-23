import React from "react"
import { AppSidebar } from '@/components/app-sidebar';
import { Metadata } from 'next';
import { getDbUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'My Drive - DriveHub',
  description: 'Manage your documents and files',
};

export default async function DriveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Automatically sync the user to the database when they access protected routes
  // This ensures new users are created in the DB after signup
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
