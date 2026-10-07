"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  LayoutDashboard,
  Library,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  Plus,
  Search,
  ExternalLink,
  Save,
  Trash2,
  GripVertical,
  RotateCw,
  ImagePlus,
  ChevronUp,
  ChevronDown,
  Check,
  X,
  Menu,
} from "lucide-react";
import { api } from "@/lib/client";
import type { Item } from "@/lib/types";
import Uploader from "./uploader";
import { GlobalAdminSearch, ArchivedRecords, BulkChapters } from "./cms-tools";
const initialTitle = {
  title: "",
  slug: "",
  description: "",
  type: "Manhwa",
  status: "Ongoing",
  year: new Date().getFullYear(),
  author: "",
  artist: "",
  tags: "",
  age_label: "All ages",
  direction: "vertical",
  origin: "",
  language: "Uzbek",
  publication_status: "Serializing",
  featured: 0,
  visibility: "Draft",
  seo_title: "",
  seo_description: "",
  alt_names: [],
  genres: [],
};
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a?.getAttribute("href") &&
        a.target !== "_blank" &&
        !a.getAttribute("href")?.startsWith("#") &&
        !confirm("Saqlanmagan o‘zgarishlar bor. Saqlamasdan chiqasizmi?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
}
function useDraft(_key: string, initial: Item) {
  const [data, setData] = useState<Item>(initial),
    [dirty, setDirty] = useState(false);
  useLeaveWarning(dirty);
  return {
    data,
    dirty,
    set: (k: string, v: unknown) => {
      setData((d) => ({ ...d, [k]: v }));
      setDirty(true);
    },
    saved: () => setDirty(false),
    replace: setData,
  };
}
function Login({ onLogin }: { onLogin: (u: Item) => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main id="main" className="login-page">
      <Link href="/" className="brand">
        <span className="brand-mark">i</span>INKORA.
      </Link>
      <div className="login-card">
        <span className="eyebrow">TAHRIRIYAT</span>
        <h1>Hikoyalar shu yerdan boshlanadi.</h1>
        <p>Davom etish uchun administrator hisobingizga kiring.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              onLogin(
                await api("auth/login", "POST", {
                  username: f.get("username"),
                  password: f.get("password"),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Login">
            <input name="username" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Parol">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          {error && (
            <p role="alert" className="error-inline">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Tekshirilmoqda…" : "Kirish"}
          </button>
        </form>
        <Link href="/">O‘qishga qaytish</Link>
      </div>
      <small>INKORA / EDITORIAL DESK</small>
    </main>
  );
}
function ChangePassword({ done }: { done: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main id="main" className="login-page">
      <div className="login-card">
        <ShieldCheck size={32} />
        <h1>Yangi parol o‘rnating.</h1>
        <p>
          Davom etishdan oldin boshlang‘ich parolingizni almashtiring. Kamida 12
          belgi ishlating.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm")) {
              setError("Parollar bir xil emas.");
              return;
            }
            setBusy(true);
            try {
              await api("auth/password", "POST", {
                password: f.get("password"),
              });
              done();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Yangi parol">
            <input
              type="password"
              name="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="Parolni takrorlang">
            <input
              type="password"
              name="confirm"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </Field>
          {error && (
            <p className="error-inline" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            Saqlash va qayta kirish
          </button>
        </form>
      </div>
    </main>
  );
}
export default function Admin() {
  const pathname = usePathname(),
    router = useRouter(),
    [user, setUser] = useState<Item | null>(null),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    api("auth/me")
      .then(setUser)
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [pathname]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  const notify = (s: string) => {
    setMessage(s);
    setTimeout(() => setMessage(""), 6000);
  };
  if (loading)
    return (
      <div className="loading-state">
        <div className="spinner" />
        Yuklanmoqda…
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  if (user.must_change) return <ChangePassword done={() => setUser(null)} />;
  const parts = pathname.split("/").filter(Boolean).slice(1);
  const nav: [string, string, React.ElementType][] = [
    ["", "Umumiy", LayoutDashboard],
    ["titles", "Asarlar", Library],
    ...(user.role === "SUPERADMIN"
      ? ([
          ["admins", "Administratorlar", Users],
          ["audit", "Audit jurnali", ShieldCheck],
          ["settings", "Sozlamalar", Settings],
        ] as [string, string, React.ElementType][])
      : []),
  ];
  return (
    <div className="admin-shell">
      {menu && (
        <button
          type="button"
          className="admin-backdrop"
          aria-label="Admin menyusini yopish"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"admin-sidebar " + (menu ? "open" : "")}>
        <button
          type="button"
          className="icon-button admin-sidebar-close"
          aria-label="Menyuni yopish"
          onClick={() => setMenu(false)}
        >
          <X size={20} />
        </button>
        <Link href="/" className="brand">
          <span className="brand-mark">i</span>INKORA.
        </Link>
        <span className="sidebar-label">TAHRIRIYAT</span>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <Link
              key={path as string}
              className={(parts[0] || "") === path ? "active" : ""}
              href={"/admin" + (path ? "/" + path : "")}
            >
              {<Icon size={19} />} {label as string}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            <ExternalLink size={17} />
            Saytni ko‘rish
          </Link>
          <div className="admin-identity">
            <div>{user.display_name.slice(0, 1)}</div>
            <span>
              <strong>{user.display_name}</strong>
              <small>{user.role}</small>
            </span>
          </div>
          <button
            onClick={async () => {
              if (
                document.querySelector('form[data-dirty="true"]') &&
                !confirm("Saqlanmagan o‘zgarishlar bor. Chiqasizmi?")
              )
                return;
              await api("auth/logout", "POST", {});
              setUser(null);
              router.push("/admin");
            }}
          >
            <LogOut size={17} />
            Chiqish
          </button>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-top">
          <button
            className="icon-button mobile-menu"
            aria-label="Admin menyusi"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span>
            Workspace <span>/</span>{" "}
            {parts[0] === "titles"
              ? "Asarlar"
              : parts[0] === "chapters"
                ? "Bob muharriri"
                : parts[0] === "admins"
                  ? "Administratorlar"
                  : parts[0] === "audit"
                    ? "Audit jurnali"
                    : parts[0] === "settings"
                      ? "Sozlamalar"
                      : "Umumiy"}
          </span>
          <GlobalAdminSearch />
          <Link href="/catalog">
            <BookOpen size={16} />
            Reader
          </Link>
        </header>
        <main id="main" className="admin-main">
          {!parts.length ? (
            <Dashboard />
          ) : parts[0] === "titles" && !parts[1] ? (
            <TitleTable user={user} notify={notify} />
          ) : parts[0] === "titles" && parts[1] === "new" ? (
            <TitleForm key="new" user={user} notify={notify} />
          ) : parts[0] === "titles" && parts[1] ? (
            <TitleEditor
              key={parts[1]}
              id={parts[1]}
              user={user}
              notify={notify}
              chaptersOnly={parts[2] === "chapters"}
            />
          ) : parts[0] === "chapters" && parts[1] ? (
            <ChapterEditor
              key={parts[1]}
              id={parts[1]}
              user={user}
              notify={notify}
            />
          ) : parts[0] === "admins" ? (
            <Administrators user={user} notify={notify} />
          ) : parts[0] === "audit" ? (
            <Audit />
          ) : parts[0] === "settings" ? (
            <SiteSettings notify={notify} />
          ) : (
            <p>Sahifa topilmadi.</p>
          )}
        </main>
      </div>
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <button aria-label="Xabarni yopish" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function useLoad(path: string) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      api(path)
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((e) => setError(e.message)),
    [path],
  );
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}
function LoadError({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="error-inline">
      {error}
    </p>
  ) : (
    <div className="loading-state">
      <div className="spinner" />
      Yuklanmoqda…
    </div>
  );
}
function Dashboard() {
  const { data: d, error } = useLoad("admin/dashboard");
  if (!d) return <LoadError error={error} />;
  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">BUGUNGI ISHLAR</div>
          <h1>Tahririyat stoli</h1>
          <p>Hikoyalarni tayyorlang. O‘quvchilarga yetkazing.</p>
        </div>
        <Link className="button primary" href="/admin/titles">
          <Library size={18} />
          Asarlarni boshqarish
        </Link>
      </div>
      <div className="stats-grid">
        {[
          ["Asarlar", d.titles],
          ["Jami boblar", d.chapters],
          ["Nashr qilingan", d.published],
          ["Saqlangan rasmlar", (d.storage / 1048576).toFixed(1) + " MB"],
        ].map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <div className="admin-two-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>So‘nggi asarlar</h2>
            <Link href="/admin/titles">Barchasi</Link>
          </div>
          {d.recent.map((t: Item) => (
            <Link
              className="admin-recent"
              href={"/admin/titles/" + t.id}
              key={t.id}
            >
              <img
                src={
                  t.cover_id
                    ? "/api/assets/" + t.cover_id + "?kind=thumb"
                    : "/demo/empty-cover.png"
                }
                alt=""
              />
              <span>
                <strong>{t.title}</strong>
                <small>
                  {t.type} · {t.visibility}
                </small>
              </span>
              <ExternalLink size={16} />
            </Link>
          ))}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>So‘nggi amallar</h2>
          </div>
          {d.logs.map((l: Item) => (
            <div className="audit-mini" key={l.id}>
              <span className="audit-dot" />
              <div>
                <strong>{l.action}</strong>
                <p>{l.entity}</p>
                <small>
                  {l.actor} · {new Date(l.created_at).toLocaleString("uz-UZ")}
                </small>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
function TitleTable({
  user,
  notify,
}: {
  user: Item;
  notify: (s: string) => void;
}) {
  const { data, error, reload } = useLoad("admin/titles"),
    [q, setQ] = useState("");
  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">KONTENT KUTUBXONASI</div>
          <h1>Asarlar</h1>
          <p>Draftdan birinchi o‘quvchigacha.</p>
        </div>
        {user.role !== "EDITOR" && (
          <Link className="button primary" href="/admin/titles/new">
            <Plus size={18} />
            Yangi asar
          </Link>
        )}
      </div>
      {user.role !== "EDITOR" && (
        <ArchivedRecords notify={notify} onRestore={reload} />
      )}
      <div className="mini-search table-search">
        <Search size={18} />
        <input
          aria-label="Asarlarni qidirish"
          placeholder="Nomi yoki slug bo‘yicha qidirish"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {!data ? (
        <LoadError error={error} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asar</th>
                <th>Tur</th>
                <th>Holat</th>
                <th>Yangilangan</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((t: Item) =>
                  (t.title + " " + t.slug)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                )
                .map((t: Item) => (
                  <tr key={t.id}>
                    <td>
                      <Link
                        className="table-title"
                        href={"/admin/titles/" + t.id}
                      >
                        {t.cover_id ? (
                          <img src={t.cover} alt="" />
                        ) : (
                          <span className="cover-placeholder">
                            <BookOpen />
                          </span>
                        )}
                        <span>
                          <strong>{t.title}</strong>
                          <small>/{t.slug}</small>
                        </span>
                      </Link>
                    </td>
                    <td>{t.type}</td>
                    <td>
                      <span className={"status " + t.visibility.toLowerCase()}>
                        {t.visibility}
                      </span>
                    </td>
                    <td>
                      {new Date(t.updated_at).toLocaleDateString("uz-UZ")}
                    </td>
                    <td>
                      <div className="row">
                        <Link
                          className="button small"
                          href={"/admin/titles/" + t.id}
                        >
                          Tahrirlash
                        </Link>
                        {user.role !== "EDITOR" && (
                          <button
                            className="icon-button danger"
                            aria-label={t.title + " asarini arxivlash"}
                            onClick={async () => {
                              if (
                                confirm(
                                  `“${t.title}” va uning barcha boblari ommadan yashiriladi. Arxivlaysizmi?`,
                                )
                              ) {
                                try {
                                  await api("admin/titles/" + t.id, "DELETE");
                                  notify("Asar arxivlandi.");
                                  reload();
                                } catch (e) {
                                  notify((e as Error).message);
                                }
                              }
                            }}
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!data.length && (
            <p className="empty-state">Birinchi asaringizni yarating.</p>
          )}
        </div>
      )}
    </>
  );
}
function TitleEditor({
  id,
  user,
  notify,
  chaptersOnly,
}: {
  id: string;
  user: Item;
  notify: (s: string) => void;
  chaptersOnly: boolean;
}) {
  const { data, error, reload } = useLoad("admin/titles/" + id);
  if (!data) return <LoadError error={error} />;
  return (
    <>
      {chaptersOnly ? (
        <ChapterManager title={data} user={user} notify={notify} />
      ) : (
        <>
          <TitleForm initial={data} user={user} notify={notify} />
          <div className="admin-two-columns">
            <section className="panel">
              <h2>Muqova</h2>
              {data.cover_id && (
                <img
                  className="admin-cover-preview"
                  src={"/api/assets/" + data.cover_id + "?kind=thumb"}
                  alt="Muqova"
                />
              )}
              <Uploader titleId={id} onDone={reload} />
            </section>
            <section className="panel">
              <h2>Banner (ixtiyoriy)</h2>
              {data.banner_id && (
                <img
                  className="admin-banner-preview"
                  src={"/api/assets/" + data.banner_id}
                  alt="Banner"
                />
              )}
              <Uploader titleId={id} banner onDone={reload} />
            </section>
          </div>
          <ChapterManager title={data} user={user} notify={notify} />
          {user.role !== "EDITOR" && (
            <EditorAssignments titleId={id} notify={notify} />
          )}
        </>
      )}
    </>
  );
}
function TitleForm({
  initial,
  user,
  notify,
}: {
  initial?: Item;
  user: Item;
  notify: (s: string) => void;
}) {
  const router = useRouter(),
    d = useDraft("title." + (initial?.id || "new"), initial || initialTitle),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const data = d.data;
  const text = (k: string, label: string, type = "text") => (
    <Field label={label}>
      <input
        type={type}
        value={data[k] ?? ""}
        onChange={(e) =>
          d.set(
            k,
            type === "number"
              ? e.target.value
                ? Number(e.target.value)
                : null
              : e.target.value,
          )
        }
      />
    </Field>
  );
  const select = (k: string, label: string, options: string[]) => (
    <Field label={label}>
      <select value={data[k]} onChange={(e) => d.set(k, e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </Field>
  );
  return (
    <form
      data-dirty={d.dirty}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
          const result = await api(
            "admin/titles" + (initial ? "/" + initial.id : ""),
            initial ? "PUT" : "POST",
            {
              ...data,
              alt_names: data.alt_names.filter((s: string) => s.trim()),
              genres: data.genres.filter((s: string) => s.trim()),
            },
          );
          d.saved();
          notify(
            initial
              ? "O‘zgarishlar saqlandi."
              : "Asar yaratildi. Endi muqova va boblarni qo‘shing.",
          );
          if (!initial) router.replace("/admin/titles/" + result.id);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="admin-heading">
        <div>
          <div className="eyebrow">
            {initial ? "ASAR MUHARRIRI" : "YANGI HIKOYA"}
          </div>
          <h1>{initial ? initial.title : "Yangi asar"}</h1>
          <p>
            {d.dirty
              ? "Saqlanmagan o‘zgarishlar"
              : "Barcha o‘zgarishlar saqlangan"}
          </p>
        </div>
        <div className="row">
          {initial && (
            <Link
              className="button"
              href={"/title/" + data.slug + "?preview=1"}
              target="_blank"
            >
              <ExternalLink size={16} />
              Ko‘rib chiqish
            </Link>
          )}
          <button className="button primary" disabled={saving}>
            <Save size={17} />
            {saving ? "Saqlanmoqda…" : "Saqlash"}
          </button>
        </div>
      </div>
      {error && (
        <p className="error-inline" role="alert">
          {error}
        </p>
      )}
      <div className="admin-two-columns form-columns">
        <section className="panel">
          <h2>Asosiy ma’lumotlar</h2>
          <Field label="Asar nomi *">
            <input
              required
              value={data.title}
              onChange={(e) => {
                d.set("title", e.target.value);
                if (!initial)
                  d.set(
                    "slug",
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  );
              }}
            />
          </Field>
          <Field label="Slug *">
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={data.slug}
              onChange={(e) => d.set("slug", e.target.value)}
            />
          </Field>
          <Field label="Boshqa nomlar (har qatorda bittadan)">
            <textarea
              value={data.alt_names.join("\n")}
              onChange={(e) => d.set("alt_names", e.target.value.split("\n"))}
            />
          </Field>
          <Field label="Qisqacha mazmun">
            <textarea
              rows={6}
              value={data.description}
              onChange={(e) => d.set("description", e.target.value)}
            />
          </Field>
          <div className="form-grid">
            {text("author", "Muallif")}
            {text("artist", "Rassom")}
            {text("year", "Chiqqan yil", "number")}
            {text("origin", "Mamlakat / kelib chiqishi")}
          </div>
          <Field label="Janrlar (vergul bilan ajrating)">
            <input
              value={data.genres.join(",")}
              onChange={(e) => d.set("genres", e.target.value.split(","))}
            />
          </Field>
          {text("tags", "Teglar (vergul bilan)")}
        </section>
        <section className="panel">
          <h2>Nashr sozlamalari</h2>
          <div className="form-grid">
            {select("type", "Asar turi", [
              "Manga",
              "Manhwa",
              "Manhua",
              "Webtoon",
            ])}
            {select("status", "Asar holati", [
              "Ongoing",
              "Completed",
              "Hiatus",
              "Cancelled",
            ])}
          </div>
          <Field label="Ko‘rinishi">
            <select
              disabled={user.role === "EDITOR"}
              value={data.visibility}
              onChange={(e) => d.set("visibility", e.target.value)}
            >
              <option>Draft</option>
              <option>Published</option>
              <option>Hidden</option>
            </select>
          </Field>
          <Field label="O‘qish yo‘nalishi">
            <select
              value={data.direction}
              onChange={(e) => d.set("direction", e.target.value)}
            >
              <option value="vertical">Vertikal</option>
              <option value="rtl">O‘ngdan chapga</option>
              <option value="ltr">Chapdan o‘ngga</option>
            </select>
          </Field>
          {text("language", "Til")}
          {text("age_label", "Yosh / kontent belgisi")}
          {text("publication_status", "Nashr holati")}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!data.featured}
              disabled={user.role === "EDITOR"}
              onChange={(e) => d.set("featured", e.target.checked ? 1 : 0)}
            />
            Bosh sahifada tavsiya qilish
          </label>
          <hr />
          <h2>Qidiruv va ulashish</h2>
          {text("seo_title", "SEO sarlavha")}
          <Field label="SEO tavsif">
            <textarea
              value={data.seo_description}
              onChange={(e) => d.set("seo_description", e.target.value)}
            />
          </Field>
        </section>
      </div>
    </form>
  );
}
function EditorAssignments({
  titleId,
  notify,
}: {
  titleId: string;
  notify: (s: string) => void;
}) {
  const { data: editors } = useLoad("admin/editor-options"),
    { data: assigned, reload } = useLoad(
      "admin/titles/" + titleId + "/editors",
    );
  if (!editors || !assigned) return null;
  return (
    <section className="panel">
      <h2>Biriktirilgan editorlar</h2>
      <p className="muted">
        Editor faqat unga biriktirilgan asar va boblarni tahrirlaydi.
      </p>
      {!editors.length && <p>Hali editor hisoblari yo‘q.</p>}
      {editors.map((e: Item) => (
        <label className="checkbox" key={e.id}>
          <input
            type="checkbox"
            checked={assigned.some((a: Item) => a.user_id === e.id)}
            onChange={async (ev) => {
              const ids = assigned.map((a: Item) => a.user_id);
              try {
                await api("admin/titles/" + titleId + "/editors", "PUT", {
                  ids: ev.target.checked
                    ? [...ids, e.id]
                    : ids.filter((id: string) => id !== e.id),
                });
                reload();
                notify("Ruxsatlar saqlandi.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          />
          {e.display_name} (@{e.username})
        </label>
      ))}
    </section>
  );
}
function ChapterManager({
  title,
  user,
  notify,
}: {
  title: Item;
  user: Item;
  notify: (s: string) => void;
}) {
  const router = useRouter();
  const {
      data: chapters,
      error,
      reload,
    } = useLoad("admin/titles/" + title.id + "/chapters"),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>
          Boblar <span className="count">{chapters?.length || 0}</span>
        </h2>
      </div>
      {user.role !== "EDITOR" && (
        <ArchivedRecords
          titleId={title.id}
          notify={notify}
          onRestore={reload}
        />
      )}
      {chapters && user.role !== "EDITOR" && (
        <BulkChapters
          chapters={chapters}
          titleId={title.id}
          onDone={reload}
          notify={notify}
        />
      )}
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const c = await api(
              "admin/titles/" + title.id + "/chapters",
              "POST",
              {
                number: Number(f.get("number")),
                name: f.get("name"),
                volume: f.get("volume"),
                status: "Draft",
              },
            );
            notify("Bob yaratildi.");
            router.push("/admin/chapters/" + c.id);
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Bob raqami">
          <input
            type="number"
            step="any"
            min="0"
            name="number"
            required
            placeholder="1.5"
          />
        </Field>
        <Field label="Bob nomi">
          <input name="name" placeholder="Yangi boshlanish" />
        </Field>
        <Field label="Jild (ixtiyoriy)">
          <input name="volume" />
        </Field>
        <button className="button primary" disabled={busy}>
          <Plus size={18} />
          Bob qo‘shish
        </button>
      </form>
      {!chapters ? (
        <LoadError error={error} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bob</th>
                <th>Holat</th>
                <th>Nashr sanasi</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((c: Item) => (
                <tr key={c.id}>
                  <td>
                    <Link href={"/admin/chapters/" + c.id}>
                      <strong>{c.number}-bob</strong> {c.name}
                    </Link>
                  </td>
                  <td>
                    <span className={"status " + c.status.toLowerCase()}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    {c.publish_at
                      ? new Date(c.publish_at).toLocaleString("uz-UZ")
                      : "—"}
                  </td>
                  <td>
                    <div className="row">
                      <Link
                        className="button small"
                        href={"/admin/chapters/" + c.id}
                      >
                        Tahrirlash
                      </Link>
                      <Link
                        className="icon-button"
                        aria-label="Bobni ko‘rish"
                        href={"/read/" + c.id + "?preview=1"}
                        target="_blank"
                      >
                        <ExternalLink size={16} />
                      </Link>
                      {user.role !== "EDITOR" && (
                        <button
                          className="icon-button danger"
                          aria-label="Bobni arxivlash"
                          onClick={async () => {
                            if (
                              confirm(
                                `${c.number}-bob yashiriladi. Arxivlaysizmi?`,
                              )
                            ) {
                              try {
                                await api("admin/chapters/" + c.id, "DELETE");
                                reload();
                                notify("Bob arxivlandi.");
                              } catch (e) {
                                notify((e as Error).message);
                              }
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function ChapterEditor({
  id,
  user,
  notify,
}: {
  id: string;
  user: Item;
  notify: (s: string) => void;
}) {
  const { data, error, reload } = useLoad("admin/chapters/" + id);
  if (!data) return <LoadError error={error} />;
  return (
    <ChapterForm
      key={id}
      initial={data}
      user={user}
      notify={notify}
      reload={reload}
    />
  );
}
function ChapterForm({
  initial,
  user,
  notify,
  reload,
}: {
  initial: Item;
  user: Item;
  notify: (s: string) => void;
  reload: () => void;
}) {
  const d = useDraft("chapter." + initial.id, initial),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState<string | null>(null),
    [replaceId, setReplaceId] = useState<string | null>(null);
  const pages = initial.pages as Item[];
  const move = async (from: number, to: number) => {
    if (to < 0 || to >= pages.length) return;
    const ids = pages.map((p) => p.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    try {
      await api("admin/chapters/" + initial.id + "/pages", "PUT", { ids });
      reload();
      notify("Sahifalar tartibi saqlandi.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <form
        data-dirty={d.dirty}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("admin/chapters/" + initial.id, "PUT", d.data);
            d.saved();
            notify("Bob saqlandi.");
            reload();
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="breadcrumb">
          <Link href={"/admin/titles/" + initial.title_id}>
            {initial.title.title}
          </Link>
          <span>/</span>
          {initial.number}-bob
        </div>
        <div className="admin-heading">
          <div>
            <div className="eyebrow">BOB MUHARRIRI</div>
            <h1>
              {initial.number}-bob{initial.name ? " · " + initial.name : ""}
            </h1>
            <p>
              {pages.length} sahifa ·{" "}
              {d.dirty ? "Saqlanmagan o‘zgarishlar" : "O‘zgarishlar saqlangan"}
            </p>
          </div>
          <div className="row">
            <Link
              className="button"
              href={"/read/" + initial.id + "?preview=1"}
              target="_blank"
            >
              <ExternalLink size={16} />
              Preview
            </Link>
            <button className="button primary" disabled={busy}>
              <Save size={16} />
              {busy ? "Saqlanmoqda…" : "Saqlash"}
            </button>
          </div>
        </div>
        <section className="panel form-grid chapter-fields">
          <Field label="Bob raqami">
            <input
              type="number"
              min="0"
              step="any"
              value={d.data.number}
              onChange={(e) => d.set("number", Number(e.target.value))}
              required
            />
          </Field>
          <Field label="Bob nomi">
            <input
              value={d.data.name}
              onChange={(e) => d.set("name", e.target.value)}
            />
          </Field>
          <Field label="Jild">
            <input
              value={d.data.volume}
              onChange={(e) => d.set("volume", e.target.value)}
            />
          </Field>
          <Field label="Tartib raqami">
            <input
              type="number"
              step="any"
              value={d.data.sort_order}
              onChange={(e) => d.set("sort_order", Number(e.target.value))}
            />
          </Field>
          <Field label="Holat">
            <select
              disabled={user.role === "EDITOR"}
              value={d.data.status}
              onChange={(e) => d.set("status", e.target.value)}
            >
              <option>Draft</option>
              <option>Published</option>
            </select>
          </Field>
          <Field label="Nashr vaqti (ixtiyoriy)">
            <input
              disabled={user.role === "EDITOR"}
              type="datetime-local"
              value={
                d.data.publish_at
                  ? new Date(
                      Date.parse(d.data.publish_at) -
                        new Date().getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) =>
                d.set(
                  "publish_at",
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null,
                )
              }
            />
          </Field>
        </section>
      </form>
      <section className="panel">
        <div className="section-heading">
          <h2>Sahifalarni yuklash</h2>
          <span>Asl sifat saqlanadi</span>
        </div>
        <Uploader
          titleId={initial.title_id}
          chapterId={initial.id}
          onDone={reload}
          jobs={initial.jobs}
        />
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Sahifalar <span className="count">{pages.length}</span>
          </h2>
          <span>Sudrang yoki tartib tugmalaridan foydalaning</span>
        </div>
        {replaceId && (
          <div className="panel">
            <div className="section-heading">
              <h3>Sahifani almashtirish · bitta rasm tanlang</h3>
              <button
                className="icon-button"
                aria-label="Almashtirishni bekor qilish"
                onClick={() => setReplaceId(null)}
              >
                <X />
              </button>
            </div>
            <Uploader
              titleId={initial.title_id}
              chapterId={initial.id}
              singleImage
              onDone={async (jobId) => {
                if (!jobId) {
                  reload();
                  return;
                }
                try {
                  await api(
                    "admin/chapters/" + initial.id + "/pages/" + replaceId,
                    "PUT",
                    { replacement_job_id: jobId },
                  );
                  setReplaceId(null);
                  notify("Sahifa almashtirildi.");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  reload();
                }
              }}
            />
          </div>
        )}
        <div className="page-manager">
          {pages.map((p, i) => (
            <div
              key={p.id}
              className="page-tile"
              draggable
              onDragStart={() => setDrag(p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag)
                  move(
                    pages.findIndex((p) => p.id === drag),
                    i,
                  );
                setDrag(null);
              }}
            >
              <div className="page-tile-head">
                <span>
                  <GripVertical size={16} />
                  {String(i + 1).padStart(2, "0")}
                </span>
                <small>
                  {p.width}×{p.height}
                </small>
              </div>
              <a href={p.src} target="_blank">
                <img src={p.src} alt={`${i + 1}-sahifa`} loading="lazy" />
              </a>
              <p title={p.filename}>{p.filename}</p>
              <div className="page-actions">
                <button
                  className="icon-button"
                  aria-label={`${i + 1}-sahifani oldinga`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${i + 1}-sahifani orqaga`}
                  disabled={i === pages.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${i + 1}-sahifani aylantirish`}
                  onClick={async () => {
                    try {
                      await api(
                        "admin/chapters/" + initial.id + "/pages/" + p.id,
                        "POST",
                        {},
                      );
                      reload();
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <RotateCw size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${i + 1}-sahifani almashtirish`}
                  onClick={() => setReplaceId(p.id)}
                >
                  <ImagePlus size={16} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`${i + 1}-sahifani o‘chirish`}
                  onClick={async () => {
                    if (confirm(`${i + 1}-sahifani butunlay o‘chirasizmi?`)) {
                      try {
                        await api(
                          "admin/chapters/" + initial.id + "/pages/" + p.id,
                          "DELETE",
                        );
                        reload();
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {!pages.length && (
          <p className="empty-state">
            Rasm, ZIP yoki PDF yuklang. Sahifalar shu yerda ko‘rinadi.
          </p>
        )}
        <p className="muted">
          O‘zgarishlar sahifa tartibini saqlaydi. Almashtirish tugmasi orqali
          eski rasmni yangi rasmga almashtiring.
        </p>
      </section>
    </>
  );
}
function Administrators({
  user,
  notify,
}: {
  user: Item;
  notify: (s: string) => void;
}) {
  const { data, error, reload } = useLoad("admin/admins"),
    [editing, setEditing] = useState<Item | null>(null),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useLeaveWarning(show && dirty);
  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">SOZLAMALAR / JAMOA</div>
          <h1>Administratorlar</h1>
          <p>Hisoblar, rollar va kirish huquqlari.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setDirty(false);
            setShow(true);
          }}
        >
          <Plus size={18} />
          Admin yaratish
        </button>
      </div>
      {show && (
        <section className="panel">
          <div className="section-heading">
            <h2>{editing ? "Hisobni tahrirlash" : "Yangi administrator"}</h2>
            <button
              className="icon-button"
              aria-label="Yopish"
              onClick={() => {
                if (
                  !dirty ||
                  confirm("Saqlanmagan o‘zgarishlar bor. Chiqasizmi?")
                ) {
                  setShow(false);
                  setDirty(false);
                }
              }}
            >
              <X />
            </button>
          </div>
          <form
            data-dirty={show && dirty}
            onChange={() => setDirty(true)}
            key={editing?.id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                b: Item = {
                  username: f.get("username"),
                  display_name: f.get("display_name"),
                  role: f.get("role"),
                  active: f.get("active") === "on" ? 1 : 0,
                };
              if (f.get("password")) b.password = f.get("password");
              setBusy(true);
              try {
                await api(
                  "admin/admins" + (editing ? "/" + editing.id : ""),
                  editing ? "PUT" : "POST",
                  b,
                );
                setShow(false);
                setDirty(false);
                reload();
                notify(
                  editing
                    ? "Hisob yangilandi."
                    : "Administrator yaratildi. Birinchi kirishda parol almashtiriladi.",
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Login">
                <input
                  name="username"
                  defaultValue={editing?.username}
                  disabled={!!editing}
                  required
                  pattern="[a-z0-9_]{3,40}"
                />
              </Field>
              <Field label="Ko‘rinadigan ism">
                <input
                  name="display_name"
                  defaultValue={editing?.display_name}
                  required
                />
              </Field>
              <Field
                label={
                  editing ? "Yangi parol (ixtiyoriy)" : "Boshlang‘ich parol"
                }
              >
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required={!editing}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Rol">
                <select name="role" defaultValue={editing?.role || "ADMIN"}>
                  <option>ADMIN</option>
                  <option>EDITOR</option>
                  <option>SUPERADMIN</option>
                </select>
              </Field>
            </div>
            <label className="checkbox">
              <input
                name="active"
                type="checkbox"
                defaultChecked={editing ? !!editing.active : true}
              />
              Faol hisob
            </label>
            <button className="button primary" disabled={busy}>
              <Save size={17} />
              Saqlash
            </button>
          </form>
        </section>
      )}
      {!data ? (
        <LoadError error={error} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Rol</th>
                <th>Holat</th>
                <th>Yaratilgan</th>
                <th>Oxirgi kirish</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a: Item) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.display_name}</strong>
                    <small>@{a.username}</small>
                  </td>
                  <td>{a.role}</td>
                  <td>
                    <span
                      className={
                        "status " + (a.active ? "published" : "hidden")
                      }
                    >
                      {a.active ? "Faol" : "O‘chirilgan"}
                    </span>
                  </td>
                  <td>{new Date(a.created_at).toLocaleDateString("uz-UZ")}</td>
                  <td>
                    {a.last_login
                      ? new Date(a.last_login).toLocaleString("uz-UZ")
                      : "Hali kirmagan"}
                  </td>
                  <td>
                    {a.id !== user.id && (
                      <div className="row">
                        <button
                          className="button small"
                          onClick={() => {
                            setEditing(a);
                            setDirty(false);
                            setShow(true);
                          }}
                        >
                          Tahrirlash
                        </button>
                        <button
                          className="icon-button danger"
                          aria-label="Administratorni o‘chirish"
                          onClick={async () => {
                            if (
                              confirm(
                                `@${a.username} hisobini butunlay o‘chirasizmi?`,
                              )
                            ) {
                              try {
                                await api("admin/admins/" + a.id, "DELETE");
                                reload();
                                notify("Hisob o‘chirildi.");
                              } catch (e) {
                                notify((e as Error).message);
                              }
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function Audit() {
  const { data, error } = useLoad("admin/audit"),
    [q, setQ] = useState("");
  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">XAVFSIZLIK</div>
          <h1>Audit jurnali</h1>
          <p>
            So‘nggi 300 amal. Yozuvlar administrator tomonidan o‘zgartirilmaydi.
          </p>
        </div>
      </div>
      <div className="mini-search table-search">
        <Search size={18} />
        <input
          aria-label="Auditda qidirish"
          placeholder="Amal, login yoki asar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {!data ? (
        <LoadError error={error} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Kim</th>
                <th>Amal</th>
                <th>Obyekt</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((l: Item) =>
                  (l.actor + l.action + l.entity)
                    .toLowerCase()
                    .includes(q.toLowerCase()),
                )
                .map((l: Item) => (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleString("uz-UZ")}</td>
                    <td>{l.actor}</td>
                    <td>
                      <code>{l.action}</code>
                    </td>
                    <td>{l.entity}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function SiteSettings({ notify }: { notify: (s: string) => void }) {
  const { data, error } = useLoad("admin/settings"),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  useLeaveWarning(dirty);
  if (!data) return <LoadError error={error} />;
  return (
    <>
      <div className="admin-heading">
        <div>
          <div className="eyebrow">PLATFORMA</div>
          <h1>Sozlamalar</h1>
        </div>
      </div>
      <section className="panel settings-panel">
        <form
          data-dirty={dirty}
          onChange={() => setDirty(true)}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await api("admin/settings", "PUT", Object.fromEntries(f));
              setDirty(false);
              notify("Sozlamalar saqlandi.");
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Sayt nomi">
            <input name="name" defaultValue={data.name} required />
          </Field>
          <Field label="Tavsif">
            <textarea name="description" defaultValue={data.description} />
          </Field>
          <Field label="Bitta import limiti (MB)">
            <input
              type="number"
              name="max_upload_mb"
              defaultValue={data.max_upload_mb}
              min="1"
              max="250"
              required
            />
          </Field>
          <Field label="Bobdagi sahifalar limiti">
            <input
              type="number"
              name="max_pages"
              defaultValue={data.max_pages}
              min="1"
              max="2000"
              required
            />
          </Field>
          <p className="muted">
            Importlar 2 MB bo‘laklarda yuklanadi. ZIP ochilgandan keyingi hajm
            server konfiguratsiyasida cheklanadi.
          </p>
          <button className="button primary" disabled={busy}>
            <Save size={17} />
            Sozlamalarni saqlash
          </button>
        </form>
        <hr />
        <h2>Saqlashni tozalash</h2>
        <p className="muted">
          24 soatdan eski ishlatilmayotgan rasmlar va tugallanmagan importlar
          tozalanadi. Arxivdagi asar va boblar saqlanadi.
        </p>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={async () => {
            if (
              !confirm("Ishlatilmayotgan eski fayllarni butunlay tozalaysizmi?")
            )
              return;
            setBusy(true);
            try {
              const result = await api("admin/maintenance/cleanup", "POST", {});
              notify(
                `${result.removed} rasm tozalandi, ${result.cancelled} import bekor qilindi.`,
              );
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Ishlatilmayotgan fayllarni tozalash
        </button>
      </section>
    </>
  );
}
