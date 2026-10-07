import type { Metadata, Viewport } from "next";
import "./globals.css";
import TelegramBridge from "@/components/inkora/telegram-bridge";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: "INKORA — Har sahifada yangi olam",
    template: "%s · INKORA",
  },
  description: "Manga, manhwa va webtoon. O‘zbek tilida o‘qing.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14171d",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz">
      <body>
        <a href="#main" className="skip-link">
          Asosiy mazmunga o‘tish
        </a>
        <TelegramBridge />
        {children}
      </body>
    </html>
  );
}
