import Link from "next/link";
import type { Item } from "@/lib/types";
export function CoverCard({
  title,
  index = 0,
}: {
  title: Item;
  index?: number;
}) {
  return (
    <Link className="cover-card" href={"/title/" + title.slug}>
      <div className="cover-image">
        <img
          src={title.cover}
          alt={title.title + " muqovasi"}
          loading={index < 3 ? "eager" : "lazy"}
          decoding="async"
          width={420}
          height={630}
        />
        <span className="cover-type">{title.type}</span>
        {title.status === "Completed" && (
          <span className="cover-complete">Tugallangan</span>
        )}
      </div>
      <h3>{title.title}</h3>
      <p>{title.genres?.slice(0, 2).join(" / ") || title.author}</p>
      <small>
        {title.chapter_count ?? title.chapters?.length ?? 0} bob <span>·</span>{" "}
        {title.language}
      </small>
    </Link>
  );
}
export function EmptyState({
  title = "Hali asarlar yo‘q",
  description = "Yangi hikoyalar tez orada paydo bo‘ladi.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <span>◇</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="button" href="/catalog">
        Katalogga qaytish
      </Link>
    </div>
  );
}
