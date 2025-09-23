"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Camera,
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";

export default function AIAssistant() {
  const { data: session } = useSession();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file?.type?.startsWith("image/")) {
      setSelectedFile(file);
      setDescription("");

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setDescription("");

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setDescription(data.description);
        // Auto-play the description
        speakText(data.description);
      } else {
        setDescription(`Error: ${data.error || "Failed to analyze image"}`);
      }
    } catch (error) {
      console.error("Analysis error:", error);
      setDescription("Error: Failed to analyze image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const speakText = (text) => {
    if ("speechSynthesis" in window) {
      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeech = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreview(null);
    setDescription("");
    setIsAnalyzing(false);
    setIsPlaying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={
                session?.user?.role === "VI_USER" ? "/dashboard/vi-user" : "/"
              }
              className="p-2 hover:bg-muted rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">AI Assistant</h1>
              <p className="text-muted-foreground">
                Upload a photo for instant description
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Upload section */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Upload Image</h2>

            {!preview ? (
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
                <ImageIcon
                  className="mx-auto text-muted-foreground mb-4"
                  size={48}
                />
                <h3 className="text-lg font-medium mb-2">
                  Select an image to analyze
                </h3>
                <p className="text-muted-foreground mb-6">
                  Choose a clear photo and our AI will describe what it sees
                </p>

                <div className="space-y-4">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    <Upload size={20} />
                    Choose File
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    aria-label="Select image file"
                  />
                </div>

                <p className="text-sm text-muted-foreground mt-4">
                  Supported formats: JPG, PNG, GIF, WebP
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Image preview */}
                <div className="relative">
                  <img
                    src={preview}
                    alt="Selected file for analysis"
                    className="w-full max-w-md mx-auto rounded-lg shadow-lg"
                    style={{ maxHeight: "400px", objectFit: "contain" }}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    size="lg"
                    className="min-w-32"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Camera size={20} />
                        Analyze Image
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={isAnalyzing}
                  >
                    <RotateCcw size={16} />
                    Try Another
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Results section */}
          {description && (
            <div className="bg-card border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">AI Description</h2>
                <div className="flex gap-2">
                  {isPlaying ? (
                    <Button variant="outline" size="sm" onClick={stopSpeech}>
                      <Pause size={16} />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => speakText(description)}
                      disabled={!description}
                    >
                      <Play size={16} />
                      Listen
                    </Button>
                  )}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-lg leading-relaxed">{description}</p>
              </div>

              {isPlaying && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-pulse w-2 h-2 bg-primary rounded-full"></div>
                  Playing audio description...
                </div>
              )}
            </div>
          )}

          {/* Tips */}
          <div className="bg-muted/50 rounded-lg p-6">
            <h3 className="font-semibold mb-3">Tips for Better Results</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <ul className="space-y-1">
                <li>• Ensure good lighting when taking photos</li>
                <li>• Keep the camera steady and focused</li>
                <li>• Include the full object or scene you want described</li>
              </ul>
              <ul className="space-y-1">
                <li>• Avoid blurry or very dark images</li>
                <li>• Get closer for detail or farther for context</li>
                <li>• Try different angles if the first isn't clear</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
