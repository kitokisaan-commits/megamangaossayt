import Link from "next/link";
import { one } from "@/server/db";
import { publicTitles, assetUrl } from "@/server/content";
import {
  Header,
  Footer,
  ContinueReading,
  RecentlyViewed,
} from "@/components/inkora/shell";
import { CoverCard, EmptyState } from "@/components/inkora/cards";
import { isNewChapter } from "@/lib/publication";
import { BookOpen, Compass } from "lucide-react";
export const dynamic = "force-dynamic";
export const metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "INKORA — Har sahifada yangi olam",
    description: "Manga, manhwa va webtoon. O‘zbek tilida o‘qing.",
  },
};
export default async function Home() {
  const settings = await one("site_settings", { id: "main" });
  const titles = await publicTitles(true),
    hero = titles.find((t) => t.featured) || titles[0];
  const updates = titles
    .flatMap((t) =>
      t.chapters
        .slice(0, 2)
        .map((c: Record<string, any>) => ({ ...c, title: t })),
    )
    .sort((a, b) =>
      (b.published_at || b.updated_at).localeCompare(
        a.published_at || a.updated_at,
      ),
    )
    .slice(0, 6);
  return (
    <>
      <Header />
      <main id="main" className="page-container">
        {hero ? (
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span /> TAHRIRIYAT TANLOVI{" "}
                <span className="issue">01 / INKORA</span>
              </div>
              <h1>
                Bir sahifa.
                <br />
                <em>Butun bir olam.</em>
              </h1>
              <p className="hero-description">
                {settings?.description ||
                  "Katta hikoyalar kichik lahzalardan boshlanadi."}
                <br />
                Keyingi sevimli asaringiz shu yerda.
              </p>
              <div className="hero-actions">
                <Link className="button primary" href={"/title/" + hero.slug}>
                  <BookOpen size={18} />
                  O‘qishni boshlash
                </Link>
                <Link className="text-button" href="/catalog">
                  <Compass size={18} />
                  Katalogni ko‘rish
                </Link>
              </div>
              <div className="hero-feature">
                <span>HOZIR TAVSIYA QILAMIZ</span>
                <Link href={"/title/" + hero.slug}>{hero.title}</Link>
                <small>
                  {hero.type} / {hero.genres?.join(" · ")}
                </small>
              </div>
            </div>
            <div className="hero-art">
              <div className="hero-lines" />
              <Link href={"/title/" + hero.slug} className="hero-main-cover">
                <img
                  src={assetUrl(hero.cover_id, "medium")}
                  width={840}
                  height={1260}
                  alt={hero.title}
                  fetchPriority="high"
                />
                <div className="hero-cover-caption">
                  <span>FEATURED STORY</span>
                  <strong>{hero.title}</strong>
                </div>
              </Link>
              {titles[1] && (
                <Link
                  className="hero-side-cover"
                  href={"/title/" + titles[1].slug}
                >
                  <img src={titles[1].cover} alt={titles[1].title} />
                </Link>
              )}
              <div className="hero-art-label">HIKOYAGA SHO‘NG‘ING</div>
            </div>
          </section>
        ) : (
          <EmptyState />
        )}
        <ContinueReading />
        <RecentlyViewed />
        <section className="home-updates">
          <div className="section-heading">
            <h2>
              <span className="accent-line" />
              Yangi boblar
            </h2>
            <Link href="/catalog?sort=updated">Barchasini ko‘rish</Link>
          </div>
          <div className="update-grid">
            {updates.map((c, i) => (
              <Link className="update-row" href={"/read/" + c.id} key={c.id}>
                <span className="update-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <img src={c.title.cover} alt="" />
                <div>
                  <small>{c.title.type}</small>
                  <h3>{c.title.title}</h3>
                  <p>
                    {c.number}-bob {c.name ? "· " + c.name : ""}
                  </p>
                </div>
                {isNewChapter(c) && <span className="new-label">YANGI</span>}
              </Link>
            ))}
          </div>
        </section>
        <section>
          <div className="section-heading">
            <h2>Yangi olamlarni kashf eting</h2>
            <Link href="/catalog?sort=popular">Mashhur asarlar</Link>
          </div>
          <div className="cover-grid">
            {titles.slice(0, 6).map((t, i) => (
              <CoverCard key={t.id} title={t} index={i} />
            ))}
          </div>
        </section>
        <section className="genre-strip">
          <div>
            <span className="eyebrow">KAYFIYATINGIZGA MOS</span>
            <h2>Qaysi olamga boramiz?</h2>
          </div>
          <div>
            {[
              "Fantasy",
              "Action",
              "Adventure",
              "Romance",
              "Drama",
              "Slice of Life",
            ].map((g, i) => (
              <Link href={"/catalog?genre=" + encodeURIComponent(g)} key={g}>
                <span>0{i + 1}</span>
                {g}
              </Link>
            ))}
          </div>
        </section>
        {titles.some((t) => t.status === "Completed") && (
          <section>
            <div className="section-heading">
              <h2>Oxirigacha birga</h2>
              <span>Tugallangan hikoyalar</span>
            </div>
            <div className="cover-grid">
              {titles
                .filter((t) => t.status === "Completed")
                .map((t) => (
                  <CoverCard key={t.id} title={t} />
                ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
