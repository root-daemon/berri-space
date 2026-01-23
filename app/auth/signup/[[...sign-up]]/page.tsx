'use client';

import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 animate-page-fade-in">
      <SignUp
        appearance={{
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'shadow-lg border-border/20 rounded-2xl',
            headerTitle: 'text-2xl font-500 text-foreground',
            headerSubtitle: 'text-sm text-muted-foreground font-400',
            socialButtonsBlockButton: 'bg-muted/30 border-border/20 hover:bg-muted transition-all duration-250',
            formFieldLabel: 'text-sm font-400 text-foreground',
            formFieldInput: 'bg-muted/30 border-border/20 focus:bg-muted focus:border-primary/20 transition-all duration-250',
            formButtonPrimary: 'bg-primary hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg font-400',
            footerActionLink: 'text-primary font-500 hover:text-primary/80 transition-colors duration-200',
          },
        }}
        routing="path"
        path="/auth/signup"
        signInUrl="/auth/signin"
        forceRedirectUrl="/drive"
      />
    </div>
  );
}
