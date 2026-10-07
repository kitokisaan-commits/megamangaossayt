export function isNewChapter(chapter: Record<string, any>, time = Date.now()) {
  if (chapter.status !== "Published") return false;
  const stamp = Date.parse(
    chapter.published_at || chapter.publish_at || chapter.updated_at,
  );
  return Number.isFinite(stamp) && stamp <= time && time - stamp < 7 * 86400000;
}
