import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Call from "@/models/Call";
import mongoose from "mongoose";

export async function GET() {
  try {
    // Get user session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Connect to database
    await dbConnect();

    // Convert session user id to ObjectId for database queries
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Get user stats from Call collection
    const stats = await Call.getUserStats(userId);

    console.log(`Stats fetched for user ${session.user.id}:`, stats);

    return NextResponse.json({
      success: true,
      stats: {
        totalCalls: stats.totalCalls,
        totalHours: stats.totalHours,
        thisWeek: stats.thisWeek,
      },
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
