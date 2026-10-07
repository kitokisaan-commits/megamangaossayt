/** Presentation-only Telegram adapter. Launch data never grants identity or roles. */
export type Insets = Partial<
  Record<"top" | "bottom" | "left" | "right", number>
>;
export type TelegramWebApp = {
  platform?: string;
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  colorScheme?: string;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isFullscreen?: boolean;
  ready?: () => void;
  expand?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
export function telegramLaunch(hash: string) {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  return (
    p.has("tgWebAppData") ||
    (p.has("tgWebAppVersion") && p.has("tgWebAppPlatform"))
  );
}
export function startRoute(value?: string | null) {
  if (!value || value.length > 200) return null;
  if (/^title_[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    return "/title/" + value.slice(6);
  if (/^chapter_[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value))
    return "/read/" + value.slice(8);
  return null;
}
export function miniAppLink(kind: "title" | "chapter", value: string) {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const app = process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME;
  if (
    !bot ||
    !/^[a-z0-9_]{5,32}$/i.test(bot) ||
    (app && !/^[a-z0-9_]+$/i.test(app))
  )
    return null;
  const param = kind + "_" + value;
  if (!startRoute(param)) return null;
  return `https://t.me/${bot}${app ? "/" + app : ""}?startapp=${encodeURIComponent(param)}`;
}
export function telegramApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return;
  const app = window.Telegram?.WebApp;
  if (
    app &&
    (telegramLaunch(location.hash) ||
      (app.platform && app.platform !== "unknown"))
  )
    return app;
}
export function safeInset(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(200, value))
    : 0;
}
function safely(action: () => void) {
  try {
    action();
  } catch {
    /* Older clients are optional. */
  }
}
export function connectTelegram(app: TelegramWebApp, root: HTMLElement) {
  const apply = () => {
    const light = app.colorScheme === "light";
    root.dataset.telegram = "true";
    root.dataset.telegramTheme = light ? "light" : "dark";
    for (const side of ["top", "bottom", "left", "right"] as const) {
      root.style.setProperty(
        `--inkora-tg-${side}`,
        `${safeInset(app.safeAreaInset?.[side]) + safeInset(app.contentSafeAreaInset?.[side])}px`,
      );
    }
    const height = app.viewportStableHeight;
    if (typeof height === "number" && Number.isFinite(height) && height > 0)
      root.style.setProperty("--app-height", Math.min(height, 10000) + "px");
    const color = light ? "#f4f2ee" : "#14171d";
    safely(() =>
      app.setHeaderColor?.(app.isVersionAtLeast?.("6.9") ? color : "bg_color"),
    );
    safely(() => app.setBackgroundColor?.(color));
    safely(() => app.setBottomBarColor?.(color));
    window.dispatchEvent(new Event("inkora:telegram-theme"));
    window.dispatchEvent(new Event("inkora:telegram-fullscreen"));
  };
  const events = [
    "themeChanged",
    "viewportChanged",
    "safeAreaChanged",
    "contentSafeAreaChanged",
    "fullscreenChanged",
  ];
  events.forEach((e) => safely(() => app.onEvent?.(e, apply)));
  apply();
  safely(() => app.ready?.());
  safely(() => app.expand?.());
  return () => {
    events.forEach((e) => safely(() => app.offEvent?.(e, apply)));
    delete root.dataset.telegram;
    delete root.dataset.telegramTheme;
    for (const side of ["top", "bottom", "left", "right"])
      root.style.removeProperty(`--inkora-tg-${side}`);
    root.style.removeProperty("--app-height");
  };
}
