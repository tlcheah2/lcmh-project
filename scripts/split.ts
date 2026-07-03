import "dotenv/config";
import LlamaCloud from "@llamaindex/llama-cloud";
import fs from "fs";
import path from "path";

// Initialize client
// See how to get your API key at https://developers.llamaindex.ai/typescript/cloud/general/api_key/
//
// Usage:
//   npx tsx scripts/split.ts                              # batch: process all PDFs in epd-pdf/
//   npx tsx scripts/split.ts --single <pdf-name-or-path>  # process a single PDF
//
// --single accepts:
//   - A bare folder/PDF name (e.g. EPD_HUB-5210_2026-06-27_en or EPD_HUB-5210_2026-06-27_en.pdf)
//     resolved against the epd-pdf/ directory.
//   - An absolute or relative path to a PDF file.
const client = new LlamaCloud({ apiKey: process.env.LLAMA_CLOUD_API_KEY });

// Define categories for splitting
const categories = [
  {
    name: "Product Information and Specs",
    description: "Contain product information and specification",
  },
  {
    name: "Environmental Impact Data",
    description:
      "Contain details figure the product contribute to environmental impact such as carbon figure.",
  },
];

const PDF_DIR = path.resolve(process.cwd(), "epd-pdf");
const OUTPUT_ROOT = process.cwd();

async function processPdf(pdfPath: string) {
  const fileName = path.basename(pdfPath);
  const folderName = fileName.replace(/\.pdf$/i, "");
  const folderPath = path.join(OUTPUT_ROOT, folderName);

  console.log(`\n=== Processing ${fileName} ===`);

  // Create output folder
  fs.mkdirSync(folderPath, { recursive: true });

  //   // 1. Upload + parse (same flow as scripts/parse.ts)
  //   console.log(`Uploading ${fileName}...`);
  const fileObj = await client.files.create({
    file: fs.createReadStream(pdfPath),
    purpose: "split",
  });

  //   console.log(`Parsing ${fileName}...`);
  //   const result = await client.parsing.parse({
  //     file_id: fileObj.id,
  //     tier: "agentic",
  //     version: "latest",
  //     output_options: {
  //       markdown: {
  //         tables: {
  //           output_tables_as_markdown: true,
  //         },
  //       },
  //     },
  //     expand: ["markdown"],
  //   });

  //   // Build markdown with per-page separators and write to folder
  //   const pages = result.markdown?.pages ?? [];
  //   let markdownOutput = "";
  //   for (const [index, page] of pages.entries()) {
  //     const pageNumber = index + 1;
  //     const pageMarkdown = "markdown" in page ? page.markdown : "";
  //     markdownOutput += `<PAGE>${pageNumber}<PAGE>\n${pageMarkdown ?? ""}\n\n`;
  //   }

  //   fs.writeFileSync(path.join(folderPath, "markdown.md"), markdownOutput);
  //   console.log(
  //     `Wrote markdown.md (${markdownOutput.length} chars, ${pages.length} pages)`,
  //   );

  // 2. Create split job using the uploaded file ID
  console.log(`Creating split job for ${fileName}...`);
  let job = await client.beta.split.create({
    document_input: { type: "file_id", value: fileObj.id },
    configuration: {
      categories,
      splitting_strategy: { allow_uncategorized: "include" },
    },
  });
  console.log(`Split job created: ${job.id}`);

  // Wait for completion — poll with retries so a timeout doesn't lose the job
  const MAX_WAIT_MS = 10 * 60_000; // 10 minutes total
  const POLL_INTERVAL = 5_000; // 5 seconds
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    job = await client.beta.split.get(job.id);

    if (job.status === "completed" || job.status === "failed") break;

    console.log(
      `  [${fileName}] split job ${job.id} status: ${job.status}, waiting...`,
    );
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  if (job.status !== "completed" || !job.result) {
    throw new Error(
      `Split job ${job.status}: ${job.error_message ?? "no details"}`,
    );
  }

  // Write segment.json to folder
  const segmentData = { segments: job.result.segments };
  fs.writeFileSync(
    path.join(folderPath, "segment.json"),
    JSON.stringify(segmentData, null, 2),
  );

  console.log(`Wrote segment.json (${job.result.segments.length} segments):`);
  for (const segment of job.result.segments) {
    console.log(
      `  - ${segment.category}: Pages ${segment.pages.join(", ")} (${segment.confidence_category} confidence)`,
    );
  }
}

const CONCURRENCY = 5;

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;
        await worker(item);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * Process a single PDF by name or path.
 *
 * The argument can be:
 *   - A bare filename (e.g. "EPD_HUB-5210_2026-06-27_en.pdf") — resolved
 *     against the default epd-pdf/ directory.
 *   - A bare folder name without extension (e.g. "EPD_HUB-5210_2026-06-27_en")
 *     — ".pdf" is appended and resolved against epd-pdf/.
 *   - An absolute or relative path to a PDF file.
 */
async function splitSingle(pdfArg: string) {
  let pdfPath: string;

  if (path.isAbsolute(pdfArg) || pdfArg.includes(path.sep)) {
    // Treat as an explicit path
    pdfPath = path.resolve(pdfArg);
  } else {
    // Bare name — resolve against the PDF directory
    const withExt = pdfArg.toLowerCase().endsWith(".pdf")
      ? pdfArg
      : `${pdfArg}.pdf`;
    pdfPath = path.join(PDF_DIR, withExt);
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  console.log(`=== Single PDF mode ===`);
  await processPdf(pdfPath);
  console.log("\nDone!");
}

async function main() {
  // ── --single <pdf-name-or-path> mode ──────────────────────────────────────
  const singleIdx = process.argv.indexOf("--single");
  if (singleIdx !== -1) {
    const pdfArg = process.argv[singleIdx + 1];
    if (!pdfArg) {
      console.error(
        "❌ --single requires a PDF name or path, e.g. --single EPD_HUB-5210_2026-06-27_en",
      );
      process.exit(1);
    }
    await splitSingle(pdfArg);
    return;
  }

  // ── batch mode ─────────────────────────────────────────────────────────────
  const pdfFiles = fs
    .readdirSync(PDF_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(PDF_DIR, f));

  console.log(
    `Found ${pdfFiles.length} PDF files in ${PDF_DIR} (concurrency: ${CONCURRENCY})`,
  );

  await runWithConcurrency(pdfFiles, CONCURRENCY, async (pdfPath) => {
    try {
      await processPdf(pdfPath);
    } catch (err) {
      console.error(`Error processing ${path.basename(pdfPath)}:`, err);
    }
  });

  console.log("\nDone!");
}

main().catch(console.error);
