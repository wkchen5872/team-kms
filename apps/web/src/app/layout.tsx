import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Team KMS", description: "Knowledge wiki" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">{children}</body>
    </html>
  );
}
