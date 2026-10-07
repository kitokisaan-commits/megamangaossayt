# Telegram setup and compatibility

Normal browsers and ordinary Telegram in-app browser links use the same HTTPS routes. They do not need the WebApp API. Mini App presentation is an optional enhancement; admin authentication always uses the existing secure server session.

## Configure a Mini App

1. Deploy the real Next app to an HTTPS domain and set `APP_URL` to that exact origin.
2. In BotFather, configure the bot's **Main Mini App** or named Mini App, HTTPS launch/menu URL and allowed domain. Use the site root as the launch URL. Pick matching loading-screen colors for the dark/light palette.
3. Optionally set `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` without `@`; set `NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME` for a named Mini App, or leave it empty for the Main Mini App. Rebuild after public environment changes.
4. Publish a normal direct title/chapter URL, or a Mini App deep link:
   - Main app: `https://t.me/your_bot?startapp=title_salt-and-steel`
   - Named app: `https://t.me/your_bot/reader?startapp=chapter_<chapter-uuid>`
5. No bot token is required by this version. Never put a bot token in a public environment variable.

The bridge resolves `tgWebAppStartParam` or `initDataUnsafe.start_param` only from a detected Mini App and only on the homepage. `title_<slug>` and `chapter_<uuid>` map to public relative routes. These values never grant identity, editorial permissions or preview access. If future public Telegram accounts are introduced, validate signed `initData` server-side and define a separate public-user model; do not reuse admin profiles.

## Integration

`lib/telegram.ts` defines the small WebApp API interface and safe launch/link helpers. `components/inkora/telegram-bridge.tsx` loads the official HTTPS SDK only when a launch hash requires it. An existing valid platform API is reused. Failure or old methods leave normal HTML controls available.

The bridge calls ready/expand and observes themeChanged, viewportChanged, safeAreaChanged, contentSafeAreaChanged and fullscreenChanged. It unregisters handlers on cleanup. Device and content safe-area padding is combined and bounded; normal browsers fall back to CSS env insets. Stable viewport height controls dialog bounds; transient drag-height updates are not used to animate bottom controls. Native CSS dvh supports ordinary mobile browser chrome changes.

Dark/light themes retain the INKORA editorial palette. Reader background follows Telegram by default; an explicit reader choice persists locally. Mobile controls have 44px targets, fields use 16px text to avoid iOS focus zoom, native dialog focus management and keyboard Escape are supported. API 8+ native fullscreen is used when available; normal fullscreen remains a browser capability with an honest fallback message. Vertical reader gestures keep Telegram's default swipe behavior.

Official reference: https://core.telegram.org/bots/webapps (reviewed 2026-10-07).

## Physical-device acceptance

Automated Chromium tests simulate Android/iOS WebApp APIs and test desktop/mobile viewports. They do **not** certify native Telegram or WebKit behavior. Before announcing a Mini App release, run on current Telegram Android and iOS:

- Open normal HTTPS links and Mini App title/chapter startapp links.
- Switch Telegram day/night themes before and during reading; verify manual reader background wins.
- Expand/minimize, rotate the device, open/close the keyboard and toggle fullscreen. No controls should overlap Telegram chrome/notches/home indicator.
- Read and resume a long chapter; next/previous, selectors, clipboard fallback and settings must remain touch-accessible.
- Confirm an anonymous Mini App cannot open draft/private previews or any CMS action.
- Reopen the app and confirm device history/preferences; clearing app/browser storage intentionally removes them.

Use Telegram's documented Android WebView inspection or iOS Safari inspection if device-specific issues occur. No device credentials are stored in the repo.
