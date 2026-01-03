import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ResumeFit - AI-Powered Resume Optimization",
  description: "Optimize your resume for job applications",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

