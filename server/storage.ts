import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { dataDir, production, supabase } from "./db";
const bucket = () => process.env.SUPABASE_STORAGE_BUCKET || "inkora-private";
function safe(key: string) {
  if (
    !/^[a-zA-Z0-9/_ .-]+$/.test(key) ||
    key.includes("..") ||
    key.startsWith("/")
  )
    throw new Error("Invalid storage key");
  return key;
}
export const storage = {
  async put(key: string, data: Uint8Array, mime = "application/octet-stream") {
    safe(key);
    if (production) {
      const { error } = await supabase()
        .storage.from(bucket())
        .upload(key, data, {
          contentType: mime,
          upsert: true,
          cacheControl: "60",
        });
      if (error) throw error;
    } else {
      const p = path.join(dataDir, "objects", key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, data);
    }
  },
  async get(key: string): Promise<Buffer> {
    safe(key);
    if (production) {
      const { data, error } = await supabase()
        .storage.from(bucket())
        .download(key);
      if (error) throw error;
      return Buffer.from(await data.arrayBuffer());
    }
    return readFile(path.join(dataDir, "objects", key));
  },
  async delete(key: string) {
    safe(key);
    if (production) {
      const { error } = await supabase().storage.from(bucket()).remove([key]);
      if (error) throw error;
    } else
      await unlink(path.join(dataDir, "objects", key)).catch(
        (e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") throw e;
        },
      );
  },
  async deleteMany(keys: string[]) {
    for (let offset = 0; offset < keys.length; offset += 100) {
      const batch = keys.slice(offset, offset + 100).map(safe);
      if (production) {
        const { error } = await supabase().storage.from(bucket()).remove(batch);
        if (error) throw error;
      } else await Promise.all(batch.map((key) => storage.delete(key)));
    }
  },
  async signed(key: string) {
    const { data, error } = await supabase()
      .storage.from(bucket())
      .createSignedUrl(safe(key), 60);
    if (error) throw error;
    return data.signedUrl;
  },
};
