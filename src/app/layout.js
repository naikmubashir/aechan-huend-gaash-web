import { Geist, Geist_Mono } from "next/font/google";
import PropTypes from "prop-types";
import "./globals.css";
import AuthProvider from "@/components/providers/auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Aechan Huend Gaash - Visual Assistance Platform",
  description:
    "Connect with volunteers or AI assistance for real-time visual support. An accessible web-based platform for the blind and low-vision community.",
  keywords:
    "visual assistance, accessibility, blind support, volunteer help, AI vision",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

RootLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
