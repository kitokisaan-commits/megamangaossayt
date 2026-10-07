"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Archive, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/client";
import type { Item } from "@/lib/types";

export function GlobalAdminSearch() {
  const [q, setQ] = useState(""),
    [results, setResults] = useState<Item[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        setError("");
        return;
      }
      api("admin/search?q=" + encodeURIComponent(q))
        .then((r) => {
          if (live) {
            setResults(r);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
  return (
    <div className="admin-global-search">
      <Search size={16} />
      <Input
        aria-label="Global admin search"
        placeholder="Asar yoki bobni qidirish…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() && (
        <div
          className="admin-search-results"
          role="region"
          aria-label="Qidiruv natijalari"
        >
          {error && <p role="alert">{error}</p>}
          {!error && !results.length && <p>Natija topilmadi.</p>}
          {results.map((r) => (
            <Link key={r.id} href={r.href} onClick={() => setQ("")}>
              <strong>{r.label}</strong>
              <small>{r.detail}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
export function ArchivedRecords({
  titleId,
  notify,
  onRestore,
}: {
  titleId?: string;
  notify: (message: string) => void;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setRows(
        await api("admin/archive" + (titleId ? "?title_id=" + titleId : "")),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="cms-archive">
      <button
        type="button"
        className="button small"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        <Archive size={15} />
        Arxiv
      </button>
      {open && (
        <div className="panel">
          <h3>Arxivlangan {titleId ? "boblar" : "asarlar"}</h3>
          <p className="muted">
            Tiklangan kontent Draft holatida qoladi. Nashr qilishni alohida
            tasdiqlang.
          </p>
          {error && (
            <p role="alert" className="error-inline">
              {error}
            </p>
          )}
          {!rows.length && !error && <p>Arxiv bo‘sh.</p>}
          {rows.map((r) => (
            <div className="row archive-row" key={r.id}>
              <strong>{r.title || `${r.number}-bob · ${r.name}`}</strong>
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("admin/restore/" + r.id, "POST", {
                      kind: titleId ? "chapter" : "title",
                    });
                    await load();
                    onRestore();
                    notify("Draft holatida tiklandi.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RotateCcw size={14} />
                Tiklash
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function BulkChapters({
  chapters,
  titleId,
  onDone,
  notify,
}: {
  chapters: Item[];
  titleId: string;
  onDone: () => void;
  notify: (message: string) => void;
}) {
  const [ids, setIds] = useState<string[]>([]),
    [action, setAction] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = ids.filter((id) => chapters.some((c) => c.id === id));
  return (
    <details className="cms-bulk">
      <summary>Boblarni guruhlab boshqarish</summary>
      <p className="muted">
        Nashr qilish darhol chiqaradi va eski jadvalni tozalaydi. Bir amal uchun
        ko‘pi bilan 100 bob.
      </p>
      <div className="bulk-selection">
        {chapters.map((c) => (
          <label key={c.id} className="checkbox">
            <Checkbox
              aria-label={`${c.number}-bobni tanlash`}
              checked={selected.includes(c.id)}
              disabled={
                busy || (!selected.includes(c.id) && selected.length >= 100)
              }
              onCheckedChange={(checked) =>
                setIds(
                  checked
                    ? [...selected, c.id]
                    : selected.filter((id) => id !== c.id),
                )
              }
            />
            {c.number} · {c.name || c.status} · {c.page_count} sahifa
          </label>
        ))}
      </div>
      <div className="row">
        {[
          ["publish", "Nashr qilish"],
          ["draft", "Draft qilish"],
          ["archive", "Arxivlash"],
        ].map(([a, label]) => (
          <button
            type="button"
            className="button small"
            key={a}
            disabled={!selected.length || busy}
            onClick={() => {
              setError("");
              setAction(a);
            }}
          >
            {label} ({selected.length})
          </button>
        ))}
      </div>
      <AlertDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <AlertDialogContent className="cms-confirm">
          <AlertDialogTitle>
            {selected.length} bob uchun amalni tasdiqlang
          </AlertDialogTitle>
          <AlertDialogDescription>
            {action === "publish"
              ? "Tanlangan boblar darhol ommaga ochiladi. Bo‘sh boblar nashr qilinmaydi."
              : action === "archive"
                ? "Tanlangan boblar ommadan yashiriladi. Ularni arxivdan tiklash mumkin."
                : "Tanlangan boblar Draft bo‘ladi va ommadan yashiriladi."}
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="error-inline">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api(`admin/titles/${titleId}/chapters/bulk`, "POST", {
                    ids: selected,
                    action,
                  });
                  setAction(null);
                  setIds([]);
                  onDone();
                  notify("Boblar yangilandi.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saqlanmoqda…" : "Tasdiqlash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </details>
  );
}
