"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Settings2,
  Sun,
  Moon,
  Link as LinkIcon,
  ArrowUp,
  X,
  BookOpen,
} from "lucide-react";
import { readLocal, writeLocal } from "@/lib/client";
import { telegramApp, miniAppLink } from "@/lib/telegram";
import { TrackView } from "./shell";
import type { Item, HistoryItem } from "@/lib/types";
function PageImage({
  p,
  index,
  active,
  current = index,
  windowEnd = current + 3,
  width = "comfortable",
}: {
  p: Item;
  index: number;
  active: boolean;
  current?: number;
  windowEnd?: number;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const img = ref.current?.querySelector("img");
    // A server-rendered image can fail before React attaches its error handler.
    if (img?.complete && img.currentSrc && img.naturalWidth === 0)
      setError(true);
  }, [active, retry, current]);
  return (
    <div
      ref={ref}
      id={"page-" + index}
      className="reader-page"
      style={{
        aspectRatio: `${p.width}/${p.height}`,
        ...(width === "original"
          ? { maxWidth: p.width, marginInline: "auto" }
          : {}),
      }}
    >
      {(active || (index >= current - 2 && index <= windowEnd)) && !error && (
        <img
          src={
            p.src +
            (retry ? (p.src.includes("?") ? "&" : "?") + "retry=" + retry : "")
          }
          alt={`${index + 1}-sahifa`}
          srcSet={width === "original" || retry ? undefined : p.srcset}
          sizes={
            width === "comfortable"
              ? "(max-width: 860px) 100vw, 860px"
              : "100vw"
          }
          width={p.width}
          height={p.height}
          fetchPriority={active ? "high" : "auto"}
          loading={active ? "eager" : "lazy"}
          decoding="async"
          onError={() => setError(true)}
        />
      )}
      <span className="page-placeholder">{index + 1}</span>
      {error && (
        <div className="image-error">
          <p>Sahifa yuklanmadi.</p>
          <button
            className="button"
            onClick={() => {
              setRetry(retry + 1);
              setError(false);
            }}
          >
            Qayta yuklash
          </button>
        </div>
      )}
    </div>
  );
}
export default function Reader({
  chapter,
  title,
  pages,
  chapters,
  preview = false,
}: {
  chapter: Item;
  title: Item;
  pages: Item[];
  chapters: Item[];
  preview?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState("vertical"),
    [width, setWidth] = useState("comfortable"),
    [light, setLight] = useState(false),
    [index, setIndex] = useState(0),
    [visibleEnd, setVisibleEnd] = useState(0),
    [visibleStart, setVisibleStart] = useState(0),
    [settings, setSettings] = useState(false),
    [controls, setControls] = useState(true),
    [full, setFull] = useState(false),
    [message, setMessage] = useState(""),
    [shareLink, setShareLink] = useState(""),
    [ready, setReady] = useState(false);
  const visibleLast =
    visibleStart === index ? Math.max(index, visibleEnd) : index;
  const indexRef = useRef(0);
  const automaticTheme = useRef(true);
  const restoring = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suffix = preview ? "?preview=1" : "";
  const chapterIndex = chapters.findIndex((c) => c.id === chapter.id);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!settings) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = settingsDialog.current;
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "");
    return () => {
      dialog?.close?.();
      dialog?.removeAttribute("open");
      previous?.focus();
    };
  }, [settings]);
  // One passive listener and a binary search replace hundreds of page observers.
  // Read geometry after layout, so stale intersection callbacks cannot undo a jump.
  useEffect(() => {
    if (mode !== "vertical" || !ready || !pages.length) return;
    let frame = 0;
    const locate = () => {
      frame = 0;
      if (restoring.current) return;
      const header =
        document.querySelector(".reader-header")?.getBoundingClientRect()
          .bottom || 70;
      const anchor = header + 8;
      let low = 0,
        high = pages.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const top =
          document.getElementById("page-" + mid)?.getBoundingClientRect().top ??
          Infinity;
        if (top <= anchor) low = mid;
        else high = mid - 1;
      }
      indexRef.current = low;
      setIndex(low);
      const bottom =
        document.querySelector(".reader-bottom")?.getBoundingClientRect().top ||
        innerHeight;
      let end = low,
        right = pages.length - 1;
      while (end < right) {
        const mid = Math.ceil((end + right) / 2);
        const top =
          document.getElementById("page-" + mid)?.getBoundingClientRect().top ??
          Infinity;
        if (top < bottom) end = mid;
        else right = mid - 1;
      }
      setVisibleStart(low);
      setVisibleEnd(end);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(locate);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [mode, ready, pages.length, width]);
  useEffect(() => {
    const prefs = readLocal("inkora.reader", {
      mode: title.direction === "vertical" ? "vertical" : "paged",
      width: "comfortable",
      light: document.documentElement.dataset.telegramTheme === "light",
      background: "system",
    });
    automaticTheme.current = prefs.background
      ? prefs.background === "system"
      : !readLocal("inkora.reader", null);
    setMode(prefs.mode);
    setWidth(prefs.width);
    setLight(
      automaticTheme.current
        ? document.documentElement.dataset.telegramTheme === "light"
        : prefs.light,
    );
    const history = readLocal<Record<string, HistoryItem>>(
      "inkora.history",
      {},
    )[title.id];
    if (
      !preview &&
      history?.chapterId === chapter.id &&
      new URLSearchParams(location.search).has("resume")
    ) {
      const n = Math.max(
        0,
        Math.min(
          Number.isFinite(history.page) ? history.page : 0,
          pages.length - 1,
        ),
      );
      restoring.current = true;
      setIndex(Math.max(0, n));
      setVisibleStart(Math.max(0, n));
      setVisibleEnd(Math.max(0, n));
      indexRef.current = Math.max(0, n);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document
            .getElementById("page-" + n)
            ?.scrollIntoView({ behavior: "instant", block: "start" });
          indexRef.current = n;
          setIndex(n);
          restoring.current = false;
          setReady(true);
        }),
      );
    } else setReady(true);
    const fs = () => setFull(!!document.fullscreenElement);
    const tgFullscreen = () => setFull(!!telegramApp()?.isFullscreen);
    window.addEventListener("inkora:telegram-fullscreen", tgFullscreen);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      document.removeEventListener("fullscreenchange", fs);
      window.removeEventListener("inkora:telegram-fullscreen", tgFullscreen);
    };
  }, [chapter.id, title.id, title.direction, pages.length, preview]);
  useEffect(() => {
    const theme = () => {
      if (automaticTheme.current)
        setLight(document.documentElement.dataset.telegramTheme === "light");
    };
    window.addEventListener("inkora:telegram-theme", theme);
    return () => window.removeEventListener("inkora:telegram-theme", theme);
  }, []);
  useEffect(() => {
    if (ready)
      writeLocal("inkora.reader", {
        mode,
        width,
        light,
        background: automaticTheme.current
          ? "system"
          : light
            ? "light"
            : "dark",
      });
  }, [mode, width, light, ready]);
  useEffect(() => {
    if (!ready || preview) return;
    const save = () => {
      const all = readLocal<Record<string, HistoryItem>>("inkora.history", {});
      all[title.id] = {
        titleId: title.id,
        title: title.title,
        slug: title.slug,
        cover: title.cover || "/api/assets/" + title.cover_id + "?kind=thumb",
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        page: indexRef.current,
        time: Date.now(),
      };
      writeLocal(
        "inkora.history",
        Object.fromEntries(
          Object.entries(all)
            .sort(([, a], [, b]) => b.time - a.time)
            .slice(0, 100),
        ),
      );
    };
    saveTimer.current = setTimeout(save, 350);
    window.addEventListener("pagehide", save);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [index, ready, preview, title, chapter]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettings(false);
        return;
      }
      if (
        (e.target as HTMLElement).matches(
          "input,select,textarea,[contenteditable=true]",
        ) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (mode === "paged" && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const direction =
          (e.key === "ArrowRight" ? 1 : -1) *
          (title.direction === "rtl" ? -1 : 1);
        setIndex((i) => {
          const n = Math.min(pages.length - 1, Math.max(0, i + direction));
          indexRef.current = n;
          return n;
        });
      }
      if (mode === "vertical" && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        document
          .getElementById(
            "page-" +
              Math.max(
                0,
                Math.min(
                  pages.length - 1,
                  indexRef.current + (e.key === "ArrowRight" ? 1 : -1),
                ),
              ),
          )
          ?.scrollIntoView({ behavior: "smooth" });
      }
      if (e.key.toLowerCase() === "h") setControls((v) => !v);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mode, pages.length, title.direction]);
  const changePage = (n: number) => {
    if (!Number.isFinite(n)) return;
    n = Math.max(0, Math.min(pages.length - 1, Math.trunc(n)));
    setIndex(n);
    setVisibleStart(n);
    setVisibleEnd(n);
    indexRef.current = n;
    if (mode === "vertical") {
      restoring.current = true;
      document
        .getElementById("page-" + n)
        ?.scrollIntoView({ behavior: "instant", block: "start" });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          restoring.current = false;
        }),
      );
    }
  };
  useEffect(() => {
    const start = mode === "vertical" ? visibleLast : index;
    const links = pages.slice(start + 1, start + 3).map((p) => {
      const l = document.createElement("link");
      l.rel = "preload";
      l.as = "image";
      l.href = p.src;
      if (p.srcset && width !== "original") {
        l.imageSrcset = p.srcset;
        l.imageSizes =
          width === "comfortable" ? "(max-width: 860px) 100vw, 860px" : "100vw";
      }
      document.head.appendChild(l);
      return l;
    });
    return () => links.forEach((l) => l.remove());
  }, [index, visibleLast, pages, width, mode]);
  const fullscreen = async () => {
    try {
      const app = telegramApp();
      if (app?.isVersionAtLeast?.("8.0") && app.requestFullscreen) {
        if (app.isFullscreen) app.exitFullscreen?.();
        else app.requestFullscreen();
        return;
      }
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else setMessage("Bu brauzer to‘liq ekranni qo‘llamaydi.");
    } catch {
      setMessage("To‘liq ekran hozir mavjud emas.");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        location.origin + "/read/" + chapter.id,
      );
      setShareLink("");
      setMessage("Havola nusxalandi.");
    } catch {
      setShareLink(location.origin + "/read/" + chapter.id);
      setMessage("Havolani tanlab nusxalang.");
    }
  };
  return (
    <div
      className={"reader " + (light ? "reader-light" : "") + " reader-" + width}
    >
      <header className={"reader-header " + (!controls ? "reader-hidden" : "")}>
        <Link
          href={"/title/" + title.slug + suffix}
          className="reader-back"
          aria-label="Asar sahifasi"
        >
          <ChevronLeft />
          <span>
            <strong>{title.title}</strong>
            <small>
              {chapter.number}-bob {chapter.name && " / " + chapter.name}
            </small>
          </span>
        </Link>
        <div className="row">
          <span className="reader-counter">
            {Math.min(index + 1, pages.length)} / {pages.length}
          </span>
          <button
            className="icon-button"
            aria-label="Reader sozlamalari"
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            <Settings2 />
          </button>
          <button
            className="icon-button"
            aria-label="To‘liq ekran"
            onClick={fullscreen}
          >
            {full ? <Minimize /> : <Maximize />}
          </button>
        </div>
      </header>
      {preview && (
        <div className="reader-preview">
          DRAFT PREVIEW · Faqat tahririyat uchun
        </div>
      )}
      {settings && (
        <dialog
          ref={settingsDialog}
          className="reader-settings"
          aria-labelledby="reader-settings-title"
          onCancel={() => setSettings(false)}
        >
          <div className="section-heading">
            <h3 id="reader-settings-title">O‘qish sozlamalari</h3>
            <button
              className="icon-button"
              aria-label="Sozlamalarni yopish"
              onClick={() => setSettings(false)}
            >
              <X />
            </button>
          </div>
          <label>
            O‘qish usuli
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="vertical">Vertikal</option>
              <option value="paged">Sahifama-sahifa</option>
            </select>
          </label>
          <label>
            Sahifa eni
            <select value={width} onChange={(e) => setWidth(e.target.value)}>
              <option value="comfortable">Qulay (860px)</option>
              <option value="wide">Ekran enida</option>
              <option value="original">Asl o‘lcham</option>
            </select>
          </label>
          <button
            className="button"
            onClick={() => {
              automaticTheme.current = false;
              setLight(!light);
            }}
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}{" "}
            {light ? "Qoramtir fon" : "Yorug‘ fon"}
          </button>
          <button className="button" onClick={copy}>
            <LinkIcon size={18} />
            Havolani nusxalash
          </button>
          {shareLink && (
            <label>
              Bob havolasi
              <input
                aria-label="Nusxalanadigan bob havolasi"
                readOnly
                value={shareLink}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          )}
          {message && (
            <p role="status" className="muted">
              {message}
            </p>
          )}
          {!preview && miniAppLink("chapter", chapter.id) && (
            <a
              className="button"
              href={miniAppLink("chapter", chapter.id)!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Telegram’da ochish
            </a>
          )}
          <button
            className="button"
            onClick={() => {
              setControls(false);
              setSettings(false);
            }}
          >
            Boshqaruvni yashirish (H)
          </button>
          <small>Sahifani bosing — boshqaruv qaytadi.</small>
        </dialog>
      )}
      <main
        id="main"
        className="reader-content"
        onClick={() => !controls && setControls(true)}
      >
        {!pages.length ? (
          <div className="empty-state">
            <BookOpen />
            <h2>Bu bobda hali sahifa yo‘q.</h2>
          </div>
        ) : mode === "vertical" ? (
          pages.map((p, i) => (
            <PageImage
              key={p.id}
              p={p}
              index={i}
              active={i >= index && i <= visibleLast}
              current={index}
              windowEnd={visibleLast + 3}
              width={width}
            />
          ))
        ) : (
          <div className="paged-canvas">
            <button
              className="paged-nav previous"
              aria-label="Oldingi sahifa"
              disabled={index === 0}
              onClick={() => changePage(index - 1)}
            >
              <ChevronLeft />
            </button>
            <PageImage
              key={pages[index]?.id}
              p={pages[index]}
              index={index}
              active
              width={width}
            />
            <button
              className="paged-nav next"
              aria-label="Keyingi sahifa"
              disabled={index === pages.length - 1}
              onClick={() => changePage(index + 1)}
            >
              <ChevronRight />
            </button>
          </div>
        )}
        <div className="reader-end">
          <span>BOB YAKUNI</span>
          <h2>Keyingi sahifada uchrashamiz.</h2>
          {chapters[chapterIndex + 1] ? (
            <Link
              className="button primary"
              prefetch={false}
              href={"/read/" + chapters[chapterIndex + 1].id + suffix}
            >
              Keyingi bob
            </Link>
          ) : (
            <Link
              className="button primary"
              href={"/title/" + title.slug + suffix}
            >
              Asar sahifasiga qaytish
            </Link>
          )}
          <button
            className="text-button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <ArrowUp size={16} />
            Boshiga qaytish
          </button>
        </div>
      </main>
      <nav
        className={"reader-bottom " + (!controls ? "reader-hidden" : "")}
        aria-label="Boblar orasida yurish"
      >
        <div
          className="reader-progress"
          role="progressbar"
          aria-label="O‘qish jarayoni"
          aria-valuemin={0}
          aria-valuemax={pages.length}
          aria-valuenow={pages.length ? index + 1 : 0}
          style={{
            width:
              (pages.length ? ((index + 1) / pages.length) * 100 : 0) + "%",
          }}
        />
        {chapters[chapterIndex - 1] ? (
          <Link
            aria-label="Oldingi bob"
            prefetch={false}
            href={"/read/" + chapters[chapterIndex - 1].id + suffix}
          >
            <ChevronLeft />
            <span>Oldingi bob</span>
          </Link>
        ) : (
          <button disabled>
            <ChevronLeft />
            <span>Oldingi bob</span>
          </button>
        )}
        <select
          aria-label="Bobni tanlash"
          value={chapter.id}
          onChange={(e) => router.push("/read/" + e.target.value + suffix)}
        >
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.number}-bob {c.name}
            </option>
          ))}
        </select>
        <div className="page-jump">
          <input
            aria-label="Sahifa raqami"
            type="number"
            min="1"
            max={pages.length}
            disabled={!pages.length}
            value={pages.length ? index + 1 : 0}
            onChange={(e) => changePage(Number(e.target.value) - 1)}
          />
          <span> / {pages.length}</span>
        </div>
        {chapters[chapterIndex + 1] ? (
          <Link
            aria-label="Keyingi bob"
            prefetch={false}
            href={"/read/" + chapters[chapterIndex + 1].id + suffix}
          >
            <span>Keyingi bob</span>
            <ChevronRight />
          </Link>
        ) : (
          <button disabled>
            <span>Keyingi bob</span>
            <ChevronRight />
          </button>
        )}
      </nav>
      {!preview && <TrackView id={title.id} chapterId={chapter.id} />}
      {message && !settings && (
        <div className="toast" role="status" onClick={() => setMessage("")}>
          {message}
          <button aria-label="Yopish">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
