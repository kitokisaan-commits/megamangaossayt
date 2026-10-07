import "./bootstrap";
import sharp from "sharp";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { production, one, insert, update, uid, now } from "../server/db";
import { prepareImage } from "../server/uploads";
if (production && process.env.ALLOW_DEMO_SEED !== "true")
  throw new Error(
    "Refusing to seed a production database. Set ALLOW_DEMO_SEED=true explicitly.",
  );
const specs = [
  {
    title: "The Last Lantern",
    slug: "the-last-lantern",
    alt: "So‘nggi fonus",
    author: "INKORA Studio",
    type: "Manhwa",
    status: "Ongoing",
    genres: ["Fantasy", "Adventure", "Mystery"],
    description:
      "Shahar har oqshom bitta xotirasini yo‘qotadi. Yosh kuryer Ren esa ularni saqlab qoladigan so‘nggi fonusni topadi. Endi tong otguncha u unutilgan yo‘llar orqali shahar yuragiga yetib borishi kerak.",
    file: "lantern.jpg",
    direction: "vertical",
    origin: "Original",
  },
  {
    title: "Salt & Steel",
    slug: "salt-and-steel",
    alt: "Tuz va po‘lat",
    author: "INKORA Studio",
    type: "Manga",
    status: "Ongoing",
    genres: ["Action", "Adventure", "Fantasy"],
    description:
      "Xaritalarda qolmagan orollar, g‘oyib bo‘lgan kemalar va dengiz tubidan kelayotgan chaqiriq. Kapitan Sora o‘z ekipaji bilan noma’lum tomon suzib ketadi. Har bir to‘lqin yangi savol olib keladi.",
    file: "salt.jpg",
    direction: "rtl",
    origin: "Original",
  },
  {
    title: "After the Rain",
    slug: "after-the-rain",
    alt: "Yomg‘irdan keyin",
    author: "INKORA Studio",
    type: "Webtoon",
    status: "Completed",
    genres: ["Romance", "Drama", "Slice of Life"],
    description:
      "Har kuni bir bekatda uchrashadigan ikki talaba. Aytishga ulgurilmagan so‘zlar va birga o‘tilgan yo‘llar. Bu yomg‘irdan keyin boshlanadigan oddiy, iliq hikoya.",
    file: "rain.jpg",
    direction: "vertical",
    origin: "Original",
  },
];
for (const spec of specs) {
  if (await one("titles", { slug: spec.slug })) continue;
  const { file, genres, alt, ...fields } = spec,
    id = uid();
  await insert("titles", {
    ...fields,
    id,
    year: 2026,
    artist: "INKORA Studio",
    language: "Uzbek",
    age_label: "All ages",
    visibility: "Published",
    featured: spec.slug === "the-last-lantern" ? 1 : 0,
    created_at: now(),
    updated_at: now(),
  });
  await insert("title_alt_names", { id: uid(), title_id: id, name: alt });
  for (const name of genres) {
    let g = await one("genres", { name });
    if (!g) g = await insert("genres", { id: uid(), name });
    await insert("title_genres", { id: uid(), title_id: id, genre_id: g.id });
  }
  const cover = await prepareImage(
    await readFile("public/demo/" + file),
    file,
    id,
    null,
  );
  await update("titles", id, { cover_id: cover.id });
  for (const number of [1, 1.5, 2]) {
    const chapterId = uid();
    await insert("chapters", {
      id: chapterId,
      title_id: id,
      number,
      name:
        number === 1
          ? "Boshlanish"
          : number === 1.5
            ? "Oraliq hikoya"
            : "Yangi yo‘l",
      status: "Published",
      sort_order: number,
      created_at: now(),
      updated_at: now(),
    });
    for (let n = 1; n <= 3; n++) {
      const canvas = createCanvas(1000, 1450),
        ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f3f0e9";
      ctx.fillRect(0, 0, 1000, 1450);
      ctx.fillStyle = "#20242b";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("INKORA / DEVELOPMENT SAMPLE", 60, 58);
      ctx.font = "bold 48px sans-serif";
      ctx.fillText(spec.title, 60, 133);
      ctx.font = "24px sans-serif";
      ctx.fillText(`Chapter ${number} / Page ${n}`, 60, 176);
      const art = await loadImage("public/demo/" + file);
      ctx.drawImage(
        art,
        0,
        Math.floor(((n - 1) * art.height) / 5),
        art.width,
        Math.floor(art.height * 0.6),
        60,
        210,
        880,
        1020,
      );
      ctx.fillStyle = "#20242b";
      ctx.font = "20px sans-serif";
      ctx.fillText(
        "Original sample artwork. Demo pages for testing the reader.",
        60,
        1290,
      );
      ctx.fillStyle = "#777";
      ctx.font = "17px sans-serif";
      ctx.fillText(
        "Replace this development content before your public launch.",
        60,
        1330,
      );
      ctx.textAlign = "right";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText(String(n).padStart(2, "0"), 940, 1400);
      const a = await prepareImage(
        await sharp(canvas.toBuffer("image/png"))
          .webp({ quality: 95 })
          .toBuffer(),
        `${n}.webp`,
        id,
        chapterId,
      );
      await insert("chapter_pages", {
        id: uid(),
        chapter_id: chapterId,
        asset_id: a.id,
        position: n - 1,
        rotation: 0,
      });
    }
  }
  console.log("Seeded " + spec.title);
}
