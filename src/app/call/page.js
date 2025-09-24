"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Camera, CameraOff } from "lucide-react";

export default function CallPage() {
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

      // Set up fallback room for direct call page access
      setTimeout(() => {
        if (callStatus === "connecting" && !currentRoomId) {
          console.log("Setting up fallback room");
          const fallbackRoomId = `room_${callId}`;
          setCurrentRoomId(fallbackRoomId);
          updateCallStatus("connected");
          // Initialize WebRTC after room is set
          setTimeout(() => {
            if (!webrtcInitialized) {
              initializeWebRTC(fallbackRoomId, newSocket);
            }
          }, 500);
        }
      }, 3000);
    });

    // Listen for call events
    newSocket.on("call_connected", (data) => {
      console.log("Call connected event received:", data);
      updateCallStatus("connected");

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

    newSocket.on("call_accepted", (data) => {
      console.log("Call accepted event received:", data);
      updateCallStatus("connected");
      setPartnerName(data.volunteer?.name || "Volunteer");
      setCurrentRoomId(data.roomId);

      if (!webrtcInitialized) {
        // Add a delay to ensure both peers are ready
        console.log("Scheduling WebRTC initialization for", role);
        setTimeout(() => initializeWebRTC(data.roomId, newSocket), 1000);
      }
    });

    newSocket.on("call_ended", (data) => {
      console.log("Call ended:", data);
      updateCallStatus("ended");
      cleanup();
      setTimeout(() => {
        router.push(
          role === "volunteer" ? "/dashboard/volunteer" : "/dashboard/vi-user"
        );
      }, 3000);
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

    newSocket.on("offer", handleOfferWrapper);
    newSocket.on("answer", handleAnswerWrapper);
    newSocket.on("ice-candidate", handleIceCandidateWrapper);
    newSocket.on("peer-ready", handlePeerReady);

    return () => {
      console.log("Cleaning up call page");
      cleanup();
      newSocket.off("offer", handleOfferWrapper);
      newSocket.off("answer", handleAnswerWrapper);
      newSocket.off("ice-candidate", handleIceCandidateWrapper);
      newSocket.off("peer-ready", handlePeerReady);
      newSocket.disconnect();
    };
  }, [session?.user?.id, callId]);

  const initializeWebRTC = async (roomId, socketInstance) => {
    if (webrtcInitialized || peerConnectionRef.current) {
      console.log("WebRTC already initialized, skipping");
      return;
    }

    try {
      console.log("Initializing WebRTC for room:", roomId);
      setWebrtcInitialized(true);

      // Get user media with error handling
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("Got user media stream");
      } catch (mediaError) {
        console.error("Error accessing media devices:", mediaError);

        // Try audio only if video fails
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
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

      // Create peer connection with more comprehensive configuration
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        iceCandidatePoolSize: 10,
      });

      console.log("Created peer connection");
      peerConnectionRef.current = peerConnection;

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
        console.log("Added track:", track.kind);
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

      // Handle ICE candidates with socket fallback
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          const activeSocket = socketInstance || socket;
          if (activeSocket?.connected) {
            console.log("Sending ICE candidate:", event.candidate.type);
            activeSocket.emit("ice-candidate", {
              roomId,
              candidate: event.candidate,
            });
          } else {
            console.warn("Socket not available for ICE candidate");
          }
        } else {
          console.log("ICE candidate gathering complete");
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log("Connection state:", peerConnection.connectionState);
        setConnectionDebug(`WebRTC: ${peerConnection.connectionState}`);
        if (peerConnection.connectionState === "connected") {
          console.log("WebRTC connection established successfully");
        } else if (peerConnection.connectionState === "failed") {
          console.error("WebRTC connection failed");
          setConnectionDebug("WebRTC connection failed");
        }
      };

      // Add additional debugging for ICE connection state
      peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
        setConnectionDebug(`ICE: ${peerConnection.iceConnectionState}`);
        if (
          peerConnection.iceConnectionState === "connected" ||
          peerConnection.iceConnectionState === "completed"
        ) {
          console.log("ICE connection established - peers can communicate");
        } else if (peerConnection.iceConnectionState === "failed") {
          console.error("ICE connection failed");
        }
      };

      // Create offer if volunteer (volunteer initiates)
      if (role === "volunteer") {
        console.log("Volunteer creating offer");
        try {
          const offer = await peerConnection.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true,
          });
          await peerConnection.setLocalDescription(offer);
          console.log("Sending offer to room:", roomId);

          const activeSocket = socketInstance || socket;
          if (activeSocket?.connected) {
            activeSocket.emit("offer", {
              roomId,
              offer,
            });
          } else {
            throw new Error("Socket not connected for offer");
          }
        } catch (offerError) {
          console.error("Error creating/sending offer:", offerError);
        }
      } else {
        // VI user signals they're ready to receive offer
        console.log("VI user signaling ready for offer");
        const activeSocket = socketInstance || socket;
        if (activeSocket?.connected) {
          activeSocket.emit("peer-ready", { roomId, role: "vi-user" });
        }
      }
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
      if (!peerConnectionRef.current) {
        console.error("No peer connection available for offer");
        return;
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
      </div>

      {/* Video container */}
      <div className="relative h-screen">
        {/* Remote video (main) */}
        <div className="relative w-full h-full bg-gray-800">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            style={{
              background: "#1f2937",
              display: isRemoteVideoPlaying ? "block" : "block", // Always show video element
            }}
            aria-label="Remote participant video"
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
            className="w-full h-full object-cover"
            aria-label="Your video preview"
          >
            <track
              kind="captions"
              srcLang="en"
              label="English captions"
              default
            />
          </video>
        </div>

        {/* Call controls */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center gap-4 bg-gray-800/90 p-4 rounded-full">
            <Button
              variant={isMuted ? "destructive" : "secondary"}
              size="lg"
              onClick={toggleMute}
              className="rounded-full w-12 h-12"
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </Button>

            <Button
              variant={isVideoOff ? "destructive" : "secondary"}
              size="lg"
              onClick={toggleVideo}
              className="rounded-full w-12 h-12"
            >
              {isVideoOff ? <CameraOff size={20} /> : <Camera size={20} />}
            </Button>

            <Button
              variant="destructive"
              size="lg"
              onClick={endCall}
              className="rounded-full w-12 h-12"
            >
              <PhoneOff size={20} />
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
