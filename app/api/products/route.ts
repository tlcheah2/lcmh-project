import { NextResponse } from "next/server";
import { loadAllProducts } from "@/lib/loader";

export const dynamic = "force-static";

export async function GET() {
  const products = loadAllProducts();
  return NextResponse.json(products);
}
