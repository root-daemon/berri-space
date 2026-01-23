'use client';

import React from "react"

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Cloud,
  Lock,
  Share2,
  Zap,
  ArrowRight,
  CheckCircle,
  Users,
} from 'lucide-react';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background animate-page-fade-in">
      {/* Header */}
      <header className="bg-background border-b border-border/20 sticky top-0 z-50 backdrop-blur-sm bg-background/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
              <span className="text-primary-foreground font-bold text-lg">D</span>
            </div>
            <span className="text-lg font-500 text-foreground">DriveHub</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/signin"
              className="text-foreground hover:text-primary transition-colors duration-200 font-400"
            >
              Sign In
            </Link>
            <Button
              onClick={() => router.push('/auth/signup')}
              className="bg-primary hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg font-400"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-20 lg:py-32">
          <div className="text-center space-y-8">
            <h1 className="text-5xl lg:text-6xl font-500 text-foreground leading-tight text-balance tracking-tight">
              Modern Document Management for Teams
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty font-400">
              Organize, collaborate, and secure your documents with enterprise-grade controls and AI-powered insights.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Button
                size="lg"
                onClick={() => router.push('/auth/signup')}
                className="bg-primary hover:bg-primary/90 gap-2 transition-all duration-200 shadow-md hover:shadow-lg font-400"
              >
                Start Free <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" className="border-border/40 hover:bg-muted/50 transition-all duration-200 font-400 bg-transparent">
                Watch Demo
              </Button>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="mt-16 rounded-2xl bg-gradient-to-b from-primary/8 to-background border border-primary/15 p-1 overflow-hidden shadow-lg">
            <div className="bg-background rounded-xl p-8 lg:p-12">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-3">
                  <div className="h-12 bg-primary/8 rounded-lg" />
                  <div className="h-4 bg-muted/40 rounded" />
                  <div className="h-4 bg-muted/40 rounded w-4/5" />
                </div>
                <div className="space-y-3">
                  <div className="h-12 bg-primary/8 rounded-lg" />
                  <div className="h-4 bg-muted/40 rounded" />
                  <div className="h-4 bg-muted/40 rounded w-3/5" />
                </div>
                <div className="space-y-3">
                  <div className="h-12 bg-primary/8 rounded-lg" />
                  <div className="h-4 bg-muted/40 rounded" />
                  <div className="h-4 bg-muted/40 rounded w-4/5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-500 text-foreground mb-3 tracking-tight">
            Everything You Need
          </h2>
          <p className="text-muted-foreground text-base font-400">
            Powerful features designed for modern teams
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={<Cloud className="w-8 h-8" />}
            title="Cloud Storage"
            description="Unlimited storage with automatic syncing across devices"
          />
          <FeatureCard
            icon={<Lock className="w-8 h-8" />}
            title="Enterprise Security"
            description="Bank-grade encryption and compliance certifications"
          />
          <FeatureCard
            icon={<Share2 className="w-8 h-8" />}
            title="Easy Sharing"
            description="Control permissions and share with granular access levels"
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8" />}
            title="AI Assistant"
            description="Intelligent recommendations and document insights"
          />
        </div>
      </section>

      {/* Benefits Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-4xl font-500 text-foreground mb-8 tracking-tight">
              Collaborate Like Never Before
            </h2>
            <ul className="space-y-4">
              <BenefitItem
                title="Real-time Collaboration"
                description="Work together on documents with live updates"
              />
              <BenefitItem
                title="Version Control"
                description="Access previous versions and track changes"
              />
              <BenefitItem
                title="Team Management"
                description="Organize teams and manage access efficiently"
              />
              <BenefitItem
                title="Activity Tracking"
                description="Complete audit trail of all document activities"
              />
            </ul>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-primary/10 to-background border border-primary/20 p-12 h-96 flex items-center justify-center">
            <Users className="w-32 h-32 text-primary/30" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-r from-primary/8 to-background border border-primary/15 rounded-2xl p-12 lg:p-16 text-center shadow-lg">
          <h2 className="text-4xl font-500 text-foreground mb-4 tracking-tight">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-base text-muted-foreground mb-8 max-w-2xl mx-auto font-400">
            Join thousands of teams already using DriveHub to manage their documents securely and efficiently.
          </p>
          <Button
            size="lg"
            onClick={() => router.push('/auth/signup')}
            className="bg-primary hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg font-400"
          >
            Start Your Free Trial
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/20 mt-20 py-12 bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-primary-foreground font-bold">D</span>
                </div>
                <span className="font-500 text-foreground">DriveHub</span>
              </div>
              <p className="text-xs text-muted-foreground font-400">
                Modern document management for teams.
              </p>
            </div>
            <div>
              <h4 className="font-500 text-foreground mb-4 text-sm">Product</h4>
              <ul className="space-y-2 text-xs text-muted-foreground font-400">
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Features</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Pricing</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-500 text-foreground mb-4 text-sm">Company</h4>
              <ul className="space-y-2 text-xs text-muted-foreground font-400">
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">About</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Blog</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Careers</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-500 text-foreground mb-4 text-sm">Legal</h4>
              <ul className="space-y-2 text-xs text-muted-foreground font-400">
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Privacy</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Terms</Link></li>
                <li><Link href="#" className="hover:text-foreground transition-colors duration-200">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/20 pt-8 text-center text-xs text-muted-foreground font-400">
            <p>&copy; 2024 DriveHub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border border-border/20 rounded-xl p-6 hover:shadow-lg transition-all duration-300 hover:border-primary/10 active:scale-95 active:transition-transform active:duration-75">
      <div className="text-primary mb-4 transform group-hover:scale-110 transition-transform duration-300">{icon}</div>
      <h3 className="text-base font-500 text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground text-xs font-400">{description}</p>
    </div>
  );
}

function BenefitItem({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3 group">
      <CheckCircle className="w-5 h-5 text-primary/70 flex-shrink-0 mt-0.5 group-hover:text-primary transition-colors duration-200" />
      <div>
        <h4 className="font-500 text-foreground text-sm">{title}</h4>
        <p className="text-muted-foreground text-xs font-400">{description}</p>
      </div>
    </li>
  );
}
