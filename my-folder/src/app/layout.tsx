import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Motor CMS — Condition Monitoring",
  description: "Industrial IoT dashboard for induction motor health monitoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
