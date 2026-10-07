"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="empty-state">
      <h1>Sahifa yuklanmadi.</h1>
      <p>Hozir xizmatga ulana olmadik. Qayta urinib ko‘ring.</p>
      <button className="button primary" onClick={reset}>
        Qayta urinish
      </button>
      <Link href="/">Bosh sahifa</Link>
    </main>
  );
}
