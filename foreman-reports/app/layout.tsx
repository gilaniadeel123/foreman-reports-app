import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Foreman Daily Reports",
  description: "Renovation daily reporting tool (offline-friendly)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
