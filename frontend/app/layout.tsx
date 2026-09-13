import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AeroStream | Airline Operations",
  description:
    "Explore Varun’s airline operations data platform: live flight data, replay-safe pipelines, and verified data quality.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
