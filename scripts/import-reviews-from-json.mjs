import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] ?? "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(value) {
  return (
    String(value || "")
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "review"
  );
}

function yamlQuote(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toIntRating(value) {
  if (value == null) return 5;
  const s = String(value).trim().toUpperCase();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(1, Math.min(5, Math.round(Number(s))));
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return map[s] ?? 5;
}

function toDate(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function getAuthor(item) {
  return (
    item.author ||
    item.author_name ||
    item.reviewer_name ||
    item.reviewerName ||
    item.userName ||
    item.user ||
    item?.reviewer?.displayName ||
    "Google Reviewer"
  );
}

function getText(item) {
  return (
    item.text ||
    item.review_text ||
    item.reviewText ||
    item.comment ||
    item.content ||
    item.snippet ||
    ""
  );
}

function getRating(item) {
  return (
    item.rating ??
    item.stars ??
    item.starRating ??
    item.review_rating ??
    item.reviewRating ??
    5
  );
}

function getDate(item) {
  return (
    item.date ||
    item.publishedAt ||
    item.publish_time ||
    item.time ||
    item.createTime ||
    item.updateTime ||
    ""
  );
}

function getId(item, index) {
  return String(
    item.reviewId ||
      item.review_id ||
      item.id ||
      item.cid ||
      item.url ||
      `row-${index}`
  );
}

function buildMarkdown({ author, rating, date, text }) {
  const body = String(text)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return [
    "---",
    `author: "${yamlQuote(author)}"`,
    `rating: ${rating}`,
    `date: "${date}"`,
    "text: |",
    body,
    "---",
    "",
  ].join("\n");
}

async function parseExistingKeys(outDir) {
  const keys = new Set();
  let files = [];
  try {
    files = await fs.readdir(outDir);
  } catch {
    return keys;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(outDir, file), "utf8");
    const fm = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const author = fm[1].match(/^author:\s*"(.*)"\s*$/m)?.[1] ?? "";
    const textBlock = fm[1].match(/^text:\s*\|\s*\n((?:[ \t].*\n?)*)/m)?.[1] ?? "";
    const text = textBlock
      .split("\n")
      .map((line) => (line.startsWith("  ") ? line.slice(2) : line.trimStart()))
      .join("\n")
      .trim();
    if (author && text) keys.add(`${normalize(author)}::${normalize(text)}`);
  }
  return keys;
}

async function uniqueFilePath(outDir, author, reviewId, text) {
  const slug = slugify(author);
  const hash = crypto
    .createHash("sha1")
    .update(`${reviewId}|${text}`, "utf8")
    .digest("hex")
    .slice(0, 8);
  let candidate = path.join(outDir, `${slug}-${hash}.md`);
  let i = 2;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(outDir, `${slug}-${hash}-${i}.md`);
      i += 1;
    } catch {
      return candidate;
    }
  }
}

async function main() {
  const input = argValue("--input");
  const outDir = argValue("--out-dir") || "src/content/reviews";
  const dryRun = hasFlag("--dry-run");

  if (!input) {
    console.error("Missing --input path to JSON file.");
    process.exit(2);
  }

  const raw = await fs.readFile(input, "utf8");
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.reviews)
      ? parsed.reviews
      : Array.isArray(parsed?.data)
        ? parsed.data
        : [];

  if (!rows.length) {
    console.error("No reviews found in JSON. Expected an array or { reviews: [...] }.");
    process.exit(2);
  }

  await fs.mkdir(outDir, { recursive: true });
  const existing = await parseExistingKeys(outDir);

  let added = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const author = String(getAuthor(row)).trim() || "Google Reviewer";
    const text = String(getText(row)).trim();
    if (!text) {
      skipped += 1;
      continue;
    }

    const key = `${normalize(author)}::${normalize(text)}`;
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    const record = {
      author,
      rating: toIntRating(getRating(row)),
      date: toDate(getDate(row)),
      text,
    };

    const filePath = await uniqueFilePath(outDir, author, getId(row, i), text);
    if (dryRun) {
      console.log(`[DRY RUN] Would add: ${filePath}`);
    } else {
      await fs.writeFile(filePath, buildMarkdown(record), "utf8");
      console.log(`Added: ${filePath}`);
    }
    existing.add(key);
    added += 1;
  }

  console.log(`Done. Added ${added} new review file(s), skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});

