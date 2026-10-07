import { handle } from "@/server/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };
async function route(req: Request, ctx: Context) {
  return handle(req, (await ctx.params).path);
}
export { route as GET, route as POST, route as PUT, route as DELETE };
