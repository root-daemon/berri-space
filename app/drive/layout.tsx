import React from "react"
import { AppSidebar } from '@/components/app-sidebar';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Drive - DriveHub',
  description: 'Manage your documents and files',
};

export default function DriveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto flex flex-col animate-page-fade-in">
        {children}
      </main>
    </div>
  );
}
