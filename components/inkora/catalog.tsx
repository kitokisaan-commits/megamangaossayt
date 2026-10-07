"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { CoverCard, EmptyState } from "./cards";
import type { Item } from "@/lib/types";
export default function Catalog({ titles }: { titles: Item[] }) {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  useEffect(() => setQuery(params.get("q") || ""), [params]);
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(window.location.search);
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    window.history.replaceState(
      null,
      "",
      "/catalog" + (p.size ? "?" + p.toString() : ""),
    );
  };
  const q = (params.get("q") || "").toLowerCase();
  const filtered = titles.filter(
    (t) =>
      (!q ||
        [t.title, t.author, ...t.alt_names].some((s) =>
          s.toLowerCase().includes(q),
        )) &&
      (!params.get("type") || t.type === params.get("type")) &&
      (!params.get("status") || t.status === params.get("status")) &&
      (!params.get("genre") || t.genres.includes(params.get("genre"))) &&
      (!params.get("year") || String(t.year) === params.get("year")),
  );
  const sort = params.get("sort") || "updated";
  filtered.sort((a, b) =>
    sort === "alpha"
      ? a.title.localeCompare(b.title)
      : sort === "popular"
        ? b.views - a.views
        : sort === "newest"
          ? b.created_at.localeCompare(a.created_at)
          : (b.latest_chapter_at || b.updated_at).localeCompare(
              a.latest_chapter_at || a.updated_at,
            ),
  );
  const page = Math.min(
      Math.max(1, Math.ceil(filtered.length / 24)),
      Math.max(1, Math.floor(Number(params.get("page") || 1) || 1)),
    ),
    genres = [...new Set(titles.flatMap((t) => t.genres))].sort();
  return (
    <>
      <div className="catalog-heading">
        <div className="eyebrow">SIZNING KEYINGI HIKOYANGIZ</div>
        <h1>
          Katalog<span>.</span>
        </h1>
        <p>Manga, manhwa va webtoon — o‘zingizga mosini toping.</p>
      </div>
      <div className="catalog-filters">
        <div className="catalog-search">
          <Search size={18} />
          <input
            aria-label="Katalogda qidirish"
            value={query}
            placeholder="Nomi, muallifi yoki boshqa nomi…"
            onChange={(e) => {
              setQuery(e.target.value);
              set("q", e.target.value);
            }}
          />
        </div>
        <SlidersHorizontal size={18} />
        {[
          ["type", "Barcha turlar", ["Manga", "Manhwa", "Manhua", "Webtoon"]],
          [
            "status",
            "Barcha holatlar",
            ["Ongoing", "Completed", "Hiatus", "Cancelled"],
          ],
          ["genre", "Barcha janrlar", genres],
          [
            "year",
            "Barcha yillar",
            [...new Set(titles.map((t) => t.year).filter(Boolean))]
              .sort()
              .reverse()
              .map(String),
          ],
        ].map(([key, label, values]) => (
          <select
            key={key as string}
            aria-label={label as string}
            value={params.get(key as string) || ""}
            onChange={(e) => set(key as string, e.target.value)}
          >
            <option value="">{label as string}</option>
            {(values as string[]).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ))}
        {params.toString() && (
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              window.history.replaceState(null, "", "/catalog");
            }}
          >
            <X size={16} />
            Tozalash
          </button>
        )}
      </div>
      <div className="catalog-count">
        <span>{filtered.length} ta asar</span>
        <select
          aria-label="Saralash"
          value={sort}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option value="updated">So‘nggi yangilangan</option>
          <option value="newest">Yangi qo‘shilgan</option>
          <option value="alpha">Alifbo bo‘yicha</option>
          <option value="popular">Mashhurligi bo‘yicha</option>
        </select>
      </div>
      {filtered.length ? (
        <div className="cover-grid catalog-grid">
          {filtered.slice((page - 1) * 24, page * 24).map((t, i) => (
            <CoverCard key={t.id} title={t} index={i} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Asar topilmadi"
          description="Qidiruvni o‘zgartiring yoki filtrlarni tozalang."
        />
      )}
      {filtered.length > 24 && (
        <div className="pagination">
          {Array.from({ length: Math.ceil(filtered.length / 24) }, (_, i) => (
            <button
              className={page === i + 1 ? "active" : ""}
              key={i}
              onClick={() => {
                const p = new URLSearchParams(window.location.search);
                p.set("page", String(i + 1));
                window.history.replaceState(null, "", "/catalog?" + p);
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
