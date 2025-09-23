import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema(
  {
    viUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sessionType: {
      type: String,
      enum: ["VOLUNTEER_CALL", "AI_ASSISTANT"],
      required: true,
    },
    status: {
      type: String,
      enum: ["WAITING", "CONNECTED", "ENDED", "CANCELLED"],
      default: "WAITING",
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    duration: {
      type: Number, // in seconds
      default: 0,
    },
    connectionDetails: {
      socketId: String,
      roomId: String,
      sdpOffer: String,
      sdpAnswer: String,
    },
    aiAnalysis: {
      imageUrl: String,
      description: String,
      confidence: Number,
      processingTime: Number,
    },
    feedback: {
      viUserRating: {
        type: Number,
        min: 1,
        max: 5,
      },
      volunteerRating: {
        type: Number,
        min: 1,
        max: 5,
      },
      viUserComment: String,
      volunteerComment: String,
    },
    technicalLogs: {
      connectionAttempts: {
        type: Number,
        default: 0,
      },
      errors: [String],
      networkQuality: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
SessionSchema.index({ viUser: 1, createdAt: -1 });
SessionSchema.index({ volunteer: 1, createdAt: -1 });
SessionSchema.index({ status: 1, createdAt: -1 });
SessionSchema.index({ sessionType: 1, createdAt: -1 });

// Virtual for calculating duration
SessionSchema.virtual("calculatedDuration").get(function () {
  if (this.endTime && this.startTime) {
    return Math.floor((this.endTime - this.startTime) / 1000);
  }
  return 0;
});

// Method to end session
SessionSchema.methods.endSession = function () {
  this.status = "ENDED";
  this.endTime = new Date();
  this.duration = this.calculatedDuration;
  return this.save();
};

// Method to cancel session
SessionSchema.methods.cancelSession = function () {
  this.status = "CANCELLED";
  this.endTime = new Date();
  return this.save();
};

// Method to connect volunteer
SessionSchema.methods.connectVolunteer = function (
  volunteerId,
  connectionDetails = {}
) {
  this.volunteer = volunteerId;
  this.status = "CONNECTED";
  this.connectionDetails = { ...this.connectionDetails, ...connectionDetails };
  return this.save();
};

// Static method to find waiting sessions
SessionSchema.statics.findWaitingSessions = function () {
  return this.find({ status: "WAITING", sessionType: "VOLUNTEER_CALL" })
    .populate("viUser", "name email language")
    .sort({ createdAt: 1 });
};

// Static method to find active sessions for a user
SessionSchema.statics.findActiveSessionForUser = function (userId) {
  return this.findOne({
    $or: [
      { viUser: userId, status: { $in: ["WAITING", "CONNECTED"] } },
      { volunteer: userId, status: "CONNECTED" },
    ],
  }).populate("viUser volunteer", "name email role");
};

export default mongoose.models.Session ||
  mongoose.model("Session", SessionSchema);
