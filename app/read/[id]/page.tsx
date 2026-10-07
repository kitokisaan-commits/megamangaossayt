import { notFound } from "next/navigation";
import {
  chapterData,
  chapterRecord,
  pageData,
  assetUrl,
} from "@/server/content";
import { one, list } from "@/server/db";
import { currentUser, canEdit } from "@/server/auth";
import Reader from "@/components/inkora/reader";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
};
export async function generateMetadata({ params, searchParams }: Props) {
  if ((await searchParams).preview === "1") {
    const value = (await params).id;
    const record = await one("chapters", { id: value });
    const user = await currentUser();
    const title = record ? await one("titles", { id: record.title_id }) : null;
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
  const d = await chapterRecord((await params).id);
  return d
    ? {
        title: `${d.title.title} — ${d.chapter.number}-bob`,
        description: d.chapter.name || d.title.description.slice(0, 160),
        alternates: { canonical: "/read/" + d.chapter.id },
        openGraph: {
          url: "/read/" + d.chapter.id,
          description: d.chapter.name || d.title.description.slice(0, 160),
          title: d.title.title + " / " + d.chapter.number + "-bob",
          images: d.title.cover_id
            ? [assetUrl(d.title.cover_id, "medium")]
            : [],
        },
      }
    : notFound();
}
export default async function Page({ params, searchParams }: Props) {
  const { id } = await params,
    preview = (await searchParams).preview === "1";
  let data = await chapterData(id);
  if (preview) {
    const c = await one("chapters", { id }),
      u = await currentUser();
    if (
      !c ||
      c.deleted_at ||
      !u ||
      u.must_change ||
      !(await canEdit(u, c.title_id))
    )
      notFound();
    const t = await one("titles", { id: c.title_id });
    if (!t || t.deleted_at) notFound();
    data = {
      chapter: c,
      title: t,
      pages: await pageData(id),
      chapters: await list(
        "chapters",
        { title_id: c.title_id, deleted_at: null },
        "sort_order",
        -1,
      ),
    };
  }
  if (!data) notFound();
  return <Reader key={data.chapter.id} {...data} preview={preview} />;
}
