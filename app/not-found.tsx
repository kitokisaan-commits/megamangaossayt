import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="empty-state">
      <span>404</span>
      <h1>Bu sahifa topilmadi.</h1>
      <p>Havola o‘zgargan yoki asar hali nashr qilinmagan.</p>
      <Link className="button primary" href="/catalog">
        Katalogga qaytish
      </Link>
    </main>
  );
}
