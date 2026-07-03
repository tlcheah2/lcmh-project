// ── Raw extracted.json shape (loosely typed — the source files vary) ──

export interface RawModuleValue {
  value?: number | null;
  page_number?: number;
  excerpt?: string;
}

export interface RawIndicator {
  indicator_name?: string;
  unit?: string;
  modules?: Record<string, RawModuleValue>;
}

export interface RawCharacteristic {
  value?: number | null;
  page_number?: number;
  excerpt?: string;
}

export interface RawExtracted {
  epd_id?: string;
  product_name?: string;
  product_type?: string;
  epd_program_operator?: string;
  epd_standards?: string[];
  epd_publication_date?: string;
  epd_last_updated_date?: string;
  epd_valid_until_date?: string;
  manufacturer?: {
    name?: string;
    address?: string;
    contact_email?: string;
    website?: string;
  };
  manufacturing_location?: string;
  manufacturing_sites?: string[];
  product_characteristics?: Record<string, RawCharacteristic>;
  environmental_impacts?: Record<string, RawIndicator>;
  extraction_metadata?: {
    extracted_at?: string;
    markdown_path?: string;
    model?: string;
  };
  [key: string]: unknown;
}

// ── Normalised shape used by the UI ──

export type StageStatus = "declared" | "not_declared" | "not_in_scope";

export interface StageValue {
  stage: string;
  value: number | null;
  status: StageStatus;
  page: number | null;
  excerpt: string | null;
}

export interface GwpIndicator {
  key: string; // normalised: "gwp_total" | "gwp_fossil" | "gwp_biogenic" | "gwp_luluc"
  label: string;
  unit: string;
  stages: StageValue[];
}

export interface ProductCard {
  id: string;
  epdId: string;
  productName: string;
  productType: string;
  manufacturer: string;
  manufacturingLocation: string;
  manufacturingSites: string[];
  compressiveStrength: number | null;
  strengthUnit: string;
  declaredUnitMass: number | null;
  programOperator: string;
  standards: string[];
  publicationDate: string | null;
  validUntil: string | null;
  indicators: GwpIndicator[];
  // Quick-access A1-A3 GWP-total for sorting/cards
  gwpTotalA1A3: number | null;
  // All stages that appear in any indicator (for column headers)
  allStages: string[];
  sourceDir: string;
}

// Canonical stage order for display
export const STAGE_ORDER: string[] = [
  "A1",
  "A2",
  "A3",
  "A1-A3",
  "A4",
  "A5",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "B7",
  "C1",
  "C2",
  "C3",
  "C4",
  "D",
];

export const STAGE_GROUPS: { label: string; stages: string[] }[] = [
  { label: "Product (A1–A3)", stages: ["A1", "A2", "A3", "A1-A3"] },
  { label: "Construction (A4–A5)", stages: ["A4", "A5"] },
  { label: "Use (B1–B7)", stages: ["B1", "B2", "B3", "B4", "B5", "B6", "B7"] },
  { label: "End-of-life (C1–C4)", stages: ["C1", "C2", "C3", "C4"] },
  { label: "Beyond system (D)", stages: ["D"] },
];

export const INDICATOR_LABELS: Record<string, string> = {
  gwp_total: "GWP-total",
  gwp_fossil: "GWP-fossil",
  gwp_biogenic: "GWP-biogenic",
  gwp_luluc: "GWP-LULUC",
  gwp_ghg: "GWP-GHG",
};