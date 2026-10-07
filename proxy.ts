import { NextResponse, type NextRequest } from "next/server";
import { one } from "./server/db";
import { isPublicTitle, isPublicChapter } from "./server/content";
import { currentUser, canEdit } from "./server/auth";
import { unavailableDocument } from "./server/unavailable";
// Reject unavailable/private records before React starts a streaming 200 response.
export async function proxy(request: NextRequest) {
  const [kind, value] = request.nextUrl.pathname.split("/").filter(Boolean);
  const record = await one(
    kind === "title" ? "titles" : "chapters",
    kind === "title" ? { slug: value } : { id: value },
  );
  const title =
    kind === "title"
      ? record
      : record
        ? await one("titles", { id: record.title_id })
        : null;
  let visible =
    isPublicTitle(title) && (kind === "title" || isPublicChapter(record));
  if (request.nextUrl.searchParams.get("preview") === "1") {
    const user = await currentUser(request);
    visible = !!(
      record &&
      !record.deleted_at &&
      title &&
      !title.deleted_at &&
      user &&
      !user.must_change &&
      (await canEdit(user, title.id))
    );
  }
  if (visible) {
    const response = NextResponse.next();
    if (request.nextUrl.searchParams.get("preview") === "1") {
      response.headers.set("Cache-Control", "private,no-store");
      response.headers.set("X-Robots-Tag", "noindex,nofollow");
    }
    return response;
  }
  return new NextResponse(unavailableDocument, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export const config = { matcher: ["/title/:slug", "/read/:id"] };
