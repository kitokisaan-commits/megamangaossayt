export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const endpoint =
    process.env.NEXT_PUBLIC_WORK_PREVIEW === "true" &&
    path === "public/settings"
      ? "/preview/settings.json"
      : "/api/" + path;
  const r = await fetch(endpoint, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let d: any;
  try {
    d = await r.json();
  } catch {
    throw new Error(
      "Server javobi olinmadi. Aloqani tekshirib, qayta urinib ko‘ring.",
    );
  }
  if (!r.ok) throw new Error(d.error || "So‘rov bajarilmadi.");
  return d;
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode or full storage must not block reading. */
  }
}
