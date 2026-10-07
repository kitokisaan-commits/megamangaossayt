import { Suspense } from "react";
import { publicTitles } from "@/server/content";
import { Header, Footer } from "@/components/inkora/shell";
import Catalog from "@/components/inkora/catalog";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Katalog",
  description: "O‘zbekcha manga, manhwa va webtoon katalogi",
  alternates: { canonical: "/catalog" },
};
export default async function Page() {
  return (
    <>
      <Header />
      <main id="main" className="page-container">
        <Suspense fallback={<p>Yuklanmoqda…</p>}>
          <Catalog titles={await publicTitles(true)} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
