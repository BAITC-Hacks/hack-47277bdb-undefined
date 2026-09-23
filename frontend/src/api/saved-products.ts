import { getApiErrorStatus } from "./client";
import { productsApi } from "./products.api";
import type { Product } from "../types/product.types";

// Saved endpoints deliberately return compact summaries. Reuse real regional
// product details with bounded parallelism; never invent prices or stock.
export async function hydrateSavedProducts(items: Array<{ id: string; slug: string }>, city?: string): Promise<Product[]> {
  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  const hydrated: Array<Product | null> = new Array(unique.length).fill(null);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
    while (nextIndex < unique.length) {
      const index = nextIndex++;
      try {
        hydrated[index] = await productsApi.get(unique[index]!.slug, city);
      } catch (error) {
        if (getApiErrorStatus(error) !== 404) throw error;
      }
    }
  }));
  return hydrated.filter((product): product is Product => product !== null);
}
