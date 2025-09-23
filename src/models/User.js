import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: ["VI_USER", "VOLUNTEER"],
    },
    language: {
      type: String,
      default: "en",
      enum: ["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko", "ar"],
    },
    isAvailable: {
      type: Boolean,
      default: function () {
        return this.role === "VOLUNTEER" ? false : undefined;
      },
    },
    profile: {
      timezone: String,
      phoneNumber: String,
      emergencyContact: String,
    },
    stats: {
      totalCalls: {
        type: Number,
        default: 0,
      },
      totalVolunteerTime: {
        type: Number,
        default: 0,
      },
      lastActiveAt: {
        type: Date,
        default: Date.now,
      },
    },
    preferences: {
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        browser: {
          type: Boolean,
          default: true,
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries (email already indexed via unique: true)
UserSchema.index({ role: 1, isAvailable: 1 });

// Virtual for available volunteers
UserSchema.virtual("isActiveVolunteer").get(function () {
  return this.role === "VOLUNTEER" && this.isAvailable === true;
});

// Method to update availability (only for volunteers)
UserSchema.methods.setAvailability = function (available) {
  if (this.role === "VOLUNTEER") {
    this.isAvailable = available;
    this.stats.lastActiveAt = new Date();
    return this.save();
  }
  throw new Error("Only volunteers can set availability");
};

// Method to increment call stats
UserSchema.methods.incrementCallStats = function (duration = 0) {
  this.stats.totalCalls += 1;
  if (this.role === "VOLUNTEER") {
    this.stats.totalVolunteerTime += duration;
  }
  this.stats.lastActiveAt = new Date();
  return this.save();
};

export default mongoose.models.User || mongoose.model("User", UserSchema);
