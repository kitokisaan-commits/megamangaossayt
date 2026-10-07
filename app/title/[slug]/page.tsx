import { notFound } from "next/navigation";
import Link from "next/link";
import { one, list } from "@/server/db";
import {
  titleData,
  titleRecord,
  decorateTitles,
  assetUrl,
} from "@/server/content";
import { currentUser, canEdit } from "@/server/auth";
import {
  Header,
  Footer,
  ReadingCTA,
  TrackView,
} from "@/components/inkora/shell";
import ChapterList from "@/components/inkora/chapter-list";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};
export async function generateMetadata({ params, searchParams }: Props) {
  if ((await searchParams).preview === "1") {
    const value = (await params).slug;
    const record = await one("titles", { slug: value });
    const user = await currentUser();
    const title = record;
    if (
      !record ||
      record.deleted_at ||
      !title ||
      title.deleted_at ||
      !user ||
      user.must_change ||
      !(await canEdit(user, title.id))
    )
      notFound();
    return {
      title: "Private preview — " + title.title,
      robots: { index: false, follow: false },
      openGraph: { images: [] },
    };
  }
  const { slug } = await params,
    t = await titleRecord(slug);
  return t
    ? {
        title: t.seo_title || t.title,
        description: t.seo_description || t.description.slice(0, 160),
        alternates: { canonical: "/title/" + slug },
        openGraph: {
          url: "/title/" + slug,
          title: t.seo_title || t.title,
          description: t.seo_description || t.description.slice(0, 160),
          images: t.cover_id ? [assetUrl(t.cover_id, "medium")] : [],
        },
      }
    : notFound();
}
export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params,
    preview = (await searchParams).preview === "1";
  let t = await titleData(slug);
  if (preview) {
    const raw = await one("titles", { slug }),
      u = await currentUser();
    if (
      !raw ||
      raw.deleted_at ||
      !u ||
      u.must_change ||
      !(await canEdit(u, raw.id))
    )
      notFound();
    t = (await decorateTitles([raw]))[0];
    t.chapters = await list(
      "chapters",
      { title_id: raw.id, deleted_at: null },
      "sort_order",
      -1,
    );
  }
  if (!t) notFound();
  const first = [...t.chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.number - b.number,
  )[0];
  return (
    <>
      <Header />
      <main id="main" className="page-container title-page">
        {preview && (
          <div className="notice">
            Yopiq ko‘rib chiqish · Bu sahifa hali ommaga ko‘rinmasligi mumkin.{" "}
            <Link href={"/admin/titles/" + t.id}>Tahrirlash</Link>
          </div>
        )}
        <div className="breadcrumb">
          <Link href="/catalog">Katalog</Link>
          <span>/</span>
          {t.title}
        </div>
        {t.banner_id && (
          <img className="title-banner" src={assetUrl(t.banner_id)} alt="" />
        )}
        <section className="title-overview">
          <div className="title-cover">
            <img
              src={assetUrl(t.cover_id, "medium")}
              alt={t.title + " muqovasi"}
              width={420}
              height={630}
            />
          </div>
          <div className="title-info">
            <div className="eyebrow">
              {t.type} <span>·</span>{" "}
              {
                (
                  {
                    Completed: "TUGALLANGAN",
                    Ongoing: "DAVOM ETMOQDA",
                    Hiatus: "TANAFFUSDA",
                    Cancelled: "TO‘XTATILGAN",
                  } as Record<string, string>
                )[t.status]
              }{" "}
              <span>·</span> {t.year}
            </div>
            <h1>{t.title}</h1>
            <p className="alternative-title">{t.alt_names.join(" / ")}</p>
            <div className="genre-tags">
              {t.genres.map((g: string) => (
                <Link key={g} href={"/catalog?genre=" + encodeURIComponent(g)}>
                  {g}
                </Link>
              ))}
            </div>
            <p className="synopsis">{t.description}</p>
            <dl className="title-facts">
              {[
                ["Muallif", t.author],
                ["Rassom", t.artist],
                ["Til", t.language],
                ["Yosh belgisi", t.age_label],
                ["Kelib chiqishi", t.origin],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            <div className="row">
              {preview && first ? (
                <Link
                  className="button primary"
                  href={"/read/" + first.id + "?preview=1"}
                >
                  Reader preview
                </Link>
              ) : (
                <ReadingCTA title={t} first={first} />
              )}
              <span className="muted">{t.chapters.length} bob</span>
            </div>
            {!!t.chapters.length && (
              <p className="muted title-latest-update">
                So‘nggi yangilanish:{" "}
                {new Date(
                  t.chapters.reduce(
                    (latest: string, c: Record<string, any>) =>
                      (c.publish_at || c.updated_at) > latest
                        ? c.publish_at || c.updated_at
                        : latest,
                    "",
                  ),
                ).toLocaleDateString("uz-UZ")}
              </p>
            )}
          </div>
        </section>
        <ChapterList chapters={t.chapters} preview={preview} />
        {!preview && <TrackView id={t.id} title={t} />}
      </main>
      <Footer />
    </>
  );
}
