'use client';

import { useState } from 'react';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Bell, Lock, LogOut, Moon, Sun, Monitor } from 'lucide-react';

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const [theme, setTheme] = useState('system');
  const [emailNotifications, setEmailNotifications] = useState(true);

  // Format the account creation date
  const formatDate = (date: Date | undefined) => {
    if (!date) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Settings' }]} />

      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-500 text-foreground tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground mt-2 font-400">
              Manage your account and preferences
            </p>
          </div>

          {/* Profile Section */}
          <div className="space-y-8">
            {/* Profile Information */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-500 text-foreground">Profile Information</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Name</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {isLoaded ? (user?.fullName || 'Not set') : 'Loading...'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => user?.update && window.open('https://accounts.clerk.dev/user', '_blank')}
                  >
                    Edit
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Email</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {isLoaded ? (user?.primaryEmailAddress?.emailAddress || 'Not set') : 'Loading...'}
                    </p>
                  </div>
                  {user?.primaryEmailAddress?.verification?.status === 'verified' ? (
                    <Badge className="bg-green-500/10 text-green-700 border-0 text-xs font-400">
                      Verified
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-500/10 text-yellow-700 border-0 text-xs font-400">
                      Unverified
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-500 text-foreground">Account Created</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {isLoaded ? formatDate(user?.createdAt ? new Date(user.createdAt) : undefined) : 'Loading...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <h2 className="text-lg font-500 text-foreground mb-6 flex items-center gap-3">
                <Sun className="w-5 h-5 text-primary" />
                Appearance
              </h2>

              <div>
                <p className="text-sm font-500 text-foreground mb-3">Theme</p>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="border-border/20 hover:border-primary/30 transition-colors duration-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4" />
                        Light
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <Moon className="w-4 h-4" />
                        Dark
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4" />
                        System
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-500 text-foreground">Notifications</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Email Notifications</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Receive updates about shared documents
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEmailNotifications(!emailNotifications)}
                    className={`border-border/20 font-400 text-xs transition-all duration-200 ${
                      emailNotifications
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {emailNotifications ? 'On' : 'Off'}
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-500 text-foreground">AI Insights</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Get notified when AI finds important information
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-primary/10 text-primary border-primary/20"
                  >
                    On
                  </Button>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="bg-card rounded-xl border border-border/20 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-500 text-foreground">Security</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Password</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Manage your password
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => window.open('https://accounts.clerk.dev/user/security', '_blank')}
                  >
                    Change
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-border/20">
                  <div>
                    <p className="text-sm font-500 text-foreground">Active Sessions</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      Manage your active sessions
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => window.open('https://accounts.clerk.dev/user/security', '_blank')}
                  >
                    Manage
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-500 text-foreground">Two-Factor Auth</p>
                    <p className="text-xs text-muted-foreground mt-1 font-400">
                      {user?.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/20 hover:bg-muted/50 transition-all duration-200 font-400 text-xs bg-transparent"
                    onClick={() => window.open('https://accounts.clerk.dev/user/security', '_blank')}
                  >
                    {user?.twoFactorEnabled ? 'Manage' : 'Enable'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Sign Out */}
            <SignOutButton redirectUrl="/">
              <Button
                variant="outline"
                className="w-full border-destructive/30 hover:bg-destructive/10 text-destructive transition-all duration-200 font-400 gap-2 bg-transparent"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </SignOutButton>
          </div>
        </div>
      </div>
    </>
  );
}
