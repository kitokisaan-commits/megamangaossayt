import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startRoute,
  telegramLaunch,
  safeInset,
  miniAppLink,
  connectTelegram,
  type TelegramWebApp,
} from "../lib/telegram";
import { isNewChapter } from "../lib/publication";
test("Telegram launch detection leaves ordinary browsers independent", () => {
  assert.equal(telegramLaunch("#page-3"), false);
  assert.equal(telegramLaunch("#contains=tgWebAppData"), false);
  assert.equal(
    telegramLaunch("#tgWebAppData=opaque&tgWebAppVersion=8.0"),
    true,
  );
  assert.equal(
    telegramLaunch("#tgWebAppVersion=8.0&tgWebAppPlatform=ios"),
    true,
  );
});
test("Telegram start parameters allow only public relative title/chapter routes", () => {
  assert.equal(startRoute("title_salt-and-steel"), "/title/salt-and-steel");
  assert.equal(
    startRoute("chapter_10000000-0000-0000-0000-000000000001"),
    "/read/10000000-0000-0000-0000-000000000001",
  );
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "title_../admin",
    "title_x?preview=1",
    "admin_x",
    "chapter_not-uuid",
    "title_<script>",
    "title_" + "x".repeat(300),
  ])
    assert.equal(startRoute(value), null);
});
test("Mini App links require actual configured bot and valid resource", () => {
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = "inkora_example_bot";
  process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME = "reader";
  assert.equal(
    miniAppLink("title", "salt-and-steel"),
    "https://t.me/inkora_example_bot/reader?startapp=title_salt-and-steel",
  );
  assert.equal(miniAppLink("title", "../admin"), null);
  delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  delete process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME;
  assert.equal(miniAppLink("title", "salt-and-steel"), null);
});
test("Telegram adapter tolerates older APIs, sanitizes insets and unsubscribes", () => {
  const styles = new Map<string, string>(),
    handlers = new Map<string, () => void>();
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      setProperty: (k: string, v: string) => styles.set(k, v),
      removeProperty: (k: string) => styles.delete(k),
    },
  };
  const before = globalThis.window;
  globalThis.window = { dispatchEvent: () => true } as unknown as Window &
    typeof globalThis;
  const app: TelegramWebApp = {
    colorScheme: "light",
    viewportStableHeight: 640,
    safeAreaInset: { top: 24 },
    contentSafeAreaInset: { top: 48, bottom: NaN },
    onEvent: (e, fn) => {
      handlers.set(e, fn);
    },
    offEvent: (e) => {
      handlers.delete(e);
    },
    setHeaderColor: () => {
      throw new Error("old version");
    },
  };
  try {
    const stop = connectTelegram(app, root as unknown as HTMLElement);
    assert.equal(root.dataset.telegramTheme, "light");
    assert.equal(styles.get("--inkora-tg-top"), "72px");
    app.colorScheme = "dark";
    handlers.get("themeChanged")!();
    assert.equal(root.dataset.telegramTheme, "dark");
    stop();
    assert.equal(handlers.size, 0);
    assert.equal(styles.size, 0);
    for (const input of [-5, NaN, Infinity, "99"])
      assert.equal(safeInset(input), 0);
    assert.equal(safeInset(999), 200);
  } finally {
    globalThis.window = before;
  }
});
test("NEW chapter badge has a seven-day publication window, never future/draft", () => {
  const time = Date.now(),
    published_at = new Date(time - 86400000).toISOString();
  assert.equal(isNewChapter({ status: "Published", published_at }, time), true);
  assert.equal(isNewChapter({ status: "Draft", published_at }, time), false);
  assert.equal(
    isNewChapter(
      { status: "Published", published_at: new Date(time + 1).toISOString() },
      time,
    ),
    false,
  );
  assert.equal(
    isNewChapter(
      {
        status: "Published",
        published_at: new Date(time - 8 * 86400000).toISOString(),
      },
      time,
    ),
    false,
  );
});
