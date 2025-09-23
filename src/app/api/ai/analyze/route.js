import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

export async function POST(request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if API key is configured
    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "Google API key not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!image || !(image instanceof File)) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // Validate file size (10MB limit)
    if (image.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    // Convert image to base64
    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    // Get the generative model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Create the prompt for visual assistance
    const prompt = `You are an AI assistant helping visually impaired users understand images. 
    Please provide a clear, detailed, and helpful description of this image. 
    Focus on:
    1. The main objects or people in the image
    2. Their positions and relationships
    3. Colors, text, and important details
    4. Any relevant context or actions taking place
    
    Please be descriptive but concise, and speak as if you're helping someone who cannot see the image.
    Avoid using phrases like "I can see" or "The image shows" - instead, describe directly what is present.`;

    const imageParts = [
      {
        inlineData: {
          data: base64Image,
          mimeType: image.type,
        },
      },
    ];

    const startTime = Date.now();

    // Generate description
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = result.response;
    const description = response.text();

    const processingTime = Date.now() - startTime;

    // Save analysis to database for tracking
    try {
      await dbConnect();
      const User = (await import("@/models/User")).default;
      await User.findByIdAndUpdate(session.user.id, {
        $inc: { "stats.totalCalls": 1 },
        $set: { "stats.lastActiveAt": new Date() },
      });
    } catch (dbError) {
      console.error("Error saving analysis stats:", dbError);
    }

    console.log(
      `AI analysis completed in ${processingTime}ms for user ${session.user.id}`
    );

    return NextResponse.json({
      description: description.trim(),
      processingTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("AI analysis error:", error);

    // Handle specific Google AI errors
    if (error.message?.includes("API_KEY")) {
      return NextResponse.json(
        { error: "AI service configuration error" },
        { status: 500 }
      );
    }

    if (error.message?.includes("QUOTA_EXCEEDED")) {
      return NextResponse.json(
        { error: "AI service quota exceeded. Please try again later." },
        { status: 429 }
      );
    }

    if (error.message?.includes("SAFETY")) {
      return NextResponse.json(
        {
          error: "Image content cannot be analyzed due to safety restrictions.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to analyze image. Please try again." },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
