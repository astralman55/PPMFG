import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Archivo variable font - CLAUDE_CODE_BRIEF.md §11: "One family: Archivo
// variable, using its width axis for hierarchy." next/font/google serves
// the full variable-axis (weight + width) font since no fixed `weight` is
// given.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Polly Plastics",
  description: "Aerospace plastics, cut to your size. Priced in seconds, certified the same day.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} antialiased`}>{children}</body>
    </html>
  );
}
