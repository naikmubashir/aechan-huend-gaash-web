'use client';

import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Eye, HandHeart } from 'lucide-react';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Redirect authenticated users to their dashboard
    if (session?.user) {
      if (session.user.role === 'VI_USER') {
        router.push('/dashboard/vi-user');
      } else if (session.user.role === 'VOLUNTEER') {
        router.push('/dashboard/volunteer');
      }
    }
  }, [session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg" role="status" aria-live="polite">
          Loading...
        </div>
      </div>
    );
  }

  const handleNeedAssistance = () => {
    router.push('/auth/signin?role=VI_USER');
  };

  const handleVolunteer = () => {
    router.push('/auth/signin?role=VOLUNTEER');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Skip to main content link for screen readers */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-4 py-2 rounded-md z-50"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="w-full bg-primary text-primary-foreground py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold text-center">
            Aechan Huend Gaash
          </h1>
          <p className="text-lg md:text-xl text-center mt-2 opacity-90">
            Visual Assistance Platform
          </p>
        </div>
      </header>

      {/* Main content */}
      <main 
        id="main-content" 
        className="flex-1 flex flex-col items-center justify-center px-4 py-12"
        role="main"
      >
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-foreground">
            How would you like to get started?
          </h2>
          
          <p className="text-lg mb-12 text-muted-foreground max-w-2xl mx-auto">
            Connect with volunteers or use AI assistance for real-time visual support. 
            Choose your path below to join our accessible community.
          </p>

          {/* Main action buttons */}
          <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {/* Need assistance button */}
            <div className="space-y-4">
              <Button
                size="xl"
                onClick={handleNeedAssistance}
                className="w-full h-32 text-xl font-semibold flex flex-col items-center gap-3 hover:scale-105 transition-transform focus:scale-105"
                aria-describedby="need-assistance-desc"
              >
                <Eye size={48} aria-hidden="true" />
                <span>I need visual assistance</span>
              </Button>
              <p 
                id="need-assistance-desc" 
                className="text-sm text-muted-foreground"
              >
                Connect with volunteers or use AI to describe what you see
              </p>
            </div>

            {/* Volunteer button */}
            <div className="space-y-4">
              <Button
                size="xl"
                variant="outline"
                onClick={handleVolunteer}
                className="w-full h-32 text-xl font-semibold flex flex-col items-center gap-3 hover:scale-105 transition-transform focus:scale-105"
                aria-describedby="volunteer-desc"
              >
                <HandHeart size={48} aria-hidden="true" />
                <span>I would like to volunteer</span>
              </Button>
              <p 
                id="volunteer-desc" 
                className="text-sm text-muted-foreground"
              >
                Help others by providing visual assistance when you're available
              </p>
            </div>
          </div>

          {/* Additional information */}
          <div className="mt-16 bg-muted/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">About This Platform</h3>
            <div className="grid md:grid-cols-2 gap-6 text-left">
              <div>
                <h4 className="font-medium mb-2">For Vision Support</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Real-time video calls with volunteers</li>
                  <li>• AI-powered image descriptions</li>
                  <li>• Fully accessible interface</li>
                  <li>• Multiple language support</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">For Volunteers</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Flexible availability settings</li>
                  <li>• Secure and private calls</li>
                  <li>• Make a meaningful impact</li>
                  <li>• Join a supportive community</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-muted py-6 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2025 Aechan Huend Gaash. Connecting communities through visual assistance.
          </p>
        </div>
      </footer>
    </div>
  );
}