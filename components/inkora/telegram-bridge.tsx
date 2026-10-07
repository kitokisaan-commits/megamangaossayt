"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  connectTelegram,
  startRoute,
  telegramApp,
  telegramLaunch,
} from "@/lib/telegram";
export default function TelegramBridge() {
  const router = useRouter();
  useEffect(() => {
    let disconnect: (() => void) | undefined;
    let alive = true;
    const attach = () => {
      if (!alive) return;
      const app = telegramApp();
      if (!app) return;
      disconnect = connectTelegram(app, document.documentElement);
      const route = startRoute(
        new URLSearchParams(location.search).get("tgWebAppStartParam") ||
          app.initDataUnsafe?.start_param,
      );
      if (route && location.pathname === "/") router.replace(route);
    };
    if (telegramApp()) attach();
    else if (telegramLaunch(location.hash)) {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js?64";
      script.async = true;
      script.onload = attach;
      document.head.appendChild(script);
      return () => {
        alive = false;
        script.onload = null;
        script.remove();
        disconnect?.();
      };
    }
    return () => {
      alive = false;
      disconnect?.();
    };
  }, [router]);
  return null;
}
