import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

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
    <html lang="id">
      <body className={`${plusJakartaSans.variable} min-h-screen bg-gray-50`}>
        {children}
      </body>
    </html>
  );
}
