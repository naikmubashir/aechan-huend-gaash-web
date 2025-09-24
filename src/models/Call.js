import mongoose from "mongoose";

const CallSchema = new mongoose.Schema(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
    },
    roomId: {
      type: String,
      required: true,
    },
    viUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    duration: {
      type: Number, // Duration in minutes
      default: 0,
    },
    status: {
      type: String,
      enum: ["ongoing", "completed", "failed"],
      default: "ongoing",
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    metadata: {
      userAgent: String,
      connectionType: String,
      quality: {
        type: String,
        enum: ["excellent", "good", "fair", "poor"],
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
CallSchema.index({ viUser: 1, createdAt: -1 });
CallSchema.index({ volunteer: 1, createdAt: -1 });
CallSchema.index({ startTime: -1 });
CallSchema.index({ status: 1 });

// Method to end the call and calculate duration
CallSchema.methods.endCall = function (endedByUserId) {
  this.endTime = new Date();
  this.status = "completed";
  this.endedBy = endedByUserId;

  // Calculate duration in minutes
  if (this.startTime) {
    const durationMs = this.endTime - this.startTime;
    this.duration = Math.round(durationMs / (1000 * 60)); // Convert to minutes
  }

  return this.save();
};

// Static method to get user stats
CallSchema.statics.getUserStats = async function (userId) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
  startOfWeek.setHours(0, 0, 0, 0);

  const totalCallsResult = await this.aggregate([
    {
      $match: {
        $or: [{ viUser: userId }, { volunteer: userId }],
        status: "completed",
      },
    },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        totalMinutes: { $sum: "$duration" },
      },
    },
  ]);

  const thisWeekCallsResult = await this.aggregate([
    {
      $match: {
        $or: [{ viUser: userId }, { volunteer: userId }],
        status: "completed",
        startTime: { $gte: startOfWeek },
      },
    },
    {
      $group: {
        _id: null,
        thisWeekCalls: { $sum: 1 },
      },
    },
  ]);

  const totalStats = totalCallsResult[0] || { totalCalls: 0, totalMinutes: 0 };
  const weekStats = thisWeekCallsResult[0] || { thisWeekCalls: 0 };

  return {
    totalCalls: totalStats.totalCalls,
    totalHours: Math.round((totalStats.totalMinutes / 60) * 10) / 10, // Round to 1 decimal
    thisWeek: weekStats.thisWeekCalls,
  };
};

// Static method to create a new call
CallSchema.statics.createCall = function (
  callId,
  roomId,
  viUserId,
  volunteerId
) {
  return this.create({
    callId,
    roomId,
    viUser: viUserId,
    volunteer: volunteerId,
    startTime: new Date(),
    status: "ongoing",
  });
};

export default mongoose.models.Call || mongoose.model("Call", CallSchema);
