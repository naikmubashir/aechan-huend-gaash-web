"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Video, Brain, User, LogOut, Phone, Mic } from "lucide-react";

export default function VIUserDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isInCall, setIsInCall] = useState(false);
  const [isWaitingForVolunteer, setIsWaitingForVolunteer] = useState(false);
  const [socket, setSocket] = useState(null);
  const [callId, setCallId] = useState(null);

  useEffect(() => {
    // Redirect if not authenticated or wrong role
    if (status === "loading") return;

    if (!session) {
      router.push("/auth/signin?role=VI_USER");
      return;
    }

    if (session.user.role !== "VI_USER") {
      router.push("/");
      return;
    }
  }, [session, status, router]);

  // Initialize socket connection
  useEffect(() => {
    if (!session?.user || socket) return;

    console.log("Initializing VI user socket connection for:", session.user.id);

    const newSocket = io("http://localhost:3000", {
      transports: ["polling", "websocket"],
      upgrade: true,
      rememberUpgrade: false,
      timeout: 20000,
      forceNew: false,
    });

    newSocket.on("connect", () => {
      console.log("VI user connected to socket:", newSocket.id);

      // Join as VI user
      newSocket.emit("join", {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
        language: session.user.language || "en",
      });
    });

    // Listen for call events
    newSocket.on("call_waiting", (data) => {
      console.log("Call waiting for volunteer:", data);
      setCallId(data.callId);
      // Keep waiting state as true
    });

    newSocket.on("call_accepted", (data) => {
      console.log("Call accepted by volunteer:", data);
      setIsWaitingForVolunteer(false);
      setIsInCall(true);
      // Navigate to call interface
      router.push(`/call?callId=${data.callId}&role=vi-user`);
    });

    newSocket.on("call_failed", (data) => {
      console.log("Call failed:", data);
      setIsWaitingForVolunteer(false);
      alert(
        data.error ||
          "No volunteers are currently available. Please try again later."
      );
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log("Cleaning up VI user socket connection");
      newSocket.disconnect();
    };
  }, [session?.user?.id]);

  const handleStartCall = async () => {
    if (!socket || !socket.connected) {
      alert("Not connected to call service. Please refresh the page.");
      return;
    }

    setIsWaitingForVolunteer(true);

    try {
      socket.emit("start_call", {
        viUserId: session.user.id,
        viUserName: session.user.name,
        language: session.user.language || "en",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error starting call:", error);
      setIsWaitingForVolunteer(false);
      alert("Error starting call. Please try again.");
    }
  };

  const cancelCall = () => {
    if (socket && callId) {
      socket.emit("cancel_call", { callId });
    }
    setIsWaitingForVolunteer(false);
    setCallId(null);
  };

  const handleUseAI = () => {
    router.push("/ai-assistant");
  };

  const handleProfile = () => {
    router.push("/profile");
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <output className="text-lg" aria-live="polite">
          Loading your dashboard...
        </output>
      </div>
    );
  }

  if (!session || session.user.role !== "VI_USER") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Visual Assistance</h1>
              <p className="text-sm opacity-90">
                Welcome back, {session.user.name}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleProfile}
                className="text-primary-foreground hover:bg-primary-foreground/10"
                aria-label="Profile settings"
              >
                <User size={20} />
                <span className="sr-only">Profile</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-primary-foreground hover:bg-primary-foreground/10"
                aria-label="Sign out"
              >
                <LogOut size={20} />
                <span className="sr-only">Sign out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Current status */}
        {isInCall && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3">
              <Video className="text-green-600" size={24} />
              <div>
                <h2 className="text-lg font-semibold text-green-800">
                  Call in Progress
                </h2>
                <p className="text-green-700">
                  You're connected with a volunteer
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                <Mic size={16} />
                Mute
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsInCall(false)}
              >
                <Phone size={16} />
                End Call
              </Button>
            </div>
          </div>
        )}

        {isWaitingForVolunteer && !isInCall && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div>
              <div>
                <h2 className="text-lg font-semibold text-yellow-800">
                  Looking for Volunteers
                </h2>
                <p className="text-yellow-700">
                  Please wait while we connect you with an available
                  volunteer...
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 border-yellow-600 text-yellow-600 hover:bg-yellow-50"
              onClick={cancelCall}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Main actions */}
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-semibold mb-2">
              How can we help you today?
            </h2>
            <p className="text-muted-foreground">
              Choose an option below to get visual assistance
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Start call with volunteer */}
            <div className="bg-card border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Video className="text-primary" size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Call a Volunteer</h3>
                  <p className="text-sm text-muted-foreground">
                    Connect with a human volunteer
                  </p>
                </div>
              </div>

              <p className="text-muted-foreground">
                Get real-time help from a sighted volunteer who can see through
                your camera and provide detailed descriptions and guidance.
              </p>

              <div className="space-y-3">
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Real-time video sharing</li>
                  <li>• Two-way audio communication</li>
                  <li>• Immediate human assistance</li>
                  <li>• Available 24/7</li>
                </ul>

                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleStartCall}
                  disabled={isWaitingForVolunteer || isInCall}
                  aria-describedby="call-volunteer-desc"
                >
                  <Video size={20} />
                  {isWaitingForVolunteer
                    ? "Finding Volunteer..."
                    : "Start Call"}
                </Button>
                <p
                  id="call-volunteer-desc"
                  className="text-xs text-muted-foreground"
                >
                  Connects you with the first available volunteer
                </p>
              </div>
            </div>

            {/* AI Assistant */}
            <div className="bg-card border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-secondary rounded-lg">
                  <Brain className="text-secondary-foreground" size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">AI Assistant</h3>
                  <p className="text-sm text-muted-foreground">
                    Get instant AI descriptions
                  </p>
                </div>
              </div>

              <p className="text-muted-foreground">
                Upload a photo and get an instant AI-powered description of
                what's in the image. Perfect for quick questions and immediate
                answers.
              </p>

              <div className="space-y-3">
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Instant image analysis</li>
                  <li>• Text-to-speech output</li>
                  <li>• No waiting time</li>
                  <li>• Available offline</li>
                </ul>

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  onClick={handleUseAI}
                  aria-describedby="ai-assistant-desc"
                >
                  <Brain size={20} />
                  Use AI Assistant
                </Button>
                <p
                  id="ai-assistant-desc"
                  className="text-xs text-muted-foreground"
                >
                  Upload a photo for AI-powered description
                </p>
              </div>
            </div>
          </div>

          {/* Quick tips */}
          <div className="bg-muted/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">
              Quick Tips for Best Results
            </h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">For Video Calls:</h4>
                <ul className="text-muted-foreground space-y-1">
                  <li>• Ensure good lighting</li>
                  <li>• Hold camera steady</li>
                  <li>• Speak clearly</li>
                  <li>• Be patient with volunteers</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">For AI Assistant:</h4>
                <ul className="text-muted-foreground space-y-1">
                  <li>• Take clear, focused photos</li>
                  <li>• Ensure good lighting</li>
                  <li>• Wait for audio description</li>
                  <li>• Try different angles if needed</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
