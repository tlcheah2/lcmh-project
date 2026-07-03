import "dotenv/config";
import LlamaCloud from "@llamaindex/llama-cloud";
import fs from "fs";
import path from "path";

const client = new LlamaCloud({
  apiKey: process.env.LLAMA_CLOUD_API_KEY,
});

const PDF_DIR = path.resolve(process.cwd(), "epd-pdf");
const OUTPUT_ROOT = process.cwd();

async function processPdf(pdfPath: string) {
  const fileName = path.basename(pdfPath);
  const folderName = fileName.replace(/\.pdf$/i, "");
  const folderPath = path.join(OUTPUT_ROOT, folderName);

  console.log(`\n=== Parsing ${fileName} ===`);

  // Create output folder
  fs.mkdirSync(folderPath, { recursive: true });

  // Upload
  const fileObj = await client.files.create({
    file: fs.createReadStream(pdfPath),
    purpose: "parse",
  });

  // Submit + poll + get (parsing.parse wraps create / waitForCompletion / get)
  // Throws on FAILED or CANCELLED. Tune pollingInterval / timeout in the options.
  const result = await client.parsing.parse({
    file_id: fileObj.id,
    tier: "agentic",
    version: "latest",
    output_options: {
      markdown: {
        tables: {
          output_tables_as_markdown: true,
        },
      },
    },
    // expand: which fields to materialize (markdown_full, text_full, items, *_content_metadata, ...)
    expand: ["markdown"],
  });

  // Build markdown with per-page separators and write to folder
  const pages = result.markdown?.pages ?? [];
  let markdownOutput = "";
  for (const [index, page] of pages.entries()) {
    const pageNumber = index + 1;
    const pageMarkdown = "markdown" in page ? page.markdown : "";
    markdownOutput += `<PAGE>${pageNumber}<PAGE>\n${pageMarkdown ?? ""}\n\n`;
  }

  fs.writeFileSync(path.join(folderPath, "markdown.md"), markdownOutput);
  console.log(
    `Wrote markdown.md (${markdownOutput.length} chars, ${pages.length} pages)`,
  );
}

async function main() {
  const pdfFiles = fs
    .readdirSync(PDF_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((f) => path.join(PDF_DIR, f));

  console.log(`Found ${pdfFiles.length} PDF files in ${PDF_DIR}`);

  for (const pdfPath of pdfFiles) {
    try {
      await processPdf(pdfPath);
    } catch (err) {
      console.error(`Error parsing ${path.basename(pdfPath)}:`, err);
    }
  }

  console.log("\nDone!");
}

main().catch(console.error);
