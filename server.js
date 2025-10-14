//import config from "./src/lib/env.js";

import { createServer } from "http";
import { Server } from "socket.io";
import next from "next";
import dbConnect from "./src/lib/db.js";
import Call from "./src/models/Call.js";
import User from "./src/models/User.js";
import mongoose from "mongoose";

const dev = process.env.NODE_ENV !== "production";
console.log("Environment:", {
  dev,
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT || port,
});
const hostname = dev ? "localhost" : "0.0.0.0";
const serverPort = process.env.PORT || port;

const app = next({ dev, hostname, port: serverPort });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? [
              "https://aechan-huend-gaash-web.vercel.app",
              "https://aechan-huend-gaash-web.onrender.com",
              "https://*.onrender.com", // Allow all Render subdomains
              "https://*.vercel.app", // Allow all Vercel subdomains
            ]
          : ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST"],
      credentials: true,
      allowedHeaders: ["*"],
    },
    transports: ["polling", "websocket"], // Ensure polling is available first
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    upgradeTimeout: 30000, // 30 seconds
    allowEIO3: true, // Support older clients if needed
  });

  // Store active volunteers and ongoing calls
  const activeVolunteers = new Map(); // socketId -> volunteerData
  const ongoingCalls = new Map(); // callId -> { viUser, volunteer, startTime }
  const waitingCalls = new Map(); // callId -> viUserData

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // User joins as VI User or Volunteer
    socket.on("join", (userData) => {
      console.log(
        "Join event received from:",
        userData?.name,
        "role:",
        userData?.role,
        "socketId:",
        socket.id
      );
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

        // Update socket ID in the call session and clear disconnect flag
        if (callSession.viUser.id === userData.id) {
          callSession.viUser.socketId = socket.id;
          callSession.viUser.disconnected = false;
          delete callSession.viUser.disconnectTime;
        } else if (callSession.volunteer.id === userData.id) {
          callSession.volunteer.socketId = socket.id;
          callSession.volunteer.disconnected = false;
          delete callSession.volunteer.disconnectTime;
        }

        console.log(`User ${userData.name} reconnected to call ${callId}`);

        // Notify that they're connected to the call
        socket.emit("call_connected", {
          callId,
          viUser: callSession.viUser,
          volunteer: callSession.volunteer,
          roomId,
        });

        // Notify the other party that user has reconnected
        socket.to(roomId).emit("user_reconnected", {
          userId: userData.id,
          userName: userData.name,
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
      console.log(
        "start_call received from:",
        socket.userData?.name,
        "socketId:",
        socket.id
      );
      console.log("Call data:", callData);

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

      console.log(
        "Added waiting call:",
        callId,
        "for user:",
        socket.userData.name
      );
      console.log("Available volunteers:", activeVolunteers.size);

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
        console.log("Looking for VI user socket:", waitingCall.viUser.socketId);
        console.log("VI user socket found:", !!viUserSocket);

        if (viUserSocket) {
          viUserSocket.join(roomId);

          // Notify VI user with call_connected event
          console.log("Sending call_connected to VI user");
          viUserSocket.emit("call_connected", {
            callId,
            viUser: callSession.viUser,
            volunteer: callSession.volunteer,
            roomId,
          });
        } else {
          console.error(
            "VI user socket not found! Cannot notify VI user of call connection"
          );
        }

        // Notify volunteer with call_connected event
        socket.emit("call_connected", {
          callId,
          viUser: callSession.viUser,
          volunteer: callSession.volunteer,
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
      console.log(
        `Peer ready signal from ${socket.id} (${socket.userData?.role}) in room ${data.roomId}`
      );

      const callId = data.roomId.replace("room_", "");
      const callSession = ongoingCalls.get(callId);

      if (callSession) {
        // Mark this peer as ready
        if (socket.userData.role === "VOLUNTEER") {
          callSession.volunteerReady = true;
        } else if (socket.userData.role === "VI_USER") {
          callSession.viUserReady = true;
        }

        console.log(
          `Call ${callId} readiness: volunteer=${
            callSession.volunteerReady || false
          }, viUser=${callSession.viUserReady || false}`
        );

        // If both peers are ready and no offer has been sent yet, trigger volunteer to create offer
        if (
          callSession.volunteerReady &&
          callSession.viUserReady &&
          !callSession.offerSent
        ) {
          console.log(
            `Both peers ready for call ${callId}, triggering offer creation`
          );
          callSession.offerSent = true;

          // Tell volunteer to create offer
          const volunteerSocket = io.sockets.sockets.get(
            callSession.volunteer.socketId
          );
          if (volunteerSocket) {
            volunteerSocket.emit("create-offer", { roomId: data.roomId });
          }
        }
      }

      // Forward the peer ready signal to other peers in the room
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

      // Handle ongoing calls with a delay to allow for reconnection
      for (const [callId, callSession] of ongoingCalls.entries()) {
        if (
          callSession.viUser.socketId === socket.id ||
          callSession.volunteer.socketId === socket.id
        ) {
          const roomId = `room_${callId}`;
          const userRole =
            callSession.viUser.socketId === socket.id ? "viUser" : "volunteer";

          console.log(
            `User ${userRole} disconnected from call ${callId}, waiting for reconnection...`
          );

          // Mark the user as disconnected but don't end the call immediately
          if (userRole === "viUser") {
            callSession.viUser.disconnected = true;
            callSession.viUser.disconnectTime = Date.now();
          } else {
            callSession.volunteer.disconnected = true;
            callSession.volunteer.disconnectTime = Date.now();
          }

          // Give user 30 seconds to reconnect before ending the call
          setTimeout(async () => {
            // Check if user has reconnected
            const currentSession = ongoingCalls.get(callId);
            if (!currentSession) {
              console.log(`Call ${callId} already ended`);
              return;
            }

            const userStillDisconnected =
              userRole === "viUser"
                ? currentSession.viUser.disconnected
                : currentSession.volunteer.disconnected;

            if (userStillDisconnected) {
              console.log(
                `User ${userRole} didn't reconnect to call ${callId}, ending call`
              );

              const duration = Date.now() - callSession.startTime;

              try {
                // Connect to database and end the call properly
                await dbConnect();
                console.log("Database connected for disconnection cleanup");

                // Find and update the call record
                const call = await Call.findOne({ callId });
                console.log(
                  "Database call record found for disconnect:",
                  !!call
                );

                if (call && call.status === "ongoing") {
                  // Determine who disconnected
                  const endedByUserId =
                    callSession.viUser.socketId === socket.id
                      ? callSession.viUser.id
                      : callSession.volunteer.id;

                  await call.endCall(
                    new mongoose.Types.ObjectId(endedByUserId)
                  );
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
                console.error(
                  "Error updating call record on disconnect:",
                  error
                );
              }

              // Notify the other party
              io.to(roomId).emit("call_ended", {
                callId,
                duration,
                reason: "disconnection",
                message: "The other participant disconnected",
              });

              ongoingCalls.delete(callId);
              console.log(
                `Call ${callId} ended due to disconnection after timeout`
              );
            }
          }, 30000); // 30 second timeout
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
      console.error("Server error:", err);
      process.exit(1);
    })
    .listen(serverPort, hostname, () => {
      console.log(`> Ready on http://${hostname}:${serverPort}`);
      console.log(`> Socket.IO server ready for connections`);
    });
});

export {};
