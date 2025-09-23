"use client";

import { useState, useEffect } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Eye, HandHeart, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SignIn() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "VI_USER";

  useEffect(() => {
    // Check if user is already authenticated
    getSession().then((session) => {
      if (session?.user) {
        const redirectPath =
          session.user.role === "VI_USER"
            ? "/dashboard/vi-user"
            : "/dashboard/volunteer";
        router.push(redirectPath);
      }
    });
  }, [router]);

  const getRoleInfo = (userRole) => {
    if (userRole === "VI_USER") {
      return {
        title: "Visual Assistance",
        icon: <Eye size={24} aria-hidden="true" />,
        description: "Get help from volunteers or AI",
      };
    } else {
      return {
        title: "Volunteer",
        icon: <HandHeart size={24} aria-hidden="true" />,
        description: "Help others with visual assistance",
      };
    }
  };

  const roleInfo = getRoleInfo(role);

  const getButtonText = () => {
    return isLogin ? "Sign In" : "Create Account";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        // Sign in
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError(result.error);
        } else {
          // Get the updated session to check the role
          const session = await getSession();
          if (session?.user) {
            const redirectPath =
              session.user.role === "VI_USER"
                ? "/dashboard/vi-user"
                : "/dashboard/volunteer";
            router.push(redirectPath);
          }
        }
      } else {
        // Sign up
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            name,
            role,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          // Registration successful, now sign in
          const signInResult = await signIn("credentials", {
            email,
            password,
            redirect: false,
          });

          if (signInResult?.ok) {
            const session = await getSession();
            if (session?.user) {
              const redirectPath =
                session.user.role === "VI_USER"
                  ? "/dashboard/vi-user"
                  : "/dashboard/volunteer";
              router.push(redirectPath);
            }
          } else {
            setError(
              "Registration successful, but sign in failed. Please try logging in."
            );
          }
        } else {
          setError(data.error || "Registration failed");
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Back to home link */}
      <div className="p-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              {roleInfo.icon}
              <h1 className="text-2xl font-bold">{roleInfo.title}</h1>
            </div>
            <p className="text-muted-foreground">{roleInfo.description}</p>
          </div>

          {/* Form */}
          <div className="bg-card border rounded-lg p-6 space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-semibold">
                {isLogin ? "Sign In" : "Create Account"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isLogin
                  ? "Welcome back! Please sign in to continue."
                  : "Create your account to get started."}
              </p>
            </div>

            {error && (
              <div
                className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required={!isLogin}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="Enter your full name"
                    aria-describedby={!isLogin ? "name-desc" : undefined}
                  />
                  {!isLogin && (
                    <p id="name-desc" className="text-xs text-muted-foreground">
                      This will be displayed to other users during calls
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder="Enter your email"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder="Enter your password"
                  minLength={6}
                  aria-describedby={!isLogin ? "password-desc" : undefined}
                />
                {!isLogin && (
                  <p
                    id="password-desc"
                    className="text-xs text-muted-foreground"
                  >
                    Password must be at least 6 characters long
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                size="lg"
              >
                {loading ? "Please wait..." : getButtonText()}
              </Button>
            </form>

            {/* Toggle between login and signup */}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                {isLogin
                  ? "Don't have an account? "
                  : "Already have an account? "}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                }}
                className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
