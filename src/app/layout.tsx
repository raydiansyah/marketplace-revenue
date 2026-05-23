/**
 * Module: Root Layout
 * Purpose: Next.js root layout — font setup, metadata, theme provider, auth/notification wrappers
 * Used by: All pages via Next.js App Router
 * Dependencies: next-themes (ThemeProvider), AuthProvider, NotificationProvider, DataLoader
 * Public functions: RootLayout (default export)
 * Side effects: Injects Plus Jakarta Sans + Geist font variables, sets default dark theme via next-themes
 */
import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/lib/auth/auth-context";
import { DataLoader } from "@/components/DataLoader";
import { NotificationProvider } from "@/lib/notifications/notification-context";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
});

export const metadata: Metadata = {
  title: "Marketplace Revenue Calculator",
  description: "Hitung revenue & profit akurat dari Shopee, Tokopedia/TikTok, Lazada",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className={`${plusJakartaSans.variable} min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <NotificationProvider>
            <AuthProvider>
              <DataLoader />
              {children}
            </AuthProvider>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
