import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import {
  insert,
  one,
  list,
  remove,
  deleteSessions,
  update,
  production,
  supabase,
  now,
  uid,
  type Row,
} from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function audit(user: Row, action: string, entity: string) {
  await insert("audit_logs", {
    id: uid(),
    user_id: user.id,
    actor: user.username,
    action,
    entity,
    created_at: now(),
  });
}
export async function currentUser(request?: Request) {
  const token = request
    ? request.headers
        .get("cookie")
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("inkora_session="))
        ?.split("=")[1]
    : (await cookies()).get("inkora_session")?.value;
  if (!token) return null;
  const session = await one("sessions", { id: tokenHash(token) });
  if (!session || session.expires_at < now()) return null;
  const user = await one("admin_users", { id: session.user_id });
  return user?.active ? user : null;
}
export async function requireUser(request: Request, allowPassword = false) {
  const u = await currentUser(request);
  if (!u) fail(401, "Kirish talab qilinadi.");
  if (u.must_change && !allowPassword)
    fail(428, "Avval boshlang‘ich parolni almashtiring.");
  return u;
}
export function requireRole(u: Row, roles: string[]) {
  if (!roles.includes(u.role)) fail(403, "Bu amal uchun ruxsat yo‘q.");
}
export async function canEdit(u: Row, titleId: string) {
  if (["SUPERADMIN", "ADMIN"].includes(u.role)) return true;
  if (u.role !== "EDITOR") return false;
  return !!(await one("title_editors", { title_id: titleId, user_id: u.id }));
}
/** Permission-scoped lists load editor assignments once, never once per title. */
export async function editableTitles(u: Row, titles: Row[]) {
  if (["SUPERADMIN", "ADMIN"].includes(u.role)) return titles;
  if (u.role !== "EDITOR") return [];
  const assigned = new Set(
    (await list("title_editors", { user_id: u.id }, undefined, -1)).map(
      (a) => a.title_id,
    ),
  );
  return titles.filter((t) => assigned.has(t.id));
}
export async function requireTitle(u: Row, id: string) {
  const t = await one("titles", { id });
  if (!t || t.deleted_at) fail(404, "Asar topilmadi.");
  if (!(await canEdit(u, id))) fail(403, "Bu asar sizga biriktirilmagan.");
  return t;
}
export async function requireChapter(u: Row, id: string) {
  const c = await one("chapters", { id });
  if (!c || c.deleted_at) fail(404, "Bob topilmadi.");
  await requireTitle(u, c.title_id);
  return c;
}
export async function invalidateSessions(id: string) {
  await deleteSessions(id);
}
export function publicUser(u: Row) {
  const { password_hash, auth_id, ...safe } = u;
  void password_hash;
  void auth_id;
  return safe;
}
export async function createAdmin(
  username: string,
  display_name: string,
  password: string,
  role: string,
) {
  let auth_id = null;
  if (production) {
    const { data, error } = await supabase().auth.admin.createUser({
      email: `${username}@${process.env.AUTH_EMAIL_DOMAIN || "admins.inkora.local"}`,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    auth_id = data.user.id;
  }
  try {
    return await insert("admin_users", {
      id: uid(),
      username,
      display_name,
      role,
      active: 1,
      password_hash: production ? null : hashPassword(password),
      auth_id,
      must_change: 1,
      created_at: now(),
      last_login: null,
    });
  } catch (error) {
    if (production && auth_id) await supabase().auth.admin.deleteUser(auth_id);
    throw error;
  }
}
export async function setPassword(u: Row, password: string) {
  if (production) {
    const { error } = await supabase().auth.admin.updateUserById(u.auth_id, {
      password,
    });
    if (error) throw error;
  }
  await update("admin_users", u.id, {
    password_hash: production ? null : hashPassword(password),
    must_change: 0,
  });
  await invalidateSessions(u.id);
}
export async function login(username: string, password: string) {
  const identity = tokenHash(username.toLowerCase());
  const recent = (
    await list("login_attempts", { identity }, "created_at desc", 12)
  ).filter((x) => Date.now() - Date.parse(x.created_at) < 900000);
  if (recent.length >= 10)
    fail(429, "Ko‘p urinish. 15 daqiqadan so‘ng qayta urinib ko‘ring.");
  await insert("login_attempts", { id: uid(), identity, created_at: now() });
  const u = await one("admin_users", { username: username.toLowerCase() });
  let ok = false;
  if (u?.active) {
    if (production) {
      const { error } = await supabase().auth.signInWithPassword({
        email: `${u.username}@${process.env.AUTH_EMAIL_DOMAIN || "admins.inkora.local"}`,
        password,
      });
      ok = !error;
    } else ok = verifyPassword(password, u.password_hash);
  }
  if (!ok || !u) fail(401, "Login yoki parol noto‘g‘ri.");
  for (const a of recent) await remove("login_attempts", a.id);
  await update("admin_users", u.id, { last_login: now() });
  const token = randomBytes(32).toString("hex");
  await insert("sessions", {
    id: tokenHash(token),
    user_id: u.id,
    expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
  });
  await audit(u, "admin.login", u.username);
  return { token, user: publicUser(u) };
}
export function cookie(token: string, secure: boolean) {
  return `inkora_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 28800 : 0}${secure ? "; Secure" : ""}`;
}
export function csrf(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(req.url).origin;
  if (!origin || origin !== expected)
    fail(403, "So‘rov manbasi tasdiqlanmadi.");
}
