import fs from "fs";
import path from "path";
import {
  ProductCard,
  GwpIndicator,
  StageValue,
  StageStatus,
  RawExtracted,
  STAGE_ORDER,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────

/** Try to extract an EPD ID from a directory name like "EPD_HUB-5527_2026-06-27_en". */
function extractEpdIdFromDir(dir: string): string {
  // Match patterns like HUB-5527, EPD-IES-23043, etc.
  const m = dir.match(/(?:EPD_)?(HUB-\d+|EPD-IES-[\d:]+)/i);
  if (m) return m[1];
  return dir;
}

/** Normalise various GWP key spellings into a canonical set. */
function normaliseIndicatorKey(raw: string): string | null {
  const k = raw.toLowerCase().replace(/[–\-_\s]/g, "");
  // Must contain "gwp" or "globalwarming" to be a GWP indicator.
  if (!k.includes("gwp") && !k.includes("globalwarming")) return null;
  // Skip component-level keys like gwp_prod, gwp_pack, gwp_a1, global_warming_gwp100a_a1
  // These are sub-components, not the headline GWP indicators we want to compare.
  if (k.includes("prod") || k.includes("pack")) return null;
  if (k.match(/gwp[a]\d/)) return null; // gwp_a1, gwp_a2, etc.
  if (k.includes("gwp100")) return null; // global_warming_gwp100a_a1
  if (k.includes("ar5")) return null; // gwp_ghg_ar5 — variant, skip
  // Now classify by subtype
  if (k.includes("total") || k === "gwptot") return "gwp_total";
  if (k.includes("fossil")) return "gwp_fossil";
  if (k.includes("biogenic")) return "gwp_biogenic";
  if (k.includes("luluc")) return "gwp_luluc";
  if (k.includes("ghg")) return "gwp_ghg";
  // Bare "gwp" or "gwpco2eq" with no subtype → treat as total
  if (k === "gwp" || k === "gwpco2eq" || k === "globalwarmingpotentialtotal")
    return "gwp_total";
  // Anything else with "gwp" but no recognised subtype — skip rather than guess
  return null;
}

/** Extract a numeric compressive strength from the varied key names. */
function extractStrength(raw: RawExtracted): {
  value: number | null;
  unit: string;
} {
  const pc = raw.product_characteristics ?? {};
  const candidates = [
    "characteristic_compressive_strength_mpa",
    "compressive_strength",
    "compressive_strength_mpa",
  ];
  for (const key of candidates) {
    const entry = pc[key];
    if (entry && typeof entry.value === "number") {
      return { value: entry.value, unit: "MPa" };
    }
  }
  // Try to parse from product name, e.g. "N40/20", "32MPa", "S25", "S32MPa"
  const name = raw.product_name ?? "";
  // Explicit MPa in name
  const m = name.match(/(\d+)\s*(?:MPa|mpa|Mpa)/);
  if (m) return { value: parseInt(m[1], 10), unit: "MPa" };
  // Patterns like "N40/20" or "S25 " — letter prefix + 2-3 digits + slash or space
  const n = name.match(/(?:^|[^\dA-Z])([SN])(\d{2,3})(?:\/\d+)/);
  if (n) return { value: parseInt(n[2], 10), unit: "MPa" };
  // "S25MPa" or "S32MPa" already caught by first regex
  return { value: null, unit: "MPa" };
}

function extractDeclaredUnitMass(raw: RawExtracted): number | null {
  const pc = raw.product_characteristics ?? {};
  const candidates = ["declared_unit_mass_kg", "declared_unit_mass", "density"];
  for (const key of candidates) {
    const entry = pc[key];
    if (entry && typeof entry.value === "number") return entry.value;
  }
  return null;
}

function stageStatus(
  stage: string,
  modules: Record<string, { value?: number | null }>,
  declaredStages: Set<string>,
): StageStatus {
  if (modules[stage]) {
    const v = modules[stage].value;
    if (v === null || v === undefined) return "not_declared";
    return "declared";
  }
  // If the indicator has *some* modules but not this one, it's not in scope
  if (declaredStages.size > 0) return "not_in_scope";
  return "not_in_scope";
}

function buildStageValues(
  modules: Record<
    string,
    { value?: number | null; page_number?: number; excerpt?: string }
  >,
): StageValue[] {
  const declaredStages = new Set(Object.keys(modules));
  const result: StageValue[] = [];
  for (const stage of STAGE_ORDER) {
    const mod = modules[stage];
    if (mod) {
      const v = mod.value;
      result.push({
        stage,
        value: typeof v === "number" ? v : null,
        status: typeof v === "number" ? "declared" : "not_declared",
        page: mod.page_number ?? null,
        excerpt: mod.excerpt ?? null,
      });
    } else {
      result.push({
        stage,
        value: null,
        status: stageStatus(stage, modules, declaredStages),
        page: null,
        excerpt: null,
      });
    }
  }
  return result;
}

// ── Main loader ──────────────────────────────────────────────────────

export function loadAllProducts(): ProductCard[] {
  const baseDir = path.join(process.cwd(), "processed-resources");
  if (!fs.existsSync(baseDir)) return [];

  const dirs = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const products: ProductCard[] = [];

  for (const dir of dirs) {
    const filePath = path.join(baseDir, dir, "extracted.json");
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = JSON.parse(
        fs.readFileSync(filePath, "utf-8"),
      ) as RawExtracted;
      const product = normaliseProduct(raw, dir);
      if (product) products.push(product);
    } catch {
      // skip malformed
    }
  }

  return products;
}

function normaliseProduct(raw: RawExtracted, dir: string): ProductCard | null {
  // Try to extract epd_id from directory name if missing (e.g. "EPD_HUB-5527_..." → "HUB-5527")
  const epdId = raw.epd_id ?? extractEpdIdFromDir(dir);
  const productName = raw.product_name ?? "Unknown product";

  // ── Indicators ──
  const indicators: GwpIndicator[] = [];
  const impacts = raw.environmental_impacts ?? {};
  const seenKeys = new Set<string>();

  for (const [rawKey, indicator] of Object.entries(impacts)) {
    const canonicalKey = normaliseIndicatorKey(rawKey);
    if (!canonicalKey || !indicator.modules) continue;
    if (seenKeys.has(canonicalKey)) continue;
    seenKeys.add(canonicalKey);

    indicators.push({
      key: canonicalKey,
      label: indicator.indicator_name ?? canonicalKey,
      unit: indicator.unit ?? "kg CO₂e",
      stages: buildStageValues(indicator.modules),
    });
  }

  // If no gwp_total indicator was found in environmental_impacts, try to
  // synthesise one from product_characteristics summary fields (e.g. gwp_total_a1_a3).
  if (!seenKeys.has("gwp_total")) {
    const pc = raw.product_characteristics ?? {};
    // Match keys like: gwp_total_a1_a3, gwp_total_a1_a3_kg_co2e, a1_a3_gwp_tot
    const summaryKeys = Object.keys(pc).filter(
      (k) =>
        /gwp.*total.*a1.*a3|a1.*a3.*gwp.*total|gwp_total_a1_a3/i.test(k) ||
        /a1.*a3.*gwp.*tot/i.test(k),
    );
    for (const sk of summaryKeys) {
      const entry = pc[sk];
      if (!entry || typeof entry.value !== "number") continue;
      seenKeys.add("gwp_total");

      indicators.push({
        key: "gwp_total",
        label: "GWP-total",
        unit: "kg CO₂e",
        stages: buildStageValues({
          "A1-A3": {
            value: entry.value,
            page_number: entry.page_number,
            excerpt: entry.excerpt,
          },
        }),
      });
      break; // only one gwp_total
    }
  }

  // Similarly, if gwp_fossil is missing but there's a summary in characteristics
  if (!seenKeys.has("gwp_fossil")) {
    const pc = raw.product_characteristics ?? {};
    const summaryKeys = Object.keys(pc).filter((k) =>
      /gwp.*fossil.*a1.*a3|a1.*a3.*gwp.*fossil|gwp_fossil_a1_a3/i.test(k),
    );
    for (const sk of summaryKeys) {
      const entry = pc[sk];
      if (!entry || typeof entry.value !== "number") continue;
      seenKeys.add("gwp_fossil");

      indicators.push({
        key: "gwp_fossil",
        label: "GWP-fossil",
        unit: "kg CO₂e",
        stages: buildStageValues({
          "A1-A3": {
            value: entry.value,
            page_number: entry.page_number,
            excerpt: entry.excerpt,
          },
        }),
      });
      break;
    }
  }

  // Sort indicators: total first, then fossil, biogenic, luluc, ghg
  const indicatorOrder = [
    "gwp_total",
    "gwp_fossil",
    "gwp_biogenic",
    "gwp_luluc",
    "gwp_ghg",
  ];
  indicators.sort(
    (a, b) => indicatorOrder.indexOf(a.key) - indicatorOrder.indexOf(b.key),
  );

  // ── Quick-access A1-A3 GWP-total ──
  const gwpTotal = indicators.find((i) => i.key === "gwp_total");
  const a1a3Stage = gwpTotal?.stages.find((s) => s.stage === "A1-A3");
  const gwpTotalA1A3 =
    a1a3Stage?.status === "declared" ? a1a3Stage.value : null;

  // ── All stages across all indicators ──
  const allStagesSet = new Set<string>();
  for (const ind of indicators) {
    for (const s of ind.stages) {
      if (s.status !== "not_in_scope") allStagesSet.add(s.stage);
    }
  }
  const allStages = STAGE_ORDER.filter((s) => allStagesSet.has(s));

  // ── Strength ──
  const { value: compressiveStrength, unit: strengthUnit } =
    extractStrength(raw);

  return {
    id: dir,
    epdId,
    productName,
    productType: raw.product_type ?? "Concrete",
    manufacturer: raw.manufacturer?.name ?? "Unknown",
    manufacturingLocation: raw.manufacturing_location ?? "Unknown",
    manufacturingSites: raw.manufacturing_sites ?? [],
    compressiveStrength,
    strengthUnit,
    declaredUnitMass: extractDeclaredUnitMass(raw),
    programOperator: raw.epd_program_operator ?? "Unknown",
    standards: raw.epd_standards ?? [],
    publicationDate: raw.epd_publication_date ?? null,
    validUntil: raw.epd_valid_until_date ?? null,
    indicators,
    gwpTotalA1A3,
    allStages,
    sourceDir: dir,
  };
}
