"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import {
  User,
  LogOut,
  Phone,
  PhoneCall,
  Clock,
  CheckCircle,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Heart,
  Timer,
} from "lucide-react";

export default function VolunteerDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [socket, setSocket] = useState(null);
  const [stats] = useState({
    totalCalls: 0,
    totalHours: 0,
    thisWeek: 0,
  });

  // Handle authentication and routing
  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.push("/auth/signin?role=VOLUNTEER");
      return;
    }

    if (session.user.role !== "VOLUNTEER") {
      router.push("/");
      return;
    }

    // Set initial availability from session
    setIsAvailable(session.user.isAvailable || false);
  }, [session, status, router]);

  // Initialize Socket.io connection separately
  useEffect(() => {
    if (!session?.user || socket) return;

    console.log("Initializing socket connection for user:", session.user.id);

    const newSocket = io("http://localhost:3000", {
      transports: ["polling", "websocket"], // Try polling first, then websocket
      upgrade: true,
      rememberUpgrade: false,
      timeout: 20000,
      forceNew: false,
    });

    newSocket.on("connect", () => {
      console.log("Volunteer connected to socket:", newSocket.id);

      // Join as volunteer
      newSocket.emit("join", {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
        isAvailable: session.user.isAvailable || false,
        language: session.user.language || "en",
      });
    });

    // Listen for incoming calls
    newSocket.on("incoming_call", (callData) => {
      console.log("Incoming call received:", callData);
      setIncomingCall(callData);
    });

    // Listen for call taken by another volunteer
    newSocket.on("call_taken", (data) => {
      console.log("Call was taken by another volunteer:", data);
      setIncomingCall(null);
    });

    // Listen for call cancelled
    newSocket.on("call_cancelled", (data) => {
      console.log("Call was cancelled:", data);
      setIncomingCall(null);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      // Auto-reconnect logic is handled by socket.io by default
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log("Cleaning up socket connection");
      newSocket.disconnect();
    };
  }, [session?.user?.id]); // Only depend on user ID, not the socket itself

  // Update socket when availability changes
  useEffect(() => {
    if (socket && socket.connected && session?.user) {
      console.log("Updating availability:", isAvailable);
      socket.emit("update_availability", {
        id: session.user.id,
        isAvailable: isAvailable,
      });
    } else if (socket && !socket.connected) {
      console.log("Socket not connected, waiting for connection...");
      // Wait for connection before emitting
      socket.once("connect", () => {
        socket.emit("update_availability", {
          id: session.user.id,
          isAvailable: isAvailable,
        });
      });
    }
  }, [isAvailable, socket, session?.user?.id]);

  const toggleAvailability = async () => {
    if (isUpdatingAvailability) return; // Prevent double clicks

    try {
      setIsUpdatingAvailability(true);
      const newAvailability = !isAvailable;

      // Update availability in database via API
      const response = await fetch("/api/volunteer/availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isAvailable: newAvailability,
        }),
      });

      if (response.ok) {
        setIsAvailable(newAvailability);

        // Update session data locally
        if (session?.user) {
          session.user.isAvailable = newAvailability;
        }

        // Update socket availability
        if (socket && socket.connected) {
          socket.emit("update_availability", {
            isAvailable: newAvailability,
          });
        }
      } else {
        console.error("Failed to update availability:", response.statusText);
        // You could add a toast notification here
      }
    } catch (error) {
      console.error("Error updating availability:", error);
      // You could add a toast notification here
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  const handleAcceptCall = () => {
    if (!incomingCall || !socket) return;

    console.log("Accepting call from:", incomingCall?.viUser?.name);

    // Emit accept_call event to socket
    socket.emit("accept_call", {
      callId: incomingCall.callId,
    });

    // Navigate to call interface
    router.push(`/call?callId=${incomingCall.callId}&role=volunteer`);

    setIncomingCall(null);
  };

  const handleDeclineCall = () => {
    setIncomingCall(null);
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

  if (!session || session.user.role !== "VOLUNTEER") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Incoming call modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="text-center">
              <PhoneCall className="mx-auto text-primary mb-3" size={48} />
              <h3 className="text-xl font-semibold">Incoming Call</h3>
              <p className="text-muted-foreground">
                {incomingCall.viUser?.name} needs visual assistance
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDeclineCall}
              >
                <XCircle size={16} />
                Decline
              </Button>
              <Button className="flex-1" onClick={handleAcceptCall}>
                <CheckCircle size={16} />
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Volunteer Dashboard</h1>
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
        {/* Availability toggle */}
        <div className="bg-card border rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Availability Status</h2>
              <p className="text-muted-foreground">
                {isAvailable
                  ? "You are currently available to receive calls"
                  : "You are currently unavailable"}
              </p>
            </div>
            <Button
              size="lg"
              variant={isAvailable ? "default" : "outline"}
              onClick={toggleAvailability}
              disabled={isUpdatingAvailability}
              className="flex items-center gap-3"
              aria-pressed={isAvailable}
              aria-describedby="availability-desc"
            >
              {isUpdatingAvailability ? (
                <>
                  <Timer size={24} className="animate-spin" />
                  Updating...
                </>
              ) : isAvailable ? (
                <>
                  <ToggleRight size={24} />
                  Available
                </>
              ) : (
                <>
                  <ToggleLeft size={24} />
                  Unavailable
                </>
              )}
            </Button>
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p id="availability-desc" className="text-sm text-muted-foreground">
              When available, you'll receive notifications for incoming calls
              from users who need visual assistance. You can toggle your
              availability anytime.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-card border rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Phone className="text-blue-600" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCalls}</p>
                <p className="text-sm text-muted-foreground">Total Calls</p>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Timer className="text-green-600" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalHours}h</p>
                <p className="text-sm text-muted-foreground">Hours Helped</p>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-lg p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Heart className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.thisWeek}</p>
                <p className="text-sm text-muted-foreground">This Week</p>
              </div>
            </div>
          </div>
        </div>

        {/* Information cards */}
        <div className="space-y-6">
          <h3 className="text-xl font-semibold">How it Works</h3>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-card border rounded-lg p-6">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="text-primary" size={20} />
                When You're Available
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• You'll receive notifications for incoming calls</li>
                <li>• First volunteer to accept gets connected</li>
                <li>• Calls are typically 5-15 minutes long</li>
                <li>• You can decline calls anytime</li>
              </ul>
            </div>

            <div className="bg-card border rounded-lg p-6">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <PhoneCall className="text-primary" size={20} />
                During a Call
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• You'll see the user's camera feed</li>
                <li>• Describe what you see clearly</li>
                <li>• Be patient and helpful</li>
                <li>• Either party can end the call</li>
              </ul>
            </div>
          </div>

          {/* Tips for volunteers */}
          <div className="bg-muted/50 rounded-lg p-6">
            <h4 className="font-semibold mb-4">
              Tips for Great Volunteer Experiences
            </h4>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h5 className="font-medium mb-2">Communication:</h5>
                <ul className="text-muted-foreground space-y-1">
                  <li>• Speak clearly and at a comfortable pace</li>
                  <li>• Describe details like colors, shapes, and text</li>
                  <li>• Ask if they need more specific information</li>
                  <li>• Be encouraging and patient</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium mb-2">Best Practices:</h5>
                <ul className="text-muted-foreground space-y-1">
                  <li>• Find a quiet environment</li>
                  <li>• Ensure stable internet connection</li>
                  <li>• Take breaks when needed</li>
                  <li>• Report any technical issues</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
