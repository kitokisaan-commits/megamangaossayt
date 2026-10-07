"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, ListFilter } from "lucide-react";
import { isNewChapter } from "@/lib/publication";
import type { Item } from "@/lib/types";
export default function ChapterList({
  chapters,
  preview = false,
}: {
  chapters: Item[];
  preview?: boolean;
}) {
  const [q, setQ] = useState(""),
    [asc, setAsc] = useState(false),
    [page, setPage] = useState(1);
  const cs = chapters
    .filter((c) =>
      (c.number + " " + c.name).toLowerCase().includes(q.toLowerCase()),
    )
    .sort((a, b) =>
      asc
        ? a.sort_order - b.sort_order || a.number - b.number
        : b.sort_order - a.sort_order || b.number - a.number,
    );
  return (
    <section className="chapter-list">
      <div className="section-heading">
        <h2>
          Boblar <span className="count">{chapters.length}</span>
        </h2>
        <div className="row">
          <div className="mini-search">
            <Search size={16} />
            <input
              aria-label="Bobni qidirish"
              placeholder="Bob raqami…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            className="icon-button"
            aria-label="Bob tartibini almashtirish"
            onClick={() => setAsc(!asc)}
          >
            <ListFilter size={18} />
          </button>
        </div>
      </div>
      {cs.slice((page - 1) * 50, page * 50).map((c) => (
        <Link
          prefetch={false}
          href={"/read/" + c.id + (preview ? "?preview=1" : "")}
          key={c.id}
          className="chapter-link"
        >
          <span>
            <strong>{c.number}-bob</strong>
            {!preview && isNewChapter(c) && (
              <em className="new-label">YANGI</em>
            )}
            {c.name && <span>{c.name}</span>}
          </span>
          <small>
            {c.status === "Draft"
              ? "DRAFT"
              : new Date(
                  c.published_at || c.publish_at || c.updated_at,
                ).toLocaleDateString("uz-UZ")}
          </small>
        </Link>
      ))}
      {!cs.length && <p className="muted">Boblar topilmadi.</p>}
      {cs.length > 50 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Oldingi
          </button>
          <span>
            {page} / {Math.ceil(cs.length / 50)}
          </span>
          <button
            disabled={page * 50 >= cs.length}
            onClick={() => setPage(page + 1)}
          >
            Keyingi
          </button>
        </div>
      )}
    </section>
  );
}
