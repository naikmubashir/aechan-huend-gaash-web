"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { io } from "socket.io-client";

export function useSocket() {
  const { data: session } = useSession();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("N/A");

  useEffect(() => {
    if (!session?.user) return;

    if (!socketRef.current) {
      const socketServerUrl =
        process.env.NODE_ENV === "production"
          ? process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
            "https://aechan-huend-gaash-server.onrender.com"
          : "http://localhost:3000";

      socketRef.current = io(socketServerUrl, {
        transports: ["websocket", "polling"],
      });

      const socket = socketRef.current;

      socket.on("connect", () => {
        console.log("Socket connected:", socket.id);
        setIsConnected(true);
        setTransport(socket.io.engine.transport.name);

        // Join with user data
        socket.emit("join", {
          id: session.user.id,
          name: session.user.name,
          role: session.user.role,
          isAvailable: session.user.isAvailable,
          language: session.user.language,
        });

        socket.io.engine.on("upgrade", () => {
          setTransport(socket.io.engine.transport.name);
        });
      });

      socket.on("disconnect", () => {
        console.log("Socket disconnected");
        setIsConnected(false);
        setTransport("N/A");
      });

      socket.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        setIsConnected(false);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [session]);

  const emit = (event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  };

  const on = (event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  const off = (event, callback) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    transport,
    emit,
    on,
    off,
  };
}
