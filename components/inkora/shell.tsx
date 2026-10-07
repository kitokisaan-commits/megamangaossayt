"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, X, Menu, ArrowUp, BookOpen } from "lucide-react";
import { api, readLocal, writeLocal } from "@/lib/client";
import type { Item, HistoryItem } from "@/lib/types";
export function Header({ initialTitles }: { initialTitles?: Item[] } = {}) {
  const router = useRouter();
  const [siteName, setSiteName] = useState("INKORA");
  useEffect(() => {
    api("public/settings")
      .then((s) => setSiteName(s?.name || "INKORA"))
      .catch(() => {});
  }, []);
  const [q, setQ] = useState(""),
    [results, setResults] = useState<Item[]>([]),
    [open, setOpen] = useState(false),
    [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      if (initialTitles) {
        const query = q.trim().toLocaleLowerCase();
        setResults(
          initialTitles
            .filter((t) =>
              [t.title, t.author, ...t.alt_names].some((s) =>
                s.toLocaleLowerCase().includes(query),
              ),
            )
            .slice(0, 8),
        );
        return;
      }
      fetch("/api/public/search?q=" + encodeURIComponent(q), {
        signal: abort.signal,
      })
        .then((r) => r.json())
        .then((d) => setResults(d as Item[]))
        .catch(() => {});
    }, 220);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q, initialTitles]);
  useEffect(() => {
    function outside(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="Inkora bosh sahifa">
          <span className="brand-mark">i</span>
          {siteName}
          <span className="brand-dot">.</span>
        </Link>
        <nav className={menu ? "main-nav expanded" : "main-nav"}>
          <Link href="/catalog" onClick={() => setMenu(false)}>
            Katalog
          </Link>
          <Link href="/catalog?sort=updated" onClick={() => setMenu(false)}>
            So‘nggi boblar
          </Link>
          <Link href="/catalog?status=Completed" onClick={() => setMenu(false)}>
            Tugallangan
          </Link>
        </nav>
        <div className="search-wrap" ref={root}>
          <Search size={18} />
          <input
            aria-label="Asar qidirish"
            placeholder="Yangi olamni qidiring…"
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter")
                router.push("/catalog?q=" + encodeURIComponent(q));
            }}
          />
          {q && (
            <button aria-label="Qidiruvni tozalash" onClick={() => setQ("")}>
              <X size={16} />
            </button>
          )}
          {open && q && (
            <div className="search-results">
              {results.length ? (
                results.map((t) => (
                  <Link
                    key={t.id}
                    href={"/title/" + t.slug}
                    onClick={() => setOpen(false)}
                  >
                    <img src={t.cover} alt="" />
                    <span>
                      <strong>{t.title}</strong>
                      <small>
                        {t.type} · {t.year}
                      </small>
                    </span>
                  </Link>
                ))
              ) : (
                <p>Natija topilmadi</p>
              )}
              <Link
                className="search-all"
                href={"/catalog?q=" + encodeURIComponent(q)}
              >
                Barcha natijalar
              </Link>
            </div>
          )}
        </div>
        <button
          className="mobile-menu icon-button"
          aria-label="Menyu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <Menu />
        </button>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <Link href="/" className="brand">
        INKORA.
      </Link>
      <p>Har sahifada yangi olam.</p>
      <div>
        <Link href="/catalog">Katalog</Link>
        {process.env.NEXT_PUBLIC_WORK_PREVIEW !== "true" && (
          <Link href="/admin">Tahririyat</Link>
        )}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Yuqoriga"
        >
          <ArrowUp size={17} />
        </button>
      </div>
      <small>© {new Date().getFullYear()} INKORA</small>
    </footer>
  );
}
export function ContinueReading() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  useEffect(
    () =>
      setItems(
        Object.values(
          readLocal<Record<string, HistoryItem>>("inkora.history", {}),
        )
          .sort((a, b) => b.time - a.time)
          .slice(0, 3),
      ),
    [],
  );
  if (!items.length) return null;
  return (
    <section className="continue-section">
      <div className="section-heading">
        <h2>Davom ettiring</h2>
        <span>To‘xtagan joyingizdan</span>
      </div>
      <div className="continue-grid">
        {items.map((h) => (
          <Link
            href={"/read/" + h.chapterId + "?resume=1"}
            key={h.titleId}
            className="continue-card"
          >
            <img src={h.cover} alt="" />
            <div>
              <small>O‘QISHNI DAVOM ETTIRISH</small>
              <h3>{h.title}</h3>
              <p>
                {h.chapterNumber}-bob · {h.page + 1}-sahifa
              </p>
            </div>
            <BookOpen size={20} />
          </Link>
        ))}
      </div>
    </section>
  );
}
export function ReadingCTA({ title, first }: { title: Item; first?: Item }) {
  const [history, setHistory] = useState<HistoryItem | null>(null);
  useEffect(
    () =>
      setHistory(
        readLocal<Record<string, HistoryItem>>("inkora.history", {})[
          title.id
        ] || null,
      ),
    [title.id],
  );
  if (!first) return <span className="muted">Boblar tez orada</span>;
  const resume =
    history && title.chapters?.some((c: Item) => c.id === history.chapterId)
      ? history
      : null;
  return (
    <Link
      className="button primary"
      href={
        "/read/" + (resume?.chapterId || first.id) + (resume ? "?resume=1" : "")
      }
    >
      <BookOpen size={18} />
      {resume ? "Davom ettirish" : "O‘qishni boshlash"}
    </Link>
  );
}
export function RecentlyViewed() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => setItems(readLocal<Item[]>("inkora.recent", [])), []);
  if (!items.length) return null;
  return (
    <section className="continue-section">
      <div className="section-heading">
        <h2>Yaqinda ko‘rganlar</h2>
        <button
          className="text-button"
          onClick={() => {
            writeLocal("inkora.recent", []);
            setItems([]);
          }}
        >
          Tarixni tozalash
        </button>
      </div>
      <div className="continue-grid">
        {items.map((t) => (
          <Link className="continue-card" href={"/title/" + t.slug} key={t.id}>
            <img src={t.cover} alt="" width={56} height={84} />
            <div>
              <small>{t.type}</small>
              <h3>{t.title}</h3>
              <p>{new Date(t.viewedAt).toLocaleDateString("uz-UZ")}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
export function TrackView({
  id,
  title,
  chapterId,
}: {
  id: string;
  title?: Item;
  chapterId?: string;
}) {
  useEffect(() => {
    if (title) {
      const recent = readLocal<Item[]>("inkora.recent", []).filter(
        (t) => t.id !== id,
      );
      writeLocal(
        "inkora.recent",
        [
          {
            id,
            title: title.title,
            slug: title.slug,
            cover: title.cover,
            type: title.type,
            viewedAt: Date.now(),
          },
          ...recent,
        ].slice(0, 12),
      );
    }
    if (process.env.NEXT_PUBLIC_WORK_PREVIEW === "true") return;
    // A brief visible visit qualifies; refreshes share an expiring server cookie.
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible")
        api("public/view", "POST", {
          title_id: id,
          chapter_id: chapterId,
        }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [id, title, chapterId]);
  return null;
}
