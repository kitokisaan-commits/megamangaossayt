import { list, migrateLocal, production } from "../server/db";
import { ensureResponsive } from "../server/uploads";
if (!production) await migrateLocal();
let count = 0;
for (const asset of await list("assets", {}, undefined, -1)) {
  if (asset.chapter_id && !asset.responsive_ready) {
    await ensureResponsive(asset);
    count++;
  }
}
console.log(`Prepared responsive delivery for ${count} page images.`);
