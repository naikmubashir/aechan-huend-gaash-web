"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Camera,
  CameraOff,
} from "lucide-react";

export default function CallPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callId = searchParams.get("callId");
  const role = searchParams.get("role");

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState("connecting"); // connecting, connected, ended
  const [partnerName, setPartnerName] = useState("");
  const [roomId, setRoomId] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

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
      setIsConnected(true);

      // Emit join event like in dashboards
      newSocket.emit("join", {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
        language: session.user.language || "en",
      });

      // Since we're on the call page, the call should already be connected
      // The server will emit call_connected if we're reconnecting to an existing call
      // If not, we'll set up a basic room and wait for events
      setTimeout(() => {
        if (callStatus === "connecting") {
          console.log(
            "No call_connected event received, setting up basic room"
          );
          const roomId = `room_${callId}`;
          setRoomId(roomId);
          setCallStatus("connected");
          initializeWebRTC(roomId);
        }
      }, 2000);
    });

    // Listen for call events
    newSocket.on("call_connected", (data) => {
      console.log("Call connected event received:", data);
      setCallStatus("connected");

      // Set partner name based on role
      if (role === "volunteer") {
        setPartnerName(data.viUser?.name || "VI User");
      } else {
        setPartnerName(data.volunteer?.name || "Volunteer");
      }

      setRoomId(data.roomId);

      // Initialize WebRTC now that we have room info
      if (!peerConnectionRef.current) {
        initializeWebRTC(data.roomId);
      }
    });

    newSocket.on("call_accepted", (data) => {
      console.log("Call accepted event received:", data);
      setCallStatus("connected");
      setPartnerName(data.volunteer?.name || "Volunteer");
      setRoomId(data.roomId);

      if (!peerConnectionRef.current) {
        initializeWebRTC(data.roomId);
      }
    });

    newSocket.on("call_ended", (data) => {
      console.log("Call ended:", data);
      setCallStatus("ended");
      cleanup();
      setTimeout(() => {
        router.push(
          role === "volunteer" ? "/dashboard/volunteer" : "/dashboard/vi-user"
        );
      }, 3000);
    });

    // WebRTC signaling
    newSocket.on("offer", handleOffer);
    newSocket.on("answer", handleAnswer);
    newSocket.on("ice-candidate", handleIceCandidate);

    setSocket(newSocket);

    return () => {
      cleanup();
      newSocket.disconnect();
    };
  }, [session?.user?.id, callId]);

  const initializeWebRTC = async (roomId) => {
    try {
      console.log("Initializing WebRTC for room:", roomId);

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("Got user media stream");
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      console.log("Created peer connection");
      peerConnectionRef.current = peerConnection;

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log("Received remote stream");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", {
            roomId,
            candidate: event.candidate,
          });
        }
      };

      // Create offer if volunteer (volunteer initiates)
      if (role === "volunteer") {
        console.log("Volunteer creating offer");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log("Sending offer to room:", roomId);
        socket.emit("offer", {
          roomId,
          offer,
        });
      }
    } catch (error) {
      console.error("Error initializing WebRTC:", error);
      alert("Error accessing camera/microphone. Please check permissions.");
    }
  };

  const handleOffer = async (data) => {
    try {
      console.log("Received offer from:", data.roomId);
      await peerConnectionRef.current.setRemoteDescription(data.offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      console.log("Sending answer to room:", data.roomId);
      socket.emit("answer", {
        roomId: data.roomId,
        answer,
      });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  };

  const handleAnswer = async (data) => {
    try {
      console.log("Received answer from:", data.roomId);
      await peerConnectionRef.current.setRemoteDescription(data.answer);
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      console.log("Received ICE candidate");
      await peerConnectionRef.current.addIceCandidate(data.candidate);
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
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
    if (socket && callId) {
      socket.emit("end_call", { callId });
    }
    cleanup();
    router.push(
      role === "volunteer" ? "/dashboard/volunteer" : "/dashboard/vi-user"
    );
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
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
          {callStatus === "ended" && "Call ended"}
        </div>
        {callStatus === "connected" && (
          <div className="text-sm text-gray-400">Call ID: {callId}</div>
        )}
      </div>

      {/* Video container */}
      <div className="relative h-screen">
        {/* Remote video (main) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          style={{ background: "#1f2937" }}
        />

        {/* Local video (picture-in-picture) */}
        <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-600">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
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
