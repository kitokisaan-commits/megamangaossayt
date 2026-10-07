import { migrateLocal, production, one, insert } from "../server/db";
import { createAdmin } from "../server/auth";
if (!production) await migrateLocal();
if (!(await one("site_settings", { id: "main" })))
  await insert("site_settings", {
    id: "main",
    name: "INKORA",
    description: "Har sahifada yangi olam.",
    max_upload_mb: 100,
    max_pages: 500,
  });
const username = process.env.BOOTSTRAP_USERNAME || "dieheartman";
if (!(await one("admin_users", { username }))) {
  await createAdmin(
    username,
    "Bosh muharrir",
    process.env.BOOTSTRAP_PASSWORD || "dieheartman",
    "SUPERADMIN",
  );
  console.log(
    "Bootstrap superadmin created. First-login password change is required.",
  );
} else
  console.log(
    "Bootstrap account already exists; credentials were not changed.",
  );
