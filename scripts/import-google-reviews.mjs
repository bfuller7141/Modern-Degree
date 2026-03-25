import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return "";
  return process.argv[idx + 1] ?? "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeParent(parentRaw) {
  let parent = String(parentRaw || "").trim();
  parent = parent.replace(/^https?:\/\/[^/]+\//i, "");
  parent = parent.replace(/^v4\//i, "");
  parent = parent.replace(/^\/+/, "");

  // Fix common typo: accounts/<id>/locations<id>  -> accounts/<id>/locations/<id>
  parent = parent.replace(/(accounts\/[^/]+\/locations)(\d+)/i, "$1/$2");

  return parent;
}

function isValidParent(parent) {
  return /^accounts\/[^/]+\/locations\/[^/]+$/i.test(parent);
}

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "review";
}

function yamlQuote(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ratingToInt(starRating) {
  if (!starRating) return 5;
  if (/^\d+$/.test(starRating)) {
    return Math.max(1, Math.min(5, Number(starRating)));
  }
  return STAR_MAP[String(starRating).toUpperCase()] ?? 5;
}

function toDate(review) {
  const value = review.createTime || review.updateTime;
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function buildMarkdown({ author, rating, date, text }) {
  const block = text.split("\n").map((line) => `  ${line}`).join("\n");
  return [
    "---",
    `author: "${yamlQuote(author)}"`,
    `rating: ${rating}`,
    `date: "${date}"`,
    "text: |",
    block,
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

  for (const name of files) {
    if (!name.endsWith(".md")) continue;
    const fullPath = path.join(outDir, name);
    const raw = await fs.readFile(fullPath, "utf8");
    const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    const authorMatch = fm.match(/^author:\s*"(.*)"\s*$/m);
    const textMatch = fm.match(/^text:\s*\|\s*\n((?:[ \t].*\n?)*)/m);
    if (!authorMatch || !textMatch) continue;
    const author = authorMatch[1].trim();
    const text = textMatch[1]
      .split("\n")
      .map((line) => (line.startsWith("  ") ? line.slice(2) : line.trimStart()))
      .join("\n")
      .trim();
    if (author && text) {
      keys.add(`${normalize(author)}::${normalize(text)}`);
    }
  }

  return keys;
}

async function fetchAllReviews(parent, accessToken, pageSize) {
  const all = [];
  let pageToken = "";
  const safePageSize = Math.max(1, Math.min(50, pageSize));

  while (true) {
    const params = new URLSearchParams({
      pageSize: String(safePageSize),
      orderBy: "updateTime desc",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://mybusiness.googleapis.com/v4/${parent}/reviews?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }

    const payload = await res.json();
    all.push(...(payload.reviews || []));
    pageToken = payload.nextPageToken || "";
    if (!pageToken) break;
  }

  return all;
}

async function uniquePath(outDir, author, reviewId, text) {
  const slug = slugify(author);
  const digest = crypto
    .createHash("sha1")
    .update(`${reviewId}|${text}`, "utf8")
    .digest("hex")
    .slice(0, 8);

  let candidate = path.join(outDir, `${slug}-${digest}.md`);
  let i = 2;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(outDir, `${slug}-${digest}-${i}.md`);
      i += 1;
    } catch {
      return candidate;
    }
  }
}

async function main() {
  const parent = normalizeParent(argValue("--parent") || process.env.GBP_PARENT || "");
  const accessToken = argValue("--access-token") || process.env.GOOGLE_ACCESS_TOKEN || "";
  const outDir = argValue("--out-dir") || "src/content/reviews";
  const pageSize = Number(argValue("--page-size") || 50);
  const dryRun = hasFlag("--dry-run");

  if (!parent) {
    console.error("Missing --parent (or GBP_PARENT env var).");
    process.exit(2);
  }
  if (!isValidParent(parent)) {
    console.error(
      `Invalid parent "${parent}". Expected format: accounts/ACCOUNT_ID/locations/LOCATION_ID`
    );
    process.exit(2);
  }
  if (!accessToken) {
    console.error("Missing --access-token (or GOOGLE_ACCESS_TOKEN env var).");
    process.exit(2);
  }

  await fs.mkdir(outDir, { recursive: true });
  const existingKeys = await parseExistingKeys(outDir);
  const reviews = await fetchAllReviews(parent, accessToken, pageSize);

  let added = 0;
  let skipped = 0;

  for (const review of reviews) {
    const author = review?.reviewer?.displayName?.trim() || "Google Reviewer";
    const text = (review?.comment || "").trim();
    if (!text) {
      skipped += 1;
      continue;
    }

    const key = `${normalize(author)}::${normalize(text)}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    const record = {
      author,
      rating: ratingToInt(String(review?.starRating || "")),
      date: toDate(review),
      text,
    };

    const filePath = await uniquePath(outDir, author, String(review?.reviewId || ""), text);
    if (dryRun) {
      console.log(`[DRY RUN] Would add: ${filePath}`);
    } else {
      await fs.writeFile(filePath, buildMarkdown(record), "utf8");
      console.log(`Added: ${filePath}`);
    }

    existingKeys.add(key);
    added += 1;
  }

  console.log(`Done. Added ${added} new review file(s), skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
