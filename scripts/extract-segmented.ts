/**
 * extract-segmented.ts
 *
 * EPD extractor that uses segment.json to identify which pages contain
 * "Product Information and Specs" vs "Environmental Impact Data", then
 * sends each group of pages to an LLM via the Cloudflare AI Gateway
 * (OpenAI-compatible) to extract structured JSON.
 *
 * Iterates over every subdirectory in data/ that contains
 * both markdown.md and segment.json, writing extracted.json into each.
 *
 * Usage:
 *   npx tsx scripts/extract-segmented.ts [data-dir] [concurrency]
 *   npx tsx scripts/extract-segmented.ts --single <subdirectory-name> [--combined]
 *   npx tsx scripts/extract-segmented.ts --combined [data-dir] [concurrency]
 *
 * Without flags: iterates over every subdirectory in data/ that contains
 * both markdown.md and segment.json, writing extracted.json into each.
 *
 * --single <name>: re-extracts a single EPD subdirectory (e.g. EPD_HUB-5210_2026-06-27_en)
 * and overwrites its existing extracted.json. The name can be a bare subdirectory name
 * (resolved against the default data/) or an absolute/relative path.
 *
 * --combined: send ALL environmental impact pages to the LLM in a single call instead
 * of the default page-by-page chunking. Useful when pages are small or when you want
 * the model to see all modules (A1-A3 and C1-D) together in one context.
 *
 * data-dir defaults to ./data relative to the workspace root.
 * concurrency (default 3) controls how many EPD directories are processed in parallel.
 */

import "dotenv/config";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Ollama } from "ollama";

// ── Types ──────────────────────────────────────────────────────────────────

interface Segment {
  category: string;
  pages: number[];
  confidence_category: string;
}

interface SegmentFile {
  segments: Segment[];
}

// ── Ollama client (via Cloudflare AI Gateway) ───────────────────────────────

const ollama = new Ollama({
  host: "https://ollama.com",
  headers: { Authorization: "Bearer " + process.env.OLLAMA_API_KEY },
});

const MODEL = "deepseek-v4-pro:cloud";

// ── Markdown page splitting ──────────────────────────────────────────────────

/**
 * Split the full markdown into a map of page_number → page_content.
 * Pages are delimited by <PAGE>N<PAGE> markers at the start of each page.
 * The content following a marker (up to the next marker) belongs to that page.
 */
function splitByPages(markdown: string): Map<number, string> {
  const pages = new Map<number, string>();
  const regex = /<PAGE>(\d+)<PAGE>/g;
  let match: RegExpExecArray | null;
  const positions: { page: number; index: number }[] = [];
  while ((match = regex.exec(markdown)) !== null) {
    positions.push({ page: parseInt(match[1], 10), index: match.index });
  }
  for (let i = 0; i < positions.length; i++) {
    const start =
      positions[i].index + `<PAGE>${positions[i].page}<PAGE>`.length;
    const end =
      i + 1 < positions.length ? positions[i + 1].index : markdown.length;
    pages.set(positions[i].page, markdown.slice(start, end).trim());
  }
  return pages;
}

/**
 * Clean HTML-ish content: strip tags, decode entities, collapse whitespace.
 */
function cleanText(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Get the combined markdown content for a list of page numbers, preserving
 * order and inserting a page marker so the LLM knows which page is which.
 * HTML tables are converted to compact pipe-delimited text to save tokens.
 */
function getPagesContent(
  pages: Map<number, string>,
  pageNumbers: number[],
): string {
  return pageNumbers
    .map((p) => {
      const content = pages.get(p) ?? "";
      return `=== PAGE ${p} ===\n${content}`;
    })
    .join("\n\n");
}

/**
 * Convert HTML <table> blocks in markdown to compact pipe-delimited text.
 * This dramatically reduces token count for table-heavy EPD pages.
 */
function simplifyTables(content: string): string {
  return content.replace(/<table>([\s\S]*?)<\/table>/g, (fullTable) => {
    // Extract headers
    const headers: string[] = [];
    const theadMatch = fullTable.match(/<thead>([\s\S]*?)<\/thead>/);
    if (theadMatch) {
      const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
      let thMatch: RegExpExecArray | null;
      while ((thMatch = thRegex.exec(theadMatch[1])) !== null) {
        headers.push(cleanText(thMatch[1]));
      }
    }

    // Extract rows
    const lines: string[] = [];
    if (headers.length > 0) {
      lines.push(headers.join(" | "));
    }

    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(fullTable)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cleanText(cellMatch[1]));
      }
      if (cells.length > 0) {
        lines.push(cells.join(" | "));
      }
    }

    return lines.join("\n");
  });
}

// ── LLM call helper ──────────────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  thinkLevel: "high" | "low" | "medium" | false = "high",
): Promise<string> {
  const response = await ollama.chat({
    model: MODEL,
    stream: true,
    keep_alive: -1,
    think: thinkLevel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  let fullContent = "";
  for await (const part of response) {
    if (part.message?.thinking) {
      process.stderr.write(".");
    }
    if (part.message?.content) {
      fullContent += part.message.content;
    }
  }
  process.stderr.write("\n");
  return fullContent;
}

/**
 * Strip markdown code fences and extract the JSON object.
 */
function extractJSON(raw: string): string {
  let text = raw.trim();
  // Remove ```json ... ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  // If there's still leading/trailing prose, try to find the first { ... last }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

// ── Extraction prompts ──────────────────────────────────────────────────────

const PRODUCT_SYSTEM_PROMPT = `You are an expert at extracting structured data from Environmental Product Declarations (EPDs).
You will be given markdown content from specific pages of an EPD document.
Page numbers are indicated by === PAGE N === markers.

Extract the product information and return it as a JSON object with this exact structure:

{
  "epd_id": "string — the EPD ID (e.g. HUB-5210)",
  "product_name": "string",
  "product_type": "string (e.g. Ready-mix concrete)",
  "epd_program_operator": "string",
  "epd_standards": ["array of strings"],
  "epd_publication_date": "YYYY-MM-DD",
  "epd_last_updated_date": "YYYY-MM-DD",
  "epd_valid_until_date": "YYYY-MM-DD",
  "manufacturer": {
    "name": "string",
    "address": "string",
    "contact_email": "string",
    "website": "string"
  },
  "manufacturing_location": "string",
  "manufacturing_sites": ["array of strings"],
  "product_characteristics": {
    "<characteristic_key>": {
      "value": number,
      "page_number": number,
      "excerpt": "string — exact text from the document"
    }
  }
}

Rules:
- Use the page_number from the === PAGE N === marker where each value was found.
- Include the exact excerpt text from the document that supports each value.
- If a field is not found in the provided pages, omit it (do not include null or empty strings).
- Return ONLY the JSON object. No markdown, no prose, no code fences.`;

const ENV_SYSTEM_PROMPT = `You are an expert at extracting environmental impact data from Environmental Product Declarations (EPDs).
You will be given markdown content from specific pages of an EPD document.
Page numbers are indicated by === PAGE N === markers.

The content contains HTML tables with environmental impact data. Each table has columns for different life cycle modules (A1, A2, A3, A1-A3, C1, C2, C3, C4, D).

Extract ALL environmental impact indicators and return them as a JSON object with this structure:

{
  "environmental_impacts": {
    "<indicator_key>": {
      "indicator_name": "string — full name as shown in the table (e.g. 'GWP – total')",
      "unit": "string (e.g. kg CO₂e)",
      "modules": {
        "A1": {
          "value": number,
          "page_number": number,
          "excerpt": "string — the table row text supporting this value"
        },
        "A2": { ... },
        "A3": { ... },
        "A1-A3": { ... },
        "C1": { ... },
        "C2": { ... },
        "C3": { ... },
        "C4": { ... },
        "D": { ... }
      }
    }
  }
}

Rules:
- Convert scientific notation (e.g. 2.55E+02) to numeric values (e.g. 255).
- Use the indicator name from the first column of each table row as indicator_name.
- Create a snake_case key for each indicator (e.g. "gwp_total", "gwp_fossil", "acidification_potential").
- Use the page_number from the === PAGE N === marker where the table appears.
- Include the exact excerpt text from the table row that supports each value.
- Only include modules that have values in the table. Do not include modules that are not declared (ND).
- Return ONLY the JSON object. No markdown, no prose, no code fences.`;

// ── Main ────────────────────────────────────────────────────────────────────

/**
 * Process a single EPD directory: read markdown.md + segment.json, call the
 * LLM for product info and environmental impact data, then write extracted.json.
 */
async function processEPD(epdDir: string, combinedEnv = false): Promise<void> {
  const markdownPath = join(epdDir, "markdown.md");
  const segmentPath = join(epdDir, "segment.json");

  console.log(`📖 Reading markdown:  ${markdownPath}`);
  console.log(`📊 Reading segments: ${segmentPath}`);

  const [markdown, segmentRaw] = await Promise.all([
    readFile(markdownPath, "utf8"),
    readFile(segmentPath, "utf8"),
  ]);

  const segmentFile: SegmentFile = JSON.parse(segmentRaw);
  const pages = splitByPages(markdown);

  // Group pages by category (preserving segment order, deduplicating)
  const productPages: number[] = [];
  const envPages: number[] = [];
  for (const seg of segmentFile.segments) {
    if (seg.category === "Product Information and Specs") {
      for (const p of seg.pages)
        if (!productPages.includes(p)) productPages.push(p);
    } else if (seg.category === "Environmental Impact Data") {
      for (const p of seg.pages) if (!envPages.includes(p)) envPages.push(p);
    }
  }
  productPages.sort((a, b) => a - b);
  envPages.sort((a, b) => a - b);

  console.log(`\n📄 Product Information pages:  [${productPages.join(", ")}]`);
  console.log(`🌱 Environmental Impact pages: [${envPages.join(", ")}]`);

  // ── Step 1: Extract product info ───────────────────────────────────────────
  console.log("\n⏳ Step 1: Extracting product information via LLM...");
  const productContent = getPagesContent(pages, productPages);
  const productRaw = await callLLM(
    PRODUCT_SYSTEM_PROMPT,
    `Below is the EPD markdown content for the "Product Information and Specs" pages.\n\n${productContent}`,
  );
  const productJSON = extractJSON(productRaw);
  const productData = JSON.parse(productJSON);
  console.log("✅ Product information extracted.");

  // ── Step 2: Extract environmental impact data ─────────────────────────────
  // Two strategies:
  //   • combined (default when --combined): send ALL env pages in one LLM call so
  //     the model sees every module (A1-A3 and C1-D) in a single context.
  //   • chunked (default): split into 1-page batches to keep each call small enough
  //     that the model finishes JSON output before running out of tokens.
  const allImpacts: Record<string, unknown> = {};

  if (combinedEnv) {
    // ── Combined: all pages in one LLM call ──────────────────────────────────
    console.log(
      "\n⏳ Step 2: Extracting environmental impact data via LLM (combined — all pages in one call)...",
    );
    const envContent = getPagesContent(pages, envPages);
    const envRaw = await callLLM(
      ENV_SYSTEM_PROMPT,
      `Below is the EPD markdown content for ALL "Environmental Impact Data" pages combined. Tables have been converted to pipe-delimited text.\n\n${envContent}`,
      false,
    );
    const envJSON = extractJSON(envRaw);
    try {
      const envResult = JSON.parse(envJSON);
      const impacts = envResult.environmental_impacts ?? {};
      for (const [key, val] of Object.entries(impacts)) {
        allImpacts[key] = val;
      }
      console.log(
        `     ✅ Extracted ${Object.keys(impacts).length} indicators from combined call`,
      );
    } catch {
      console.log(
        `     ⚠️  Could not parse JSON from combined call, falling back to chunked mode`,
      );
      // Fall back to chunked extraction below
      const envChunks: number[][] = envPages.map((p) => [p]);
      for (let i = 0; i < envChunks.length; i++) {
        const chunkPages = envChunks[i];
        console.log(
          `   [${i + 1}/${envChunks.length}] Pages [${chunkPages.join(", ")}]...`,
        );
        const chunkContent = getPagesContent(pages, chunkPages);
        const chunkRaw = await callLLM(
          ENV_SYSTEM_PROMPT,
          `Below is the EPD markdown content for the "Environmental Impact Data" pages (batch ${i + 1} of ${envChunks.length}). Tables have been converted to pipe-delimited text.\n\n${chunkContent}`,
          false,
        );
        const chunkJSON = extractJSON(chunkRaw);
        try {
          const chunkData = JSON.parse(chunkJSON);
          const impacts = chunkData.environmental_impacts ?? {};
          for (const [key, val] of Object.entries(impacts)) {
            if (allImpacts[key]) {
              const existing = allImpacts[key] as {
                modules?: Record<string, unknown>;
              };
              const incoming =
                (val as { modules?: Record<string, unknown> }).modules ?? {};
              existing.modules = { ...(existing.modules ?? {}), ...incoming };
            } else {
              allImpacts[key] = val;
            }
          }
          console.log(
            `     ✅ Extracted ${Object.keys(impacts).length} indicators`,
          );
        } catch {
          console.log(
            `     ⚠️  Could not parse JSON from this chunk, skipping`,
          );
        }
      }
    }
  } else {
    // ── Chunked: 1-page batches (default) ────────────────────────────────────
    console.log(
      "\n⏳ Step 2: Extracting environmental impact data via LLM (chunked)...",
    );

    // Build 1-page chunks — table-heavy pages need individual LLM calls
    // to avoid running out of output tokens.
    const envChunks: number[][] = envPages.map((p) => [p]);

    for (let i = 0; i < envChunks.length; i++) {
      const chunkPages = envChunks[i];
      console.log(
        `   [${i + 1}/${envChunks.length}] Pages [${chunkPages.join(", ")}]...`,
      );
      const chunkContent = getPagesContent(pages, chunkPages);
      const chunkRaw = await callLLM(
        ENV_SYSTEM_PROMPT,
        `Below is the EPD markdown content for the "Environmental Impact Data" pages (batch ${i + 1} of ${envChunks.length}). Tables have been converted to pipe-delimited text.\n\n${chunkContent}`,
        false,
      );
      const chunkJSON = extractJSON(chunkRaw);
      try {
        const chunkData = JSON.parse(chunkJSON);
        const impacts = chunkData.environmental_impacts ?? {};
        // Merge — for indicators that already exist (e.g. same indicator in A1-A3 and C1-D tables),
        // merge the modules together.
        for (const [key, val] of Object.entries(impacts)) {
          if (allImpacts[key]) {
            const existing = allImpacts[key] as {
              modules?: Record<string, unknown>;
            };
            const incoming =
              (val as { modules?: Record<string, unknown> }).modules ?? {};
            existing.modules = { ...(existing.modules ?? {}), ...incoming };
          } else {
            allImpacts[key] = val;
          }
        }
        console.log(
          `     ✅ Extracted ${Object.keys(impacts).length} indicators`,
        );
      } catch {
        console.log(`     ⚠️  Could not parse JSON from this chunk, skipping`);
      }
    }
  }

  console.log("✅ Environmental impact data extracted.");
  const envData = { environmental_impacts: allImpacts };

  // ── Combine and write output ──────────────────────────────────────────────
  const result = {
    ...productData,
    environmental_impacts: envData.environmental_impacts,
    extraction_metadata: {
      extracted_at: new Date().toISOString(),
      markdown_path: markdownPath,
      segment_path: segmentPath,
      product_info_pages: productPages,
      environmental_impact_pages: envPages,
      model: MODEL,
      gateway: "cloudflare-ai-gateway",
    },
  };

  const outPath = join(epdDir, "extracted.json");
  await writeFile(outPath, JSON.stringify(result, null, 2), "utf8");

  const impactCount = Object.keys(envData.environmental_impacts ?? {}).length;
  console.log(
    `\n🎉 Done! Extracted ${impactCount} environmental impact indicators.`,
  );
  console.log(`   Output: ${outPath}`);
}

/**
 * Extract a single EPD subdirectory by name or path.
 *
 * Resolves the subdirectory against the default data/ root (unless
 * an absolute/relative path is given), verifies markdown.md + segment.json exist,
 * then runs the full extraction pipeline and overwrites extracted.json.
 *
 * @param subdir  Bare subdirectory name (e.g. "EPD_HUB-5210_2026-06-27_en") or a path.
 * @param resourcesDir  The data root to resolve bare names against.
 */
async function extractSingle(
  subdir: string,
  resourcesDir: string,
  combinedEnv = false,
): Promise<void> {
  // If the argument is an existing directory path, use it directly;
  // otherwise treat it as a subdirectory name under resourcesDir.
  let epdDir: string;
  try {
    const st = await stat(subdir);
    if (st.isDirectory()) {
      epdDir = resolve(resourcesDir, subdir);
    } else {
      throw new Error("not a directory");
    }
  } catch {
    epdDir = join(resourcesDir, subdir);
  }

  console.log(`🎯 Single-directory extraction mode`);
  console.log(`   Target: ${epdDir}`);

  const markdownPath = join(epdDir, "markdown.md");
  const segmentPath = join(epdDir, "segment.json");
  try {
    await Promise.all([stat(markdownPath), stat(segmentPath)]);
  } catch {
    console.error(
      `❌ Directory "${epdDir}" is missing markdown.md or segment.json.`,
    );
    process.exit(1);
  }

  await processEPD(epdDir, combinedEnv);
}

/**
 * Process a single EPD directory with pre-flight checks.
 * Returns true on success, false on failure/skip.
 */
async function processEPDSafe(
  epdDir: string,
  index: number,
  total: number,
  combinedEnv = false,
): Promise<boolean> {
  console.log(
    `\n${"=".repeat(70)}\n` +
      `📦 [${index + 1}/${total}] ${epdDir}\n` +
      `${"=".repeat(70)}`,
  );

  // Verify required files exist before processing
  const markdownPath = join(epdDir, "markdown.md");
  const segmentPath = join(epdDir, "segment.json");
  try {
    await Promise.all([stat(markdownPath), stat(segmentPath)]);
  } catch {
    console.log(`⚠️  Skipping — missing markdown.md or segment.json`);
    return false;
  }

  try {
    await processEPD(epdDir, combinedEnv);
    return true;
  } catch (err) {
    console.error(`❌ Failed to process ${epdDir}:`, err);
    return false;
  }
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = resolve(scriptDir, "..");
  const defaultResourcesDir = join(workspaceRoot, "data");

  // ── --combined flag (works with both --single and batch mode) ─────────────
  const combinedEnv = process.argv.includes("--combined");

  // ── --single <subdir> mode ────────────────────────────────────────────────
  const singleIdx = process.argv.indexOf("--single");
  if (singleIdx !== -1) {
    const subdir = process.argv[singleIdx + 1];
    if (!subdir) {
      console.error(
        "❌ --single requires a subdirectory name or path, e.g. --single EPD_HUB-5210_2026-06-27_en",
      );
      process.exit(1);
    }
    await extractSingle(subdir, defaultResourcesDir, combinedEnv);
    return;
  }

  // ── batch mode ─────────────────────────────────────────────────────────────
  // Filter out --combined so it doesn't get mistaken for the resources dir arg
  const positionalArgs = process.argv
    .slice(2)
    .filter((a) => a !== "--combined");
  const resourcesDir = positionalArgs[0]
    ? resolve(positionalArgs[0])
    : defaultResourcesDir;
  const concurrency = Math.max(1, parseInt(positionalArgs[1] ?? "3", 10));

  console.log(`🔎 Scanning ${resourcesDir} for EPD directories...`);

  const entries = await readdir(resourcesDir, { withFileTypes: true });
  const epdDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => join(resourcesDir, e.name))
    .sort();

  if (epdDirs.length === 0) {
    console.log("No subdirectories found in data/");
    return;
  }

  console.log(
    `Found ${epdDirs.length} EPD directories. Concurrency: ${concurrency}\n`,
  );

  let succeeded = 0;
  let failed = 0;
  let nextIndex = 0;

  // Worker that continuously picks up the next EPD directory until none remain
  async function worker() {
    while (true) {
      const myIndex = nextIndex++;
      if (myIndex >= epdDirs.length) break;
      const ok = await processEPDSafe(
        epdDirs[myIndex],
        myIndex,
        epdDirs.length,
        combinedEnv,
      );
      if (ok) succeeded++;
      else failed++;
    }
  }

  // Launch `concurrency` workers in parallel
  const workers = Array.from(
    { length: Math.min(concurrency, epdDirs.length) },
    () => worker(),
  );
  await Promise.all(workers);

  console.log(
    `\n${"=".repeat(70)}\n` +
      `🏁 All done! ${succeeded} succeeded, ${failed} failed out of ${epdDirs.length} directories.\n` +
      `${"=".repeat(70)}`,
  );
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
