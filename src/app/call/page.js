"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, Suspense } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Camera, CameraOff } from "lucide-react";
import {
  playOutgoingCallSound,
  stopOutgoingCallSound,
  playCallConnectedSound,
  playCallEndedSound,
  stopAllCallSounds,
} from "@/lib/sounds";

function CallPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callId = searchParams.get("callId");
  const role = searchParams.get("role");

  const [socket, setSocket] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState("connecting"); // connecting, connected, ended
  const [partnerName, setPartnerName] = useState("");
  const [webrtcInitialized, setWebrtcInitialized] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState("");
  const [isRemoteVideoPlaying, setIsRemoteVideoPlaying] = useState(false);
  const [connectionDebug, setConnectionDebug] = useState("Initializing...");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const callStatusRef = useRef("connecting");

  // Helper function to update both state and ref
  const updateCallStatus = (newStatus) => {
    setCallStatus(newStatus);
    callStatusRef.current = newStatus;
  };

  // Initialize socket connection
  useEffect(() => {
    if (!session?.user || !callId) return;

    console.log("Initializing call page for:", {
      callId,
      role,
      userId: session.user.id,
    });

    // Play outgoing call sound when starting to connect
    playOutgoingCallSound().catch(console.warn);

    const newSocket = io("http://localhost:3000", {
      transports: ["polling", "websocket"],
    });

    newSocket.on("connect", () => {
      console.log("Connected to call socket:", newSocket.id);
      setSocket(newSocket);

      // Emit join event like in dashboards
      newSocket.emit("join", {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
        language: session.user.language || "en",
      });

      // Join the call room immediately if we have callId
      const roomId = `room_${callId}`;
      console.log("Joining room:", roomId);
      newSocket.emit("joinRoom", roomId);
    });

    // Listen for call events
    newSocket.on("call_connected", (data) => {
      console.log("Call connected event received:", data);
      updateCallStatus("connected");
      setConnectionDebug("Call successfully established");
      clearTimeout(connectionTimeout); // Clear connection timeout

      // Play call connected sound
      playCallConnectedSound().catch(console.warn);

      // Set partner name based on role
      if (role === "volunteer") {
        setPartnerName(data.viUser?.name || "VI User");
      } else {
        setPartnerName(data.volunteer?.name || "Volunteer");
      }

      setCurrentRoomId(data.roomId);

      // Initialize WebRTC now that we have room info
      if (!webrtcInitialized) {
        // Add a delay to ensure both peers are ready
        console.log("Scheduling WebRTC initialization for", role);
        setTimeout(() => initializeWebRTC(data.roomId, newSocket), 1000);
      }
    });

    // Add timeout for connection attempt
    const connectionTimeout = setTimeout(() => {
      if (callStatus === "connecting") {
        console.log("Connection timeout reached");
        setConnectionDebug(
          "Connection timeout. This call may have expired or been cancelled."
        );
        setTimeout(() => {
          router.push(
            role === "volunteer" ? "/dashboard/volunteer" : "/dashboard/vi-user"
          );
        }, 5000);
      }
    }, 30000); // 30 second timeout

    newSocket.on("call_accepted", (data) => {
      console.log("Call accepted event received:", data);
      updateCallStatus("connected");
      setPartnerName(data.volunteer?.name || "Volunteer");
      setCurrentRoomId(data.roomId);

      // Play call connected sound
      playCallConnectedSound().catch(console.warn);

      if (!webrtcInitialized) {
        // Add a delay to ensure both peers are ready
        console.log("Scheduling WebRTC initialization for", role);
        setTimeout(() => initializeWebRTC(data.roomId, newSocket), 1000);
      }
    });

    newSocket.on("call_ended", (data) => {
      console.log("Call ended:", data);
      updateCallStatus("ended");
      clearTimeout(connectionTimeout); // Clear connection timeout

      // Play call ended sound
      playCallEndedSound().catch(console.warn);

      cleanup();
      setTimeout(() => {
        router.push(
          role === "volunteer" ? "/dashboard/volunteer" : "/dashboard/vi-user"
        );
      }, 3000);
    });

    // Handle socket disconnection
    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      setConnectionDebug(`Disconnected: ${reason}. Attempting to reconnect...`);

      // Don't immediately end call on disconnect - server will handle timeouts
      // Only end call if it was an intentional disconnect or connection error persists
    });

    // Handle reconnection events
    newSocket.on("user_reconnected", (data) => {
      console.log("Other user reconnected:", data.userName);
      setConnectionDebug(`${data.userName} reconnected to the call`);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setConnectionDebug(`Connection error: ${error.message}`);
    });

    // WebRTC signaling - using arrow functions to maintain proper scope
    const handleOfferWrapper = (data) => handleOffer(data, newSocket);
    const handleAnswerWrapper = (data) => handleAnswer(data, newSocket);
    const handleIceCandidateWrapper = (data) =>
      handleIceCandidate(data, newSocket);

    // Add peer ready signaling
    const handlePeerReady = (data) => {
      console.log("Peer ready received:", data);
    };

    // Handle server request to create offer
    const handleCreateOffer = async (data) => {
      console.log("Server requesting offer creation for room:", data.roomId);
      if (peerConnectionRef.current) {
        try {
          const offer = await peerConnectionRef.current.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true,
          });
          await peerConnectionRef.current.setLocalDescription(offer);
          console.log("Sending offer to room:", data.roomId);

          if (newSocket?.connected) {
            newSocket.emit("offer", {
              roomId: data.roomId,
              offer,
            });
          } else {
            console.error("Socket not connected for offer creation");
          }
        } catch (offerError) {
          console.error("Error creating/sending offer:", offerError);
        }
      } else {
        console.error("No peer connection available for offer creation");
      }
    };

    newSocket.on("offer", handleOfferWrapper);
    newSocket.on("answer", handleAnswerWrapper);
    newSocket.on("ice-candidate", handleIceCandidateWrapper);
    newSocket.on("peer-ready", handlePeerReady);
    newSocket.on("create-offer", handleCreateOffer);

    return () => {
      console.log("Cleaning up call page");
      clearTimeout(connectionTimeout);
      stopAllCallSounds(); // Clean up all call sounds
      cleanup();
      newSocket.off("offer", handleOfferWrapper);
      newSocket.off("answer", handleAnswerWrapper);
      newSocket.off("ice-candidate", handleIceCandidateWrapper);
      newSocket.off("peer-ready", handlePeerReady);
      newSocket.off("create-offer", handleCreateOffer);
      newSocket.disconnect();
    };
  }, [session?.user?.id, callId]);

  // Test connectivity to ICE servers before attempting WebRTC connection
  const testICEServerConnectivity = async () => {
    const results = {
      stunServers: { tested: 0, reachable: 0 },
      turnServers: { tested: 0, reachable: 0 },
      overallHealth: "unknown",
    };

    const testServers = [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
      "stun:stun.services.mozilla.com",
    ];

    for (const server of testServers) {
      results.stunServers.tested++;
      try {
        // Create a temporary peer connection to test STUN server
        const testPC = new RTCPeerConnection({
          iceServers: [{ urls: server }],
          iceCandidatePoolSize: 1,
        });

        // Wait for candidate gathering or timeout
        const candidatePromise = new Promise((resolve) => {
          let hasCandidate = false;
          const timeout = setTimeout(() => {
            if (!hasCandidate) resolve(false);
          }, 3000);

          testPC.onicecandidate = (event) => {
            if (event.candidate && !hasCandidate) {
              hasCandidate = true;
              clearTimeout(timeout);
              resolve(true);
            }
          };

          // Start gathering
          testPC
            .createOffer()
            .then((offer) => testPC.setLocalDescription(offer));
        });

        if (await candidatePromise) {
          results.stunServers.reachable++;
          console.log(`✅ STUN server reachable: ${server}`);
        } else {
          console.log(`❌ STUN server unreachable: ${server}`);
        }

        testPC.close();
      } catch (error) {
        console.log(`❌ STUN server test failed: ${server}`, error);
      }
    }

    // Determine overall health
    const stunHealthPercent =
      results.stunServers.tested > 0
        ? (results.stunServers.reachable / results.stunServers.tested) * 100
        : 0;

    if (stunHealthPercent >= 75) {
      results.overallHealth = "good";
    } else if (stunHealthPercent >= 25) {
      results.overallHealth = "fair";
    } else {
      results.overallHealth = "poor";
    }

    console.log(
      `🏥 Network health: ${results.overallHealth} (${stunHealthPercent.toFixed(
        0
      )}% STUN servers reachable)`
    );
    return results;
  };

  const initializeWebRTC = async (roomId, socketInstance) => {
    if (webrtcInitialized || peerConnectionRef.current) {
      console.log("WebRTC already initialized, skipping");
      return;
    }

    try {
      console.log("🚀 Initializing WebRTC for room:", roomId);
      setConnectionDebug("🚀 Initializing connection...");
      setWebrtcInitialized(true);

      // Test network connectivity to ICE servers before starting WebRTC
      console.log("🌐 Testing network connectivity...");
      const connectivityResults = await testICEServerConnectivity();
      console.log("📊 Connectivity test results:", connectivityResults);

      // Get user media with optimized constraints for reduced lag
      let stream;
      try {
        // Optimized video constraints for better performance
        const videoConstraints = {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 30 }, // Lower framerate reduces bandwidth
          facingMode: "user",
        };

        // Optimized audio constraints
        const audioConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1, // Mono audio for lower bandwidth
        };

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });
        console.log("Got optimized user media stream");
      } catch (mediaError) {
        console.error("Error accessing media devices:", mediaError);

        // Try audio only if video fails
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
          });
          console.log("Got audio-only stream");
          setIsVideoOff(true);
        } catch (audioError) {
          console.error("Error accessing audio:", audioError);
          throw new Error(
            "Could not access camera or microphone. Please check permissions."
          );
        }
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection with enhanced configuration for better connectivity
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          // Multiple STUN servers for redundancy
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          { urls: "stun:stun.services.mozilla.com" },
          // Additional public STUN servers
          { urls: "stun:stun.stunprotocol.org:3478" },
          { urls: "stun:stun.cloudflare.com:3478" },
          // Free TURN servers with multiple transports
          {
            urls: [
              "turn:openrelay.metered.ca:80",
              "turn:openrelay.metered.ca:443",
              "turns:openrelay.metered.ca:443",
            ],
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          // Additional free TURN servers
          {
            urls: ["turn:relay1.expressturn.com:3478"],
            username: "efSLANXO7c9jbwRRHR",
            credential: "4sKqnIPBWuqoT7du",
          },
        ],
        iceCandidatePoolSize: 15, // Increased for better connectivity
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "all", // Allow both STUN and TURN
      });

      console.log("Created peer connection");
      peerConnectionRef.current = peerConnection;

      // Set codec preferences for better performance
      const transceivers = peerConnection.getTransceivers();
      transceivers.forEach((transceiver) => {
        const capabilities = RTCRtpReceiver.getCapabilities(
          transceiver.receiver.track?.kind
        );
        if (capabilities && capabilities.codecs) {
          // Prefer H.264 for video (better hardware acceleration)
          if (transceiver.receiver.track?.kind === "video") {
            const h264Codecs = capabilities.codecs.filter((codec) =>
              codec.mimeType.toLowerCase().includes("h264")
            );
            if (h264Codecs.length > 0) {
              transceiver.setCodecPreferences([
                ...h264Codecs,
                ...capabilities.codecs,
              ]);
            }
          }

          // Prefer Opus for audio (lower latency)
          if (transceiver.receiver.track?.kind === "audio") {
            const opusCodecs = capabilities.codecs.filter((codec) =>
              codec.mimeType.toLowerCase().includes("opus")
            );
            if (opusCodecs.length > 0) {
              transceiver.setCodecPreferences([
                ...opusCodecs,
                ...capabilities.codecs,
              ]);
            }
          }
        }
      });

      // Add local stream to peer connection with optimized parameters
      stream.getTracks().forEach((track) => {
        const sender = peerConnection.addTrack(track, stream);
        console.log("Added track:", track.kind);

        // Apply bandwidth constraints for video tracks
        if (track.kind === "video") {
          const params = sender.getParameters();
          if (!params.encodings) {
            params.encodings = [{}];
          }

          // Set maximum bitrate to prevent network congestion
          params.encodings[0].maxBitrate = 500000; // 500 kbps max for video
          params.encodings[0].maxFramerate = 15; // Limit to 15 fps

          sender
            .setParameters(params)
            .catch((err) =>
              console.warn("Could not set video encoding parameters:", err)
            );
        }

        // Apply audio constraints
        if (track.kind === "audio") {
          const params = sender.getParameters();
          if (!params.encodings) {
            params.encodings = [{}];
          }

          // Set audio bitrate
          params.encodings[0].maxBitrate = 64000; // 64 kbps for audio

          sender
            .setParameters(params)
            .catch((err) =>
              console.warn("Could not set audio encoding parameters:", err)
            );
        }
      });

      // Handle remote stream - improved handling
      peerConnection.ontrack = (event) => {
        console.log("Received remote stream:", event.streams.length, "streams");
        console.log(
          "Remote stream tracks:",
          event.streams[0]?.getTracks().map((t) => t.kind)
        );

        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          console.log("Setting remote stream to video element");
          console.log("Remote stream active:", remoteStream.active);
          console.log(
            "Remote stream tracks:",
            remoteStream.getTracks().map((t) => `${t.kind}:${t.enabled}`)
          );

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;

            // Force video to play after stream is loaded
            remoteVideoRef.current.onloadedmetadata = () => {
              console.log("Remote video metadata loaded, attempting to play");
              setIsRemoteVideoPlaying(true); // Assume it will play
              remoteVideoRef.current.play().catch((err) => {
                console.error("Error playing remote video:", err);
                setIsRemoteVideoPlaying(false);
              });
            };

            // Track when remote video is actually playing
            remoteVideoRef.current.onplaying = () => {
              console.log("Remote video started playing");
              setIsRemoteVideoPlaying(true);
            };

            remoteVideoRef.current.onpause = () => {
              console.log("Remote video paused");
              setIsRemoteVideoPlaying(false);
            };

            remoteVideoRef.current.onwaiting = () => {
              console.log("Remote video waiting for data");
            };

            remoteVideoRef.current.oncanplay = () => {
              console.log("Remote video can start playing");
            };
          }
        } else {
          console.warn("No remote stream received in ontrack event");
        }
      };

      // Enhanced ICE candidate handling with detailed logging
      let candidateCount = 0;
      const candidateTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          candidateCount++;
          const candidateType = event.candidate.type || "unknown";
          candidateTypes[candidateType] =
            (candidateTypes[candidateType] || 0) + 1;

          const activeSocket = socketInstance || socket;
          if (activeSocket?.connected) {
            console.log(
              `🧊 Sending ICE candidate #${candidateCount} (${candidateType}):`,
              {
                type: event.candidate.type,
                protocol: event.candidate.protocol,
                address: event.candidate.address?.substring(0, 10) + "...",
                port: event.candidate.port,
                priority: event.candidate.priority,
                foundation: event.candidate.foundation,
              }
            );

            activeSocket.emit("ice-candidate", {
              roomId,
              candidate: event.candidate,
            });
          } else {
            console.warn("⚠️ Socket not available for ICE candidate");
          }
        } else {
          console.log(
            `✅ ICE candidate gathering complete! Total: ${candidateCount} candidates`,
            candidateTypes
          );
          setConnectionDebug(`🧊 Gathered ${candidateCount} ICE candidates`);

          // Log candidate gathering summary
          const totalTypes = Object.values(candidateTypes).reduce(
            (a, b) => a + b,
            0
          );
          if (totalTypes === 0) {
            console.warn(
              "⚠️ No ICE candidates gathered - network connectivity issue"
            );
            setConnectionDebug("⚠️ No ICE candidates - check network");
          } else if (candidateTypes.relay === 0 && candidateTypes.srflx === 0) {
            console.warn(
              "⚠️ Only host candidates found - may have NAT/firewall issues"
            );
            setConnectionDebug(
              "⚠️ Limited connectivity - only local candidates"
            );
          } else {
            console.log(
              "✅ Good ICE candidate variety - connection should work"
            );
          }
        }
      };

      // Monitor ICE gathering state changes
      peerConnection.onicegatheringstatechange = () => {
        const gatheringState = peerConnection.iceGatheringState;
        console.log(`🔍 ICE gathering state: ${gatheringState}`);

        if (gatheringState === "gathering") {
          setConnectionDebug("🔍 Gathering network paths...");
        } else if (gatheringState === "complete") {
          setConnectionDebug("🧊 Network discovery complete");
          console.log("✅ ICE gathering completed successfully");
        } else if (gatheringState === "new") {
          console.log("🆕 Starting ICE gathering process");
        }
      };

      // Enhanced WebRTC connection state monitoring
      let connectionRetries = 0;
      const maxRetries = 3;

      peerConnection.onconnectionstatechange = async () => {
        const connectionState = peerConnection.connectionState;
        const iceState = peerConnection.iceConnectionState;
        const signalingState = peerConnection.signalingState;

        console.log(
          `🔗 WebRTC Connection: ${connectionState}, ICE: ${iceState}, Signaling: ${signalingState}`
        );
        setConnectionDebug(`WebRTC: ${connectionState}`);

        if (connectionState === "connected") {
          console.log("✅ WebRTC connection established successfully");
          setConnectionDebug("✅ Connected successfully");
          connectionRetries = 0; // Reset retry counter on success

          // Log successful connection stats
          peerConnection.getStats().then((stats) => {
            stats.forEach((report) => {
              if (report.type === "transport") {
                console.log("📡 Transport info:", {
                  dtlsState: report.dtlsState,
                  selectedCandidatePairId: report.selectedCandidatePairId,
                });
              } else if (
                report.type === "candidate-pair" &&
                report.state === "succeeded"
              ) {
                console.log("🎯 Active connection path:", {
                  localCandidate: report.localCandidateId,
                  remoteCandidate: report.remoteCandidateId,
                  currentRoundTripTime: report.currentRoundTripTime,
                  totalRoundTripTime: report.totalRoundTripTime,
                });
              }
            });
          });

          // Start monitoring network quality for adaptive bitrate
          startNetworkQualityMonitoring();
        } else if (connectionState === "failed") {
          console.error("❌ WebRTC connection failed");

          // Enhanced failure diagnostics
          peerConnection
            .getStats()
            .then((stats) => {
              const diagnostics = {
                certificates: 0,
                dataChannels: 0,
                inboundRtp: 0,
                outboundRtp: 0,
                candidates: 0,
                candidatePairs: 0,
                transports: 0,
              };

              stats.forEach((report) => {
                if (diagnostics.hasOwnProperty(report.type.replace(/-/g, ""))) {
                  diagnostics[report.type.replace(/-/g, "")]++;
                }

                // Log specific failure reasons
                if (
                  report.type === "transport" &&
                  report.dtlsState === "failed"
                ) {
                  console.error("🚫 DTLS transport failed:", report);
                } else if (
                  report.type === "certificate" &&
                  report.fingerprint
                ) {
                  console.log(
                    "📜 Certificate fingerprint:",
                    report.fingerprint
                  );
                }
              });

              console.log("📊 Connection diagnostics:", diagnostics);

              // Provide specific guidance
              if (diagnostics.transports === 0) {
                setConnectionDebug(
                  "❌ No transport layer - severe connectivity issue"
                );
              } else if (diagnostics.candidatePairs === 0) {
                setConnectionDebug(
                  "❌ No candidate pairs - ICE gathering failed"
                );
              } else {
                setConnectionDebug(
                  "❌ Connection established but failed - protocol issue"
                );
              }
            })
            .catch((err) => {
              console.error("Error getting connection diagnostics:", err);
            });

          if (connectionRetries < maxRetries) {
            connectionRetries++;
            console.log(
              `🔄 Attempting connection recovery ${connectionRetries}/${maxRetries}`
            );
            setConnectionDebug(
              `🔄 Connection failed - Retrying (${connectionRetries}/${maxRetries})`
            );

            // Attempt to restart ICE
            try {
              if (role === "volunteer") {
                console.log("🎯 Volunteer creating new offer for retry");
                const offer = await peerConnection.createOffer({
                  iceRestart: true,
                });
                await peerConnection.setLocalDescription(offer);

                if (socket?.connected) {
                  socket.emit("offer", {
                    roomId: currentRoomId,
                    offer,
                  });
                }
              }
            } catch (retryError) {
              console.error("Error during connection retry:", retryError);
            }
          } else {
            console.error("Max connection retries reached");
            setConnectionDebug(
              "❌ Connection failed - Unable to establish connection"
            );

            // Show user-friendly error and option to retry with helpful context
            setTimeout(() => {
              const message =
                "Connection failed after multiple attempts.\n\n" +
                "This could be due to:\n" +
                "• Firewall or network restrictions\n" +
                "• Poor internet connectivity\n" +
                "• Server issues\n\n" +
                "Check the browser console for detailed diagnostics.\n\n" +
                "Would you like to try again?";

              if (confirm(message)) {
                location.reload();
              } else {
                updateCallStatus("ended");
                cleanup();
                router.push(
                  role === "volunteer"
                    ? "/dashboard/volunteer"
                    : "/dashboard/vi-user"
                );
              }
            }, 2000);
          }
        } else if (peerConnection.connectionState === "disconnected") {
          console.log("WebRTC connection disconnected");
          setConnectionDebug("Connection lost - attempting to reconnect");

          // Give some time for potential reconnection before ending call
          setTimeout(() => {
            if (
              peerConnection.connectionState === "disconnected" &&
              callStatusRef.current === "connected"
            ) {
              console.log("Connection still lost after timeout, ending call");
              updateCallStatus("ended");
              cleanup();
              router.push(
                role === "volunteer"
                  ? "/dashboard/volunteer"
                  : "/dashboard/vi-user"
              );
            }
          }, 10000); // Wait 10 seconds for reconnection
        } else if (peerConnection.connectionState === "connecting") {
          setConnectionDebug("Establishing connection...");
        } else if (peerConnection.connectionState === "checking") {
          setConnectionDebug("Checking connection...");
        }
      };

      // Network quality monitoring function
      const startNetworkQualityMonitoring = () => {
        const checkNetworkQuality = async () => {
          try {
            const stats = await peerConnection.getStats();
            let videoSender = null;

            stats.forEach((stat) => {
              if (stat.type === "outbound-rtp" && stat.mediaType === "video") {
                const bytesSent = stat.bytesSent || 0;
                const packetsLost = stat.packetsLost || 0;
                const jitter = stat.jitter || 0;

                // Simple adaptive bitrate based on packet loss
                if (packetsLost > 10) {
                  // High packet loss - reduce quality
                  videoSender = peerConnection
                    .getSenders()
                    .find((s) => s.track && s.track.kind === "video");

                  if (videoSender) {
                    const params = videoSender.getParameters();
                    if (params.encodings && params.encodings[0]) {
                      params.encodings[0].maxBitrate = Math.max(
                        200000,
                        params.encodings[0].maxBitrate * 0.8
                      );
                      videoSender.setParameters(params);
                      console.log(
                        "Reduced bitrate due to packet loss:",
                        params.encodings[0].maxBitrate
                      );
                    }
                  }
                }
              }
            });
          } catch (error) {
            console.warn("Error monitoring network quality:", error);
          }
        };

        // Check network quality every 5 seconds
        const qualityInterval = setInterval(checkNetworkQuality, 5000);

        // Store interval for cleanup
        peerConnection.qualityInterval = qualityInterval;
      };

      // Enhanced ICE connection state monitoring with detailed diagnostics
      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        const connectionState = peerConnection.connectionState;
        const signalingState = peerConnection.signalingState;

        console.log(
          `ICE connection state: ${iceState}, Connection: ${connectionState}, Signaling: ${signalingState}`
        );
        setConnectionDebug(`ICE: ${iceState} | Connection: ${connectionState}`);

        if (iceState === "connected" || iceState === "completed") {
          console.log("✅ ICE connection established - peers can communicate");

          // Log ICE candidate pairs that worked
          peerConnection.getStats().then((stats) => {
            stats.forEach((report) => {
              if (
                report.type === "candidate-pair" &&
                report.state === "succeeded"
              ) {
                console.log("🔗 Successful candidate pair:", {
                  localCandidate: report.localCandidateId,
                  remoteCandidate: report.remoteCandidateId,
                  bytesReceived: report.bytesReceived,
                  bytesSent: report.bytesSent,
                });
              }
            });
          });
        } else if (iceState === "failed") {
          console.error("❌ ICE connection failed");
          setConnectionDebug("❌ ICE connection failed - diagnosing...");

          // Enhanced diagnostics for ICE failure
          peerConnection
            .getStats()
            .then((stats) => {
              let stunAttempts = 0;
              let turnAttempts = 0;
              let localCandidates = 0;
              let remoteCandidates = 0;

              stats.forEach((report) => {
                if (report.type === "local-candidate") {
                  localCandidates++;
                  console.log("📍 Local candidate:", {
                    type: report.candidateType,
                    protocol: report.protocol,
                    address: report.address,
                    port: report.port,
                  });
                } else if (report.type === "remote-candidate") {
                  remoteCandidates++;
                  console.log("📍 Remote candidate:", {
                    type: report.candidateType,
                    protocol: report.protocol,
                    address: report.address,
                    port: report.port,
                  });
                } else if (report.type === "candidate-pair") {
                  if (report.state === "failed") {
                    console.log("💥 Failed candidate pair:", {
                      state: report.state,
                      nominated: report.nominated,
                      localCandidate: report.localCandidateId,
                      remoteCandidate: report.remoteCandidateId,
                    });
                  }
                }
              });

              console.log(
                `📊 ICE Statistics: ${localCandidates} local, ${remoteCandidates} remote candidates`
              );

              // Provide specific guidance based on candidate types
              if (localCandidates === 0) {
                setConnectionDebug(
                  "❌ No local ICE candidates - check network connectivity"
                );
              } else if (remoteCandidates === 0) {
                setConnectionDebug(
                  "❌ No remote ICE candidates - peer connectivity issue"
                );
              } else {
                setConnectionDebug(
                  "❌ ICE candidates found but connection failed - likely firewall/NAT issue"
                );
              }
            })
            .catch((err) => {
              console.error("Error getting ICE stats:", err);
            });

          // Auto-end call if ICE fails and we're still connected
          if (callStatusRef.current === "connected") {
            console.log("Auto-ending call due to ICE failure in 5 seconds...");
            setTimeout(() => {
              if (callStatusRef.current === "connected") {
                updateCallStatus("ended");
                cleanup();
                router.push(
                  role === "volunteer"
                    ? "/dashboard/volunteer"
                    : "/dashboard/vi-user"
                );
              }
            }, 5000);
          }
        } else if (iceState === "disconnected") {
          console.log("⚠️ ICE connection disconnected - may recover");
          setConnectionDebug(
            "⚠️ ICE disconnected - checking for reconnection..."
          );
        } else if (iceState === "checking") {
          console.log("🔍 ICE connection checking - gathering candidates");
          setConnectionDebug("🔍 Establishing connection...");
        } else if (iceState === "new") {
          console.log("🆕 ICE connection new - starting process");
          setConnectionDebug("🆕 Initializing connection...");
        }
      };

      // Coordinate offer creation - always let volunteer create offer after both are ready
      console.log("WebRTC initialization completed for role:", role);

      const activeSocket = socketInstance || socket;
      if (activeSocket?.connected) {
        activeSocket.emit("peer-ready", { roomId, role });
        console.log("Emitted peer-ready for role:", role);
      }

      console.log("WebRTC setup completed successfully");
    } catch (error) {
      console.error("Error initializing WebRTC:", error);
      setWebrtcInitialized(false);
      updateCallStatus("connecting");

      // Show user-friendly error message
      if (error.message.includes("permission")) {
        alert(
          "Camera/microphone access denied. Please allow permissions and refresh the page."
        );
      } else if (error.message.includes("not found")) {
        alert(
          "No camera or microphone found. Please connect a device and refresh."
        );
      } else {
        alert("Error setting up video call: " + error.message);
      }
    }
  };

  const handleOffer = async (data, socketInstance) => {
    try {
      console.log("Received offer from:", data.roomId);

      // If peer connection isn't ready, initialize it first
      if (!peerConnectionRef.current) {
        console.log("Peer connection not ready, initializing WebRTC first...");
        await initializeWebRTC(data.roomId || currentRoomId, socketInstance);

        // Give a short delay for initialization to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (!peerConnectionRef.current) {
          console.error("Failed to initialize peer connection for offer");
          return;
        }
      }

      console.log("Setting remote description from offer");
      await peerConnectionRef.current.setRemoteDescription(data.offer);

      console.log("Creating answer");
      const answer = await peerConnectionRef.current.createAnswer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      });

      console.log("Setting local description (answer)");
      await peerConnectionRef.current.setLocalDescription(answer);

      console.log("Sending answer to room:", data.roomId);
      const activeSocket = socketInstance || socket;
      if (activeSocket?.connected) {
        activeSocket.emit("answer", {
          roomId: data.roomId,
          answer,
        });
      } else {
        console.error("Socket not available for answer");
      }
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  };

  const handleAnswer = async (data, socketInstance) => {
    try {
      console.log("Received answer from:", data.roomId);
      if (!peerConnectionRef.current) {
        console.error("No peer connection available for answer");
        return;
      }

      console.log("Setting remote description from answer");
      await peerConnectionRef.current.setRemoteDescription(data.answer);
      console.log("Remote description set successfully");
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  };

  const handleIceCandidate = async (data, socketInstance) => {
    try {
      console.log(
        "Received ICE candidate:",
        data.candidate?.type || "unknown type"
      );
      if (!peerConnectionRef.current) {
        console.error("No peer connection available for ICE candidate");
        return;
      }

      if (peerConnectionRef.current.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(data.candidate);
        console.log("ICE candidate added successfully");
      } else {
        console.warn("Remote description not set yet, queueing ICE candidate");
        // Could implement a queue here if needed
      }
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
      // ICE candidate errors are usually non-fatal, so we just log them
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const endCall = () => {
    console.log("Ending call initiated by user");

    // Stop outgoing call sounds immediately when user ends call
    stopOutgoingCallSound();

    if (socket && callId) {
      console.log("Sending end_call signal to server");
      socket.emit("end_call", { callId });
    }

    // Set status to ending to show user feedback
    updateCallStatus("ending");

    // Fallback: if server doesn't respond in 5 seconds, force end the call
    setTimeout(() => {
      if (callStatusRef.current === "ending") {
        console.log("Force ending call due to timeout");
        updateCallStatus("ended");
        cleanup();
        router.push(
          role === "volunteer" ? "/dashboard/volunteer" : "/dashboard/vi-user"
        );
      }
    }, 5000);

    // Don't immediately cleanup or redirect - let the server handle it
    // The cleanup and redirect will happen when we receive the call_ended event
  };

  const cleanup = () => {
    console.log("Cleaning up WebRTC resources");

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log("Stopped track:", track.kind);
      });
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      // Clear quality monitoring interval
      if (peerConnectionRef.current.qualityInterval) {
        clearInterval(peerConnectionRef.current.qualityInterval);
      }

      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset state
    setWebrtcInitialized(false);
    setCurrentRoomId("");
    setIsRemoteVideoPlaying(false);

    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading call...</div>
      </div>
    );
  }

  if (!session) {
    router.push("/auth/signin");
    return null;
  }

  if (!callId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Invalid call ID</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Call status header */}
      <div className="bg-gray-800 p-4 text-center">
        <div className="text-lg font-semibold">
          {callStatus === "connecting" && "Connecting to call..."}
          {callStatus === "connected" && `Connected with ${partnerName}`}
          {callStatus === "ending" && "Ending call..."}
          {callStatus === "ended" && "Call ended"}
        </div>
        {callStatus === "connected" && (
          <div className="text-sm text-gray-400">Call ID: {callId}</div>
        )}
        {connectionDebug && callStatus === "connecting" && (
          <div className="text-xs text-yellow-400">{connectionDebug}</div>
        )}
      </div>

      {/* Video container */}
      <div className="relative h-screen">
        {/* Remote video (main) */}
        <div className="relative w-full h-full bg-gray-800">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            controls={false}
            preload="metadata"
            className="w-full h-full object-cover"
            style={{
              background: "#1f2937",
              display: isRemoteVideoPlaying ? "block" : "block", // Always show video element
            }}
            aria-label="Remote participant video"
            onLoadStart={() => console.log("Remote video load started")}
            onCanPlay={() => console.log("Remote video can play")}
            onPlaying={() => {
              console.log("Remote video playing");
              setIsRemoteVideoPlaying(true);
            }}
            onWaiting={() => console.log("Remote video waiting")}
            onStalled={() => console.log("Remote video stalled")}
            onError={(e) => console.error("Remote video error:", e)}
            // Optimizations for better performance
            disablePictureInPicture={true}
            disableRemotePlayback={true}
          >
            <track
              kind="captions"
              srcLang="en"
              label="English captions"
              default
            />
          </video>

          {/* No remote video fallback */}
          {!isRemoteVideoPlaying && callStatus === "connected" && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-800/80 pointer-events-none">
              <div className="text-center">
                <div className="text-6xl mb-4">📹</div>
                <div className="text-lg">
                  Waiting for {partnerName || "participant"}'s video...
                </div>
                <div className="text-sm mt-2">
                  Check your connection and camera permissions
                </div>
                <div className="text-xs mt-1 text-gray-500">
                  Debug: {connectionDebug}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Local video (picture-in-picture) */}
        <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-600">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            preload="metadata"
            className="w-full h-full object-cover"
            aria-label="Your video preview"
            // Optimizations for local video
            disablePictureInPicture={true}
            disableRemotePlayback={true}
            onError={(e) => console.error("Local video error:", e)}
          >
            <track
              kind="captions"
              srcLang="en"
              label="English captions"
              default
            />
          </video>
        </div>

        {/* Call controls - Clean & Professional */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <div className="flex items-center gap-5 bg-gray-900/80 backdrop-blur-md px-5 py-3 rounded-full border border-gray-700 shadow-xl">
            {/* Mute/Unmute Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isMuted
                  ? "bg-red-600 hover:bg-red-700 text-white ring-red-400"
                  : "bg-gray-700 hover:bg-gray-600 text-white ring-gray-500"
              }`}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </Button>

            {/* Video On/Off Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isVideoOff
                  ? "bg-red-600 hover:bg-red-700 text-white ring-red-400"
                  : "bg-gray-700 hover:bg-gray-600 text-white ring-gray-500"
              }`}
              aria-label={isVideoOff ? "Turn camera on" : "Turn camera off"}
            >
              {isVideoOff ? <CameraOff size={22} /> : <Camera size={22} />}
            </Button>

            {/* End Call Button */}
            <Button
              variant="destructive"
              size="icon"
              onClick={endCall}
              className="w-12 h-12 rounded-full bg-red-700 hover:bg-red-800 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ring-red-500"
              aria-label="End call"
            >
              <PhoneOff size={22} />
            </Button>
          </div>
        </div>

        {/* Connection status */}
        {callStatus === "connecting" && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <div className="text-xl">Connecting to call...</div>
              <div className="text-gray-400">
                Please wait while we establish the connection
              </div>
            </div>
          </div>
        )}

        {callStatus === "ending" && (
          <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
              <div className="text-xl">Ending call...</div>
              <div className="text-gray-400">
                Please wait while we end the call for both participants
              </div>
            </div>
          </div>
        )}

        {callStatus === "ended" && (
          <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center">
            <div className="text-center">
              <PhoneOff size={48} className="mx-auto mb-4 text-red-500" />
              <div className="text-xl">Call Ended</div>
              <div className="text-gray-400">
                You will be redirected shortly...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CallPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          Loading...
        </div>
      }
    >
      <CallPageContent />
    </Suspense>
  );
}
