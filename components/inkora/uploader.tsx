"use client";
import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileArchive, Check, LoaderCircle } from "lucide-react";
import { api } from "@/lib/client";
import type { Item } from "@/lib/types";
export default function Uploader({
  titleId,
  chapterId = null,
  banner = false,
  singleImage = false,
  onDone,
  jobs = [],
}: {
  titleId: string;
  chapterId?: string | null;
  banner?: boolean;
  singleImage?: boolean;
  onDone: (jobId?: string) => void;
  jobs?: Item[];
}) {
  const input = useRef<HTMLInputElement>(null),
    [upload, setUpload] = useState(0),
    [processing, setProcessing] = useState({ current: 0, total: 0 }),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const leave = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a?.getAttribute("href") &&
        a.target !== "_blank" &&
        !confirm(
          "Yuklash davom etmoqda. Chiqish tugallanmagan faylni to‘xtatadi. Chiqasizmi?",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [busy]);
  const runProcess = async (job: Item) => {
    while (job.status !== "ready") {
      job = await api("admin/uploads/" + job.id + "/process", "POST", {});
      setProcessing({ current: job.processed, total: job.total });
    }
    return job;
  };
  const resume = async (job: Item) => {
    setBusy(true);
    setError("");
    setName(job.name);
    setUpload(100);
    try {
      await runProcess(job);
      setReady(true);
      onDone(job.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = async (files: File[]) => {
    if (busy || !files.length) return;
    if (
      (singleImage || !chapterId) &&
      (files.length !== 1 ||
        !/\.(jpg|jpeg|png|webp|avif)$/i.test(files[0].name))
    ) {
      setError("Bitta JPG, PNG, WebP yoki AVIF rasm tanlang.");
      return;
    }
    setBusy(true);
    setError("");
    setReady(false);
    const sorted = files.sort((a, b) =>
      a.name.localeCompare(b.name, "en", { numeric: true }),
    );
    let lastJobId = "";
    try {
      for (const file of sorted) {
        setName(file.name);
        setUpload(0);
        setProcessing({ current: 0, total: 0 });
        let job = await api("admin/uploads", "POST", {
          title_id: titleId,
          chapter_id: chapterId,
          name: (banner ? "banner:" : "") + file.name,
          total_bytes: file.size,
        });
        lastJobId = job.id;
        const size = 2 * 1024 * 1024;
        for (let offset = 0, n = 0; offset < file.size; offset += size, n++) {
          const data = file.slice(offset, offset + size);
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `/api/admin/uploads/${job.id}/chunk?index=${n}`);
            xhr.upload.onprogress = (e) =>
              setUpload(Math.round(((offset + e.loaded) / file.size) * 100));
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else {
                try {
                  reject(new Error(JSON.parse(xhr.responseText).error));
                } catch {
                  reject(new Error("Yuklash bajarilmadi."));
                }
              }
            };
            xhr.onerror = () => reject(new Error("Internet aloqasi uzildi."));
            xhr.send(data);
          });
        }
        job = await api("admin/uploads/" + job.id + "/prepare", "POST", {});
        setProcessing({ current: job.processed, total: job.total });
        await runProcess(job);
      }
      setReady(true);
      onDone(lastJobId);
    } catch (e) {
      setError((e as Error).message);
      onDone();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="upload-panel">
      <div
        className={"dropzone " + (busy ? "busy" : "")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) start(Array.from(e.dataTransfer.files));
        }}
      >
        <UploadCloud size={30} />
        <h3>
          {banner
            ? "Banner yuklash"
            : chapterId
              ? "Sahifalarni shu yerga tashlang"
              : "Muqova yuklash"}
        </h3>
        <p>
          {chapterId
            ? "JPG, PNG, WebP, AVIF · ZIP · PDF"
            : "JPG, PNG, WebP yoki AVIF"}
        </p>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Fayllarni tanlash
        </button>
        <input
          ref={input}
          type="file"
          hidden
          multiple={!!chapterId && !singleImage}
          accept={
            chapterId && !singleImage
              ? ".jpg,.jpeg,.png,.webp,.avif,.zip,.pdf"
              : ".jpg,.jpeg,.png,.webp,.avif"
          }
          onChange={(e) => start(Array.from(e.target.files || []))}
        />
        <small>
          Asl nusxalar saqlanadi. Tayyor optimallashtirilgan rasmlar qayta
          siqilmaydi.
        </small>
      </div>
      {busy && (
        <div className="upload-progress" aria-live="polite">
          <div className="row">
            <LoaderCircle className="spin" size={18} />
            <strong>{name}</strong>
          </div>
          <label>
            Yuklash <span>{upload}%</span>
            <progress max="100" value={upload} />
          </label>
          <label>
            Qayta ishlash{" "}
            <span>
              {processing.current} / {processing.total || "…"}
            </span>
            <progress max={processing.total || 1} value={processing.current} />
          </label>
          <p>Bu sahifani yopmang. Tugagan sahifalar serverda saqlanadi.</p>
        </div>
      )}
      {ready && !busy && (
        <p className="success-inline">
          <Check size={16} />
          Tayyor. Sahifalarni tekshirib, nashr qilishingiz mumkin.
        </p>
      )}
      {error && (
        <p role="alert" className="error-inline">
          {error}
        </p>
      )}
      {jobs
        .filter((j) => !["ready", "cancelled"].includes(j.status))
        .map((j) => (
          <div className="upload-job" key={j.id}>
            <FileArchive size={18} />
            <div>
              <strong>{j.name}</strong>
              <small>
                {j.processed}/{j.total} · {j.error || j.status}
              </small>
            </div>
            {j.total > 0 && (
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={() => resume(j)}
              >
                Davom ettirish
              </button>
            )}
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  confirm(
                    "Bu importni bekor qilasizmi? Tayyor sahifalar saqlanadi.",
                  )
                ) {
                  try {
                    await api("admin/uploads/" + j.id, "DELETE");
                    onDone();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            >
              Bekor qilish
            </button>
          </div>
        ))}
    </div>
  );
}
