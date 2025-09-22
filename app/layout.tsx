import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Foreman Daily Reports – Prime 11 Unit 213",
  description: "Renovation daily reporting tool for Prime 11 Unit 213",
  manifest: "/manifest.json",
  themeColor: "#111111"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
