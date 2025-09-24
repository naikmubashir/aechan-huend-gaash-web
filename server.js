import config from "./src/lib/env.js";

import { createServer } from "http";
import { Server } from "socket.io";
import next from "next";
import dbConnect from "./src/lib/db.js";
import Call from "./src/models/Call.js";
import User from "./src/models/User.js";
import mongoose from "mongoose";

const dev = process.env.NODE_ENV !== "production";

const hostname = "localhost";
const port = 3000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? false
          : ["http://localhost:3000"],
      methods: ["GET", "POST"],
    },
  });

  // Store active volunteers and ongoing calls
  const activeVolunteers = new Map(); // socketId -> volunteerData
  const ongoingCalls = new Map(); // callId -> { viUser, volunteer, startTime }
  const waitingCalls = new Map(); // callId -> viUserData

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // User joins as VI User or Volunteer
    socket.on("join", (userData) => {
      socket.userData = userData;

      // Check if user is in an ongoing call
      let userCall = null;
      for (const [callId, callSession] of ongoingCalls.entries()) {
        if (
          callSession.viUser.id === userData.id ||
          callSession.volunteer.id === userData.id
        ) {
          userCall = { callId, callSession };
          break;
        }
      }

      if (userCall) {
        // User is reconnecting to an existing call
        const { callId, callSession } = userCall;
        const roomId = `room_${callId}`;
        socket.join(roomId);

        // Update socket ID in the call session
        if (callSession.viUser.id === userData.id) {
          callSession.viUser.socketId = socket.id;
        } else if (callSession.volunteer.id === userData.id) {
          callSession.volunteer.socketId = socket.id;
        }

        console.log(`User ${userData.name} reconnected to call ${callId}`);

        // Notify that they're connected to the call
        socket.emit("call_connected", {
          callId,
          viUser: callSession.viUser,
          volunteer: callSession.volunteer,
          roomId,
        });
      } else if (userData.role === "VOLUNTEER" && userData.isAvailable) {
        // Regular volunteer availability logic
        activeVolunteers.set(socket.id, {
          id: userData.id,
          name: userData.name,
          socketId: socket.id,
        });
        console.log(`Volunteer ${userData.name} is now available`);
      }
    });

    // Handle explicit room joining
    socket.on("joinRoom", (roomId) => {
      console.log(`Socket ${socket.id} joining room: ${roomId}`);
      socket.join(roomId);
    });

    // VI User requests a call
    socket.on("start_call", (callData) => {
      const callId = `call_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 11)}`;

      // Store the waiting call
      waitingCalls.set(callId, {
        id: callId,
        viUser: {
          id: socket.userData.id,
          name: socket.userData.name,
          socketId: socket.id,
        },
        timestamp: Date.now(),
      });

      // Broadcast to all available volunteers
      if (activeVolunteers.size > 0) {
        const callRequest = {
          callId,
          viUser: {
            name: socket.userData.name,
            language: socket.userData.language || "en",
          },
          timestamp: Date.now(),
        };

        // Send to all available volunteers
        activeVolunteers.forEach((volunteer) => {
          io.to(volunteer.socketId).emit("incoming_call", callRequest);
        });

        socket.emit("call_waiting", {
          callId,
          message: "Looking for available volunteers...",
          availableVolunteers: activeVolunteers.size,
        });
      } else {
        socket.emit("call_failed", {
          error:
            "No volunteers are currently available. Please try again later.",
        });
      }
    });

    // Volunteer accepts a call
    socket.on("accept_call", async (data) => {
      const { callId } = data;
      const waitingCall = waitingCalls.get(callId);

      if (!waitingCall) {
        socket.emit("call_not_found", { callId });
        return;
      }

      // Check if call is already accepted (race condition protection)
      if (ongoingCalls.has(callId)) {
        socket.emit("call_already_accepted", { callId });
        return;
      }

      try {
        // Connect to database
        await dbConnect();
        console.log("Database connected for call creation");

        // Create the call connection
        const callSession = {
          callId,
          viUser: waitingCall.viUser,
          volunteer: {
            id: socket.userData.id,
            name: socket.userData.name,
            socketId: socket.id,
          },
          startTime: Date.now(),
        };

        // Create call record in database
        const roomId = `room_${callId}`;
        console.log("Creating call record:", {
          callId,
          roomId,
          viUserId: waitingCall.viUser.id,
          volunteerId: socket.userData.id,
        });

        const dbCall = await Call.createCall(
          callId,
          roomId,
          new mongoose.Types.ObjectId(waitingCall.viUser.id),
          new mongoose.Types.ObjectId(socket.userData.id)
        );

        console.log("Call record created successfully:", dbCall._id);

        ongoingCalls.set(callId, callSession);
        waitingCalls.delete(callId);

        // Remove volunteer from available list during call
        activeVolunteers.delete(socket.id);

        // Create a room for the call (use roomId already defined above)
        socket.join(roomId);

        // Get the VI user socket and add to room
        const viUserSocket = io.sockets.sockets.get(
          waitingCall.viUser.socketId
        );
        if (viUserSocket) {
          viUserSocket.join(roomId);

          // Notify both parties
          viUserSocket.emit("call_accepted", {
            callId,
            volunteer: {
              name: callSession.volunteer.name,
            },
            roomId,
          });
        }

        socket.emit("call_connected", {
          callId,
          viUser: {
            name: callSession.viUser.name,
          },
          roomId,
        });

        // Notify other volunteers that call was taken
        activeVolunteers.forEach((volunteer) => {
          if (volunteer.socketId !== socket.id) {
            io.to(volunteer.socketId).emit("call_taken", { callId });
          }
        });

        console.log(
          `Call ${callId} connected: ${callSession.viUser.name} <-> ${callSession.volunteer.name}`
        );
      } catch (error) {
        console.error("Error creating call record:", error);
        socket.emit("call_failed", {
          error: "Failed to establish call connection",
        });
      }
    });

    // WebRTC signaling events
    socket.on("offer", (data) => {
      console.log(`Forwarding offer from ${socket.id} to room ${data.roomId}`);
      socket.to(data.roomId).emit("offer", data);
    });

    socket.on("answer", (data) => {
      console.log(`Forwarding answer from ${socket.id} to room ${data.roomId}`);
      socket.to(data.roomId).emit("answer", data);
    });

    socket.on("ice-candidate", (data) => {
      console.log(
        `Forwarding ICE candidate from ${socket.id} to room ${data.roomId}`
      );
      socket.to(data.roomId).emit("ice-candidate", data);
    });

    socket.on("peer-ready", (data) => {
      console.log(`Peer ready signal from ${socket.id} in room ${data.roomId}`);
      socket.to(data.roomId).emit("peer-ready", data);
    });

    // End call
    socket.on("end_call", async (data) => {
      const { callId } = data;
      const callSession = ongoingCalls.get(callId);
      console.log(`End call request from ${socket.id} for call ${callId}`);
      console.log("Call session found:", !!callSession);

      // Always create room ID to send end call event
      const roomId = `room_${callId}`;

      if (callSession) {
        const duration = Date.now() - callSession.startTime;
        console.log(`Call duration: ${Math.round(duration / 1000)}s`);

        try {
          // Connect to database
          await dbConnect();
          console.log("Database connected for call ending");

          // Find and update the call record
          const call = await Call.findOne({ callId });
          console.log("Database call record found:", !!call);

          if (call) {
            await call.endCall(new mongoose.Types.ObjectId(socket.userData.id));
            console.log(
              `Call ${callId} record updated in database with duration: ${call.duration} minutes`
            );

            // Update user stats
            const viUser = await User.findById(call.viUser);
            const volunteer = await User.findById(call.volunteer);

            if (viUser) {
              await viUser.incrementCallStats(call.duration);
              console.log(
                `Updated stats for VI user: ${viUser.name} (${viUser.stats.totalCalls} calls)`
              );
            }

            if (volunteer) {
              await volunteer.incrementCallStats(call.duration);
              console.log(
                `Updated stats for volunteer: ${volunteer.name} (${volunteer.stats.totalCalls} calls)`
              );
            }
          } else {
            console.log(`No database record found for call ${callId}`);
          }
        } catch (error) {
          console.error("Error updating call record:", error);
        }

        // Clean up
        ongoingCalls.delete(callId);

        // Make volunteer available again if they ended the call
        if (
          socket.userData.role === "VOLUNTEER" &&
          socket.userData.isAvailable
        ) {
          activeVolunteers.set(socket.id, {
            id: socket.userData.id,
            name: socket.userData.name,
            socketId: socket.id,
          });
        }

        console.log(
          `Call ${callId} ended after ${Math.round(duration / 1000)}s`
        );
      } else {
        console.log(
          `Call session not found for ${callId}, but sending end event anyway`
        );
      }

      // Always notify the room about call end, even if session was already cleaned up
      io.to(roomId).emit("call_ended", {
        callId,
        duration: callSession ? Date.now() - callSession.startTime : 0,
        endedBy: socket.userData?.name || "Unknown",
        reason: callSession ? "user_action" : "cleanup",
      });
    });

    // Update volunteer availability
    socket.on("update_availability", (data) => {
      const { isAvailable } = data;

      if (socket.userData.role === "VOLUNTEER") {
        socket.userData.isAvailable = isAvailable;

        if (isAvailable) {
          activeVolunteers.set(socket.id, {
            id: socket.userData.id,
            name: socket.userData.name,
            socketId: socket.id,
          });
        } else {
          activeVolunteers.delete(socket.id);
        }

        socket.emit("availability_updated", { isAvailable });
        console.log(
          `Volunteer ${socket.userData.name} is now ${
            isAvailable ? "available" : "unavailable"
          }`
        );
      }
    });

    // Cancel call
    socket.on("cancel_call", (data) => {
      const { callId } = data;
      const waitingCall = waitingCalls.get(callId);

      if (waitingCall) {
        waitingCalls.delete(callId);
        console.log(
          `Call ${callId} cancelled by VI user ${socket.userData.name}`
        );

        // Notify volunteers that call was cancelled
        activeVolunteers.forEach((volunteer) => {
          io.to(volunteer.socketId).emit("call_cancelled", { callId });
        });
      }
    });

    // Handle disconnection
    socket.on("disconnect", async () => {
      console.log("Client disconnected:", socket.id);

      // Remove from active volunteers
      activeVolunteers.delete(socket.id);

      // Handle ongoing calls
      for (const [callId, callSession] of ongoingCalls.entries()) {
        if (
          callSession.viUser.socketId === socket.id ||
          callSession.volunteer.socketId === socket.id
        ) {
          const roomId = `room_${callId}`;
          const duration = Date.now() - callSession.startTime;

          try {
            // Connect to database and end the call properly
            await dbConnect();
            console.log("Database connected for disconnection cleanup");

            // Find and update the call record
            const call = await Call.findOne({ callId });
            console.log("Database call record found for disconnect:", !!call);

            if (call && call.status === "ongoing") {
              // Determine who disconnected
              const endedByUserId =
                callSession.viUser.socketId === socket.id
                  ? callSession.viUser.id
                  : callSession.volunteer.id;

              await call.endCall(new mongoose.Types.ObjectId(endedByUserId));
              console.log(
                `Call ${callId} record updated in database due to disconnect - duration: ${call.duration} minutes`
              );

              // Update user stats
              const viUser = await User.findById(call.viUser);
              const volunteer = await User.findById(call.volunteer);

              if (viUser) {
                await viUser.incrementCallStats(call.duration);
                console.log(
                  `Updated stats for VI user after disconnect: ${viUser.name} (${viUser.stats.totalCalls} calls)`
                );
              }

              if (volunteer) {
                await volunteer.incrementCallStats(call.duration);
                console.log(
                  `Updated stats for volunteer after disconnect: ${volunteer.name} (${volunteer.stats.totalCalls} calls)`
                );
              }
            } else {
              console.log(
                `No ongoing database record found for call ${callId} or already ended`
              );
            }
          } catch (error) {
            console.error("Error updating call record on disconnect:", error);
          }

          // Notify the other party
          socket.to(roomId).emit("call_ended", {
            callId,
            duration,
            reason: "disconnection",
          });

          ongoingCalls.delete(callId);
          console.log(`Call ${callId} ended due to disconnection`);
        }
      }

      // Handle waiting calls
      for (const [callId, waitingCall] of waitingCalls.entries()) {
        if (waitingCall.viUser.socketId === socket.id) {
          waitingCalls.delete(callId);
          console.log(`Waiting call ${callId} cancelled due to disconnection`);
        }
      }
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});

export {};
