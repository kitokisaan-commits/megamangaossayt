import { createHash } from "node:crypto";
import { production, sqlite, supabase } from "./db";
import { fail } from "./auth";
/** Atomic fixed 15-minute windows for expensive credential/account mutations. */
export async function rateLimit(
  identity: string,
  action: string,
  maximum: number,
  time = Date.now(),
) {
  const id = createHash("sha256")
    .update(action + ":" + identity)
    .digest("hex");
  const window = Math.floor(time / 900000);
  let accepted: boolean;
  if (production) {
    const { data, error } = await supabase().rpc("inkora_rate_limit", {
      identity_key: id,
      window_value: window,
      maximum,
    });
    if (error) throw error;
    accepted = data === true;
  } else {
    const db = await sqlite();
    accepted = !!db
      .prepare(
        `INSERT INTO rate_limits(id,window,count) VALUES(?,?,1)
      ON CONFLICT(id) DO UPDATE SET window=excluded.window,count=CASE WHEN rate_limits.window=excluded.window THEN rate_limits.count+1 ELSE 1 END
      WHERE rate_limits.window <> excluded.window OR rate_limits.count < ? RETURNING id`,
      )
      .get(id, window, maximum);
    db.prepare("DELETE FROM rate_limits WHERE window < ?").run(window - 2);
  }
  if (!accepted)
    fail(429, "Ko‘p urinish. 15 daqiqadan so‘ng qayta urinib ko‘ring.");
}
