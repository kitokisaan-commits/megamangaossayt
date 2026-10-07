import { list, one, update, now, compareUpdate, uid } from "./db";
import { cleanupJob, deleteAsset } from "./uploads";
/** Only stale, unreferenced objects are candidates. Archived content remains referenced. */
export async function cleanupOrphans() {
  const cutoff = Date.now() - 24 * 3600000;
  const [assets, titles, pages, jobs, items] = await Promise.all([
    list("assets", {}, undefined, -1),
    list("titles", {}, undefined, -1),
    list("chapter_pages", {}, undefined, -1),
    list("upload_jobs", {}, undefined, -1),
    list("upload_items", {}, undefined, -1),
  ]);
  const references = new Set(
    [
      ...titles.flatMap((t) => [t.cover_id, t.banner_id]),
      ...pages.map((p) => p.asset_id),
    ].filter(Boolean),
  );
  let removed = 0,
    cancelled = 0;
  for (const asset of assets) {
    if (references.has(asset.id) || Date.parse(asset.created_at) > cutoff)
      continue;
    const item = items.find((i) => i.id === asset.id);
    const job = item && jobs.find((j) => j.id === item.job_id);
    if (
      job &&
      (!["ready", "cancelled"].includes(job.status) || job.lease_until > now())
    )
      continue;
    // Recheck references immediately before deleting, including newly replaced artwork.
    const title = await one("titles", { id: asset.title_id });
    if (
      title?.cover_id === asset.id ||
      title?.banner_id === asset.id ||
      (await one("chapter_pages", { asset_id: asset.id }))
    )
      continue;
    await deleteAsset(asset.id);
    removed++;
  }
  for (const job of jobs) {
    if (Date.parse(job.created_at) > cutoff || job.lease_until > now())
      continue;
    if (!["ready", "cancelled"].includes(job.status) || job.master_key) {
      const lease = uid();
      if (
        !(await compareUpdate(
          "upload_jobs",
          job.id,
          { lease_token: job.lease_token, lease_until: job.lease_until },
          {
            lease_token: lease,
            lease_until: new Date(Date.now() + 310000).toISOString(),
          },
        ))
      )
        continue;
      try {
        await cleanupJob(job);
        if (job.status !== "ready") {
          await update("upload_jobs", job.id, { status: "cancelled" });
          cancelled++;
        }
      } finally {
        await compareUpdate(
          "upload_jobs",
          job.id,
          { lease_token: lease },
          { lease_token: "", lease_until: "" },
        );
      }
    }
  }
  return { removed, cancelled };
}
