"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductCard, GwpIndicator, StageValue } from "@/lib/types";
import { STAGE_ORDER, STAGE_GROUPS, INDICATOR_LABELS } from "@/lib/types";

// ── Small UI helpers ──────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colours: Record<string, string> = {
    declared: "bg-emerald-500",
    not_declared: "bg-amber-400",
    not_in_scope: "bg-zinc-300",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colours[status] ?? "bg-zinc-300"}`}
      title={status.replace(/_/g, " ")}
    />
  );
}

function fmt(n: number | null): string {
  if (n === null) return "—";
  if (Math.abs(n) < 0.01 && n !== 0) return n.toExponential(2);
  if (Math.abs(n) < 100) return n.toFixed(2);
  return n.toFixed(0);
}

/** A cell that shows the value *and* a hover tooltip with the source excerpt. */
function ProvenanceCell({ stage }: { stage: StageValue }) {
  if (stage.status === "not_in_scope") {
    return <td className="px-2 py-1.5 text-center text-zinc-300">·</td>;
  }
  if (stage.status === "not_declared" || stage.value === null) {
    return (
      <td className="px-2 py-1.5 text-center">
        <span className="font-medium text-amber-600" title="Not declared (ND) — not zero">
          ND
        </span>
      </td>
    );
  }
  const tooltip = [
    `Page ${stage.page ?? "?"}`,
    stage.excerpt ? `"${stage.excerpt.slice(0, 200)}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <td className="px-2 py-1.5 text-right tabular-nums" title={tooltip}>
      <span className="cursor-help border-b border-dotted border-zinc-400">
        {fmt(stage.value)}
      </span>
    </td>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────

interface Filters {
  strengthMin: string;
  strengthMax: string;
  location: string;
  search: string;
}

export default function Home() {
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({
    strengthMin: "",
    strengthMax: "",
    location: "",
    search: "",
  });
  const [activeIndicator, setActiveIndicator] = useState<string>("gwp_total");
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data: ProductCard[]) => {
        setProducts(data);
        // Pre-select the first 3 products that have GWP-total A1-A3
        const withGwp = data.filter((p) => p.gwpTotalA1A3 !== null).slice(0, 3);
        setSelected(new Set(withGwp.map((p) => p.id)));
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Derived filter options ──
  const locations = useMemo(() => {
    const set = new Set(products.map((p) => p.manufacturingLocation));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${p.productName} ${p.manufacturer} ${p.epdId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.strengthMin && (p.compressiveStrength ?? -1) < parseFloat(filters.strengthMin))
        return false;
      if (filters.strengthMax && (p.compressiveStrength ?? Infinity) > parseFloat(filters.strengthMax))
        return false;
      if (filters.location && p.manufacturingLocation !== filters.location) return false;
      return true;
    });
  }, [products, filters]);

  const selectedProducts = useMemo(
    () => filtered.filter((p) => selected.has(p.id)),
    [filtered, selected],
  );

  // Stages to show in comparison = union of stages across selected products
  const comparisonStages = useMemo(() => {
    const set = new Set<string>();
    for (const p of selectedProducts) {
      for (const ind of p.indicators) {
        if (ind.key !== activeIndicator) continue;
        for (const s of ind.stages) {
          if (s.status !== "not_in_scope") set.add(s.stage);
        }
      }
    }
    return STAGE_ORDER.filter((s) => set.has(s));
  }, [selectedProducts, activeIndicator]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading EPD data…
      </div>
    );
  }

  const detailProduct = detailId ? products.find((p) => p.id === detailId) : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-xl font-semibold tracking-tight">
            Concrete Embodied Carbon Comparison
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Compare concrete EPDs by GWP across the full life cycle. Every figure is
            traceable to its source EPD page and raw text excerpt.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* ── Filters ── */}
        <section className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Search
              </label>
              <input
                type="text"
                placeholder="Product, manufacturer, EPD ID…"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Min strength (MPa)
              </label>
              <input
                type="number"
                placeholder="e.g. 25"
                value={filters.strengthMin}
                onChange={(e) => setFilters({ ...filters, strengthMin: e.target.value })}
                className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Max strength (MPa)
              </label>
              <input
                type="number"
                placeholder="e.g. 50"
                value={filters.strengthMax}
                onChange={(e) => setFilters({ ...filters, strengthMax: e.target.value })}
                className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Manufacturing location
              </label>
              <select
                value={filters.location}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                className="w-full rounded border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
              >
                <option value="">All locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
          {/* ── Product list ── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700">
                Products ({filtered.length})
              </h2>
              <span className="text-xs text-zinc-400">
                {selected.size} selected for comparison
              </span>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
              {filtered.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                    selected.has(p.id)
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {p.productName}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {p.manufacturer} · {p.manufacturingLocation}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
                      {p.compressiveStrength !== null && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5">
                          {p.compressiveStrength} {p.strengthUnit}
                        </span>
                      )}
                      {p.gwpTotalA1A3 !== null ? (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5">
                          A1-A3: {fmt(p.gwpTotalA1A3)} kg CO₂e
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                          No A1-A3 GWP
                        </span>
                      )}
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5">
                        {p.epdId}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setDetailId(p.id);
                      }}
                      className="mt-1 text-xs text-blue-600 hover:underline"
                    >
                      View details & provenance →
                    </button>
                  </div>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="p-4 text-center text-sm text-zinc-400">
                  No products match these filters.
                </p>
              )}
            </div>
          </section>

          {/* ── Comparison ── */}
          <section>
            {selectedProducts.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-400">
                Select products from the list to compare.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Indicator selector */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-zinc-600">Indicator:</span>
                  {Object.entries(INDICATOR_LABELS).map(([key, label]) => {
                    const available = selectedProducts.some((p) =>
                      p.indicators.some((i) => i.key === key),
                    );
                    if (!available) return null;
                    return (
                      <button
                        key={key}
                        onClick={() => setActiveIndicator(key)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          activeIndicator === key
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <StatusDot status="declared" /> Declared
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusDot status="not_declared" /> Not declared (ND ≠ 0)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusDot status="not_in_scope" /> Not in scope
                  </span>
                  <span className="text-zinc-400">
                    · Hover any number for source page & excerpt
                  </span>
                </div>

                {/* Comparison table */}
                <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                        <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 font-semibold">
                          Product
                        </th>
                        {comparisonStages.map((stage) => (
                          <th
                            key={stage}
                            className="px-2 py-2 text-center text-xs font-semibold text-zinc-600"
                          >
                            {stage}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProducts.map((p) => {
                        const ind = p.indicators.find(
                          (i) => i.key === activeIndicator,
                        );
                        if (!ind) {
                          return (
                            <tr key={p.id} className="border-b border-zinc-100">
                              <td className="px-3 py-2 text-xs text-amber-600">
                                {p.productName} — no {INDICATOR_LABELS[activeIndicator]} data
                              </td>
                            </tr>
                          );
                        }
                        const stageMap = new Map(ind.stages.map((s) => [s.stage, s]));
                        return (
                          <tr key={p.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                            <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                              <div className="text-xs font-medium">{p.productName}</div>
                              <div className="text-[10px] text-zinc-400">
                                {p.epdId} · {p.compressiveStrength ?? "?"} MPa
                              </div>
                            </td>
                            {comparisonStages.map((stage) => (
                              <ProvenanceCell
                                key={stage}
                                stage={stageMap.get(stage) ?? {
                                  stage,
                                  value: null,
                                  status: "not_in_scope",
                                  page: null,
                                  excerpt: null,
                                }}
                              />
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Group labels */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-400">
                  {STAGE_GROUPS.map((g) =>
                    g.stages.some((s) => comparisonStages.includes(s)) ? (
                      <span key={g.label}>
                        <strong className="text-zinc-500">{g.label}:</strong>{" "}
                        {g.stages.filter((s) => comparisonStages.includes(s)).join(", ")}
                      </span>
                    ) : null,
                  )}
                </div>

                {/* Comparability warnings */}
                <ComparabilityWarnings products={selectedProducts} />
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ── Detail modal ── */}
      {detailProduct && (
        <DetailModal product={detailProduct} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ── Comparability warnings ────────────────────────────────────────────

function ComparabilityWarnings({ products }: { products: ProductCard[] }) {
  const warnings: string[] = [];

  // Different standards
  if (products.length > 1) {
    const allEn15804 = products.every((p) =>
      p.standards.some((s) => s.includes("EN 15804")),
    );
    if (!allEn15804) {
      warnings.push(
        "Not all products reference the same standard (EN 15804). Cross-standard comparison may not be valid.",
      );
    }
  }

  // Missing A1-A3
  for (const p of products) {
    if (p.gwpTotalA1A3 === null) {
      warnings.push(
        `${p.productName}: no declared A1-A3 GWP-total — cannot compare cradle-to-gate carbon.`,
      );
    }
  }

  // Different declared unit masses (density) — affects per-m³ comparability
  const masses = products
    .map((p) => p.declaredUnitMass)
    .filter((m): m is number => m !== null);
  if (masses.length > 1) {
    const min = Math.min(...masses);
    const max = Math.max(...masses);
    if (max / min > 1.15) {
      warnings.push(
        `Declared unit masses range from ${min}–${max} kg/m³ (>15% difference). Per-m³ figures may not be directly comparable.`,
      );
    }
  }

  // ND stages in selected products
  for (const p of products) {
    const gwpTotal = p.indicators.find((i) => i.key === "gwp_total");
    if (!gwpTotal) continue;
    const ndStages = gwpTotal.stages.filter((s) => s.status === "not_declared");
    if (ndStages.length > 0) {
      warnings.push(
        `${p.productName}: stages ${ndStages.map((s) => s.stage).join(", ")} are ND (not declared) — not zero.`,
      );
    }
  }

  if (warnings.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-2 text-sm font-semibold text-amber-800">
        ⚠ Comparability notes
      </h3>
      <ul className="space-y-1 text-xs text-amber-700">
        {warnings.map((w, i) => (
          <li key={i}>• {w}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Detail modal with full provenance ─────────────────────────────────

function DetailModal({
  product,
  onClose,
}: {
  product: ProductCard;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-200 p-5">
          <div>
            <h2 className="text-lg font-semibold">{product.productName}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {product.manufacturer} · {product.manufacturingLocation}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-zinc-100 px-2 py-0.5">
                EPD: {product.epdId}
              </span>
              {product.compressiveStrength !== null && (
                <span className="rounded bg-zinc-100 px-2 py-0.5">
                  {product.compressiveStrength} {product.strengthUnit}
                </span>
              )}
              {product.declaredUnitMass !== null && (
                <span className="rounded bg-zinc-100 px-2 py-0.5">
                  {product.declaredUnitMass} kg/m³
                </span>
              )}
              <span className="rounded bg-zinc-100 px-2 py-0.5">
                {product.programOperator}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {product.standards.join(" · ")}
            </div>
            {product.publicationDate && (
              <div className="mt-1 text-xs text-zinc-400">
                Published {product.publicationDate}
                {product.validUntil ? ` · Valid until ${product.validUntil}` : ""}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        {/* Body: indicators with provenance */}
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {product.indicators.length === 0 ? (
            <p className="text-sm text-amber-600">
              No GWP indicator data was extracted for this EPD.
            </p>
          ) : (
            <div className="space-y-6">
              {product.indicators.map((ind) => (
                <IndicatorDetail key={ind.key} indicator={ind} />
              ))}
            </div>
          )}

          {/* Manufacturing sites */}
          {product.manufacturingSites.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-zinc-700">
                Manufacturing sites
              </h3>
              <p className="text-xs text-zinc-500">
                {product.manufacturingSites.join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IndicatorDetail({ indicator }: { indicator: GwpIndicator }) {
  const declaredStages = indicator.stages.filter((s) => s.status === "declared");
  const ndStages = indicator.stages.filter((s) => s.status === "not_declared");

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-700">
        {INDICATOR_LABELS[indicator.key] ?? indicator.label}
        <span className="ml-2 text-xs font-normal text-zinc-400">
          {indicator.unit}
        </span>
      </h3>

      {/* Stage values table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-1 pr-3">Stage</th>
            <th className="py-1 pr-3">Value</th>
            <th className="py-1 pr-3">Status</th>
            <th className="py-1 pr-3">Page</th>
            <th className="py-1">Source excerpt</th>
          </tr>
        </thead>
        <tbody>
          {indicator.stages
            .filter((s) => s.status !== "not_in_scope")
            .map((stage) => (
              <tr key={stage.stage} className="border-b border-zinc-50">
                <td className="py-1.5 pr-3 font-medium">{stage.stage}</td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {stage.status === "declared" ? fmt(stage.value) : "ND"}
                </td>
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-1.5">
                    <StatusDot status={stage.status} />
                    <span className="text-zinc-500">
                      {stage.status.replace(/_/g, " ")}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-zinc-400">
                  {stage.page ?? "—"}
                </td>
                <td className="py-1.5 text-zinc-400">
                  {stage.excerpt ? (
                    <span className="block max-w-md truncate" title={stage.excerpt}>
                      {stage.excerpt}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {ndStages.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          ⚠ {ndStages.map((s) => s.stage).join(", ")} are not declared (ND). These are
          missing data, not zero values.
        </p>
      )}
    </div>
  );
}