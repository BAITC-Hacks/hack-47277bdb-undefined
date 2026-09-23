import type { CatalogPriceRecord, CatalogProduct } from "../catalog/types.js";
import type { CatalogCertificate, CatalogWarehouseStock } from "../schemas/catalog.js";

/**
 * Deterministic demo data for the catalog adapter.  All document, image and
 * product links intentionally point to `mock.ekt.kz`: these records are never
 * presented as a live EKT stock, price, or certificate source.
 */

type AttributeMap = Record<string, string | number | boolean | string[]>;
type StockProfile = "standard" | "limited" | "bulk" | "out" | "preorder";

interface ProductSeedInput {
  id: string;
  sku: string;
  supplierSku: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string;
  brand: string;
  description: string;
  synonyms: string[];
  attributes: AttributeMap;
  technicalSpecifications?: AttributeMap;
  unit: string;
  packageSize: number;
  stockProfile: StockProfile;
  retailUnitPrice: number;
  wholesaleDiscount?: number;
}

interface SeedProduct {
  product: CatalogProduct;
  retailUnitPrice: number;
  wholesaleDiscount: number;
}

export interface MockCatalogData {
  readonly products: readonly CatalogProduct[];
  readonly prices: readonly CatalogPriceRecord[];
}

export interface MockCatalogSummary {
  productCount: number;
  priceRecordCount: number;
  cities: string[];
  categories: string[];
  generatedAt: string;
}

const UPDATED_AT = "2026-09-20T08:00:00.000Z";
const PRICE_UPDATED_AT = "2026-09-20T08:15:00.000Z";
const DOCUMENT_UPDATED_AT = "2026-09-19T12:00:00.000Z";

export const MOCK_CATALOG_TIMESTAMP = UPDATED_AT;

const warehouses = [
  {
    warehouseId: "wh-almaty-central",
    warehouseName: "Алматы — Центральный склад",
    city: "Алматы"
  },
  {
    warehouseId: "wh-almaty-west",
    warehouseName: "Алматы — Западный склад",
    city: "Алматы"
  },
  {
    warehouseId: "wh-astana-north",
    warehouseName: "Астана — Северный склад",
    city: "Астана"
  },
  {
    warehouseId: "wh-shymkent",
    warehouseName: "Шымкент — Региональный склад",
    city: "Шымкент"
  },
  {
    warehouseId: "wh-karaganda",
    warehouseName: "Караганда — Региональный склад",
    city: "Караганда"
  }
] as const;

const priceCities = ["Алматы", "Астана", "Шымкент", "Караганда"] as const;

const cityPriceFactors: Record<(typeof priceCities)[number], number> = {
  Алматы: 1,
  Астана: 1.012,
  Шымкент: 1.006,
  Караганда: 1.018
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** FNV-1a, used only to distribute fixed seed quantities predictably. */
const stableHash = (value: string): number => {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
};

const makeWarehouseStock = (
  warehouseIndex: number,
  availableQuantity: number,
  reservedQuantity: number,
  deliveryDays: number
): CatalogWarehouseStock => {
  const warehouse = warehouses[warehouseIndex];

  if (!warehouse) {
    throw new RangeError(`Unknown mock warehouse index: ${warehouseIndex}`);
  }

  return {
    warehouseId: warehouse.warehouseId,
    warehouseName: warehouse.warehouseName,
    city: warehouse.city,
    availableQuantity,
    reservedQuantity,
    deliveryDays,
    updatedAt: UPDATED_AT
  };
};

const makeWarehouseStocks = (productId: string, profile: StockProfile): CatalogWarehouseStock[] => {
  const hash = stableHash(productId);

  switch (profile) {
    case "bulk":
      return [
        makeWarehouseStock(0, 180 + (hash % 420), 12 + (hash % 36), 0),
        makeWarehouseStock(1, 90 + ((hash >>> 5) % 250), 4 + ((hash >>> 9) % 22), 0),
        makeWarehouseStock(2, 65 + ((hash >>> 11) % 180), 3 + ((hash >>> 15) % 18), 1),
        makeWarehouseStock(3, 40 + ((hash >>> 17) % 130), 0, 2),
        makeWarehouseStock(4, 25 + ((hash >>> 19) % 90), 0, 2)
      ];
    case "limited":
      return [
        makeWarehouseStock(0, 2 + (hash % 5), hash % 2, 0),
        makeWarehouseStock(1, hash % 3, 0, 1),
        makeWarehouseStock(2, 1 + ((hash >>> 4) % 3), 0, 1),
        makeWarehouseStock(3, 0, 0, 3),
        makeWarehouseStock(4, (hash >>> 8) % 2, 0, 3)
      ];
    case "out":
      return warehouses.map((_, index) => makeWarehouseStock(index, 0, 0, 7));
    case "preorder":
      return warehouses.map((_, index) =>
        makeWarehouseStock(index, 0, 0, 14 + ((hash + index) % 8))
      );
    case "standard":
    default:
      return [
        makeWarehouseStock(0, 16 + (hash % 34), 1 + (hash % 5), 0),
        makeWarehouseStock(1, 6 + ((hash >>> 5) % 18), (hash >>> 9) % 3, 0),
        makeWarehouseStock(2, 7 + ((hash >>> 11) % 22), (hash >>> 15) % 3, 1),
        makeWarehouseStock(3, 4 + ((hash >>> 17) % 16), 0, 2),
        makeWarehouseStock(4, 2 + ((hash >>> 19) % 11), 0, 2)
      ];
  }
};

const availabilityFor = (
  warehouseStocks: CatalogWarehouseStock[],
  stockProfile: StockProfile
): "in_stock" | "low_stock" | "out_of_stock" | "on_order" => {
  if (stockProfile === "preorder") {
    return "on_order";
  }

  const total = warehouseStocks.reduce((sum, stock) => sum + stock.availableQuantity, 0);

  if (total === 0) {
    return "out_of_stock";
  }

  return total <= 12 ? "low_stock" : "in_stock";
};

const makeCertificates = (productId: string, category: string): CatalogCertificate[] => {
  const documentBaseUrl = `https://mock.ekt.kz/documents/${productId}`;

  return [
    {
      id: `mock-cert-${productId}-declaration`,
      name: `Демо-декларация соответствия: ${category}`,
      documentType: "declaration",
      url: `${documentBaseUrl}/declaration-of-conformity.pdf`,
      fileId: `mock-file-${productId}-declaration`,
      issuer: "EKT mock catalog — demo record",
      validFrom: "2025-01-01",
      validUntil: "2027-12-31",
      isOfficial: false,
      updatedAt: DOCUMENT_UPDATED_AT
    },
    {
      id: `mock-cert-${productId}-datasheet`,
      name: `Демо-технический паспорт: ${productId.toUpperCase()}`,
      documentType: "passport",
      url: `${documentBaseUrl}/datasheet.pdf`,
      fileId: `mock-file-${productId}-datasheet`,
      issuer: "EKT mock catalog — demo record",
      isOfficial: false,
      updatedAt: DOCUMENT_UPDATED_AT
    }
  ];
};

const makeProduct = (input: ProductSeedInput): SeedProduct => {
  const warehouseStocks = makeWarehouseStocks(input.id, input.stockProfile);
  const availabilityStatus = availabilityFor(warehouseStocks, input.stockProfile);

  return {
    product: {
      id: input.id,
      sku: input.sku,
      supplierSku: input.supplierSku,
      name: input.name,
      slug: input.slug,
      category: input.category,
      subcategory: input.subcategory,
      brand: input.brand,
      description: input.description,
      synonyms: input.synonyms,
      attributes: input.attributes,
      technicalSpecifications: input.technicalSpecifications ?? input.attributes,
      certificates: makeCertificates(input.id, input.category),
      unit: input.unit,
      packageSize: input.packageSize,
      currency: "KZT",
      warehouseStocks,
      availabilityStatus,
      orderable: availabilityStatus !== "out_of_stock",
      imageUrls: [
        `https://mock.ekt.kz/images/catalog/${input.slug}-main.webp`,
        `https://mock.ekt.kz/images/catalog/${input.slug}-detail.webp`
      ],
      productUrl: `https://mock.ekt.kz/catalog/${input.slug}`,
      relatedProductIds: [],
      updatedAt: UPDATED_AT,
      extensions: {
        dataSource: "mock",
        isDemoRecord: true,
        stockScope: "warehouse"
      }
    },
    retailUnitPrice: input.retailUnitPrice,
    wholesaleDiscount: input.wholesaleDiscount ?? 0.07
  };
};

interface McbDefinition {
  brand: string;
  series: string;
  poles: 1 | 2 | 3;
  ratedCurrentA: number;
  tripCurve: "B" | "C" | "D";
  breakingCapacityKA: number;
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeMcb = (definition: McbDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-mcb-${serial}`;
  const voltage = definition.poles === 1 ? 230 : 400;
  const brandCode = slugify(definition.brand).replace(/-/g, "").slice(0, 5);
  const seriesCode = slugify(definition.series).replace(/-/g, "").slice(0, 6);
  const slug = `mcb-${brandCode}-${seriesCode}-${definition.poles}p-${definition.tripCurve.toLowerCase()}${definition.ratedCurrentA}-${definition.breakingCapacityKA}ka`;

  return makeProduct({
    id,
    sku: `EKT-MCB-${serial}`,
    supplierSku: `MOCK-${brandCode.toUpperCase()}-${seriesCode.toUpperCase()}-${definition.poles}P-${definition.tripCurve}${definition.ratedCurrentA}-${definition.breakingCapacityKA}KA`,
    name: `Автоматический выключатель ${definition.brand} ${definition.series}, ${definition.poles}P ${definition.tripCurve}${definition.ratedCurrentA}, ${definition.breakingCapacityKA} кА`,
    slug,
    category: "Circuit breakers",
    subcategory: "Miniature circuit breakers",
    brand: definition.brand,
    description: `Модульный автомат ${definition.poles}P с характеристикой ${definition.tripCurve} и номинальным током ${definition.ratedCurrentA} А для защиты распределительных линий.`,
    synonyms: [
      "автомат",
      `автомат ${definition.poles}P ${definition.ratedCurrentA}A`,
      `автомат ${definition.tripCurve}${definition.ratedCurrentA}`,
      `${definition.poles} полюсті автомат ${definition.ratedCurrentA}А`,
      "автоматты ажыратқыш"
    ],
    attributes: {
      deviceType: "mcb",
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: voltage,
      tripCurve: definition.tripCurve,
      breakingCapacityKA: definition.breakingCapacityKA,
      mounting: "DIN-рейка 35 мм",
      moduleWidth: definition.poles,
      terminalConnection: "винтовой зажим",
      ipRating: "IP20"
    },
    technicalSpecifications: {
      deviceType: "mcb",
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: voltage,
      tripCurve: definition.tripCurve,
      breakingCapacityKA: definition.breakingCapacityKA,
      frequencyHz: 50,
      mounting: "DIN-рейка 35 мм",
      standards: ["IEC 60898-1", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const mcbs: SeedProduct[] = (
  [
    {
      brand: "IEK",
      series: "BA47-29",
      poles: 1,
      ratedCurrentA: 6,
      tripCurve: "C",
      breakingCapacityKA: 4.5,
      retailUnitPrice: 1_260,
      stockProfile: "limited"
    },
    {
      brand: "IEK",
      series: "BA47-29",
      poles: 1,
      ratedCurrentA: 10,
      tripCurve: "C",
      breakingCapacityKA: 4.5,
      retailUnitPrice: 1_290
    },
    {
      brand: "IEK",
      series: "BA47-29",
      poles: 1,
      ratedCurrentA: 16,
      tripCurve: "C",
      breakingCapacityKA: 4.5,
      retailUnitPrice: 1_320
    },
    {
      brand: "IEK",
      series: "BA47-29",
      poles: 1,
      ratedCurrentA: 25,
      tripCurve: "C",
      breakingCapacityKA: 4.5,
      retailUnitPrice: 1_390
    },
    {
      brand: "IEK",
      series: "BA47-29",
      poles: 1,
      ratedCurrentA: 32,
      tripCurve: "C",
      breakingCapacityKA: 4.5,
      retailUnitPrice: 1_450
    },
    {
      brand: "EKF",
      series: "PROxima",
      poles: 1,
      ratedCurrentA: 16,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 1_680
    },
    {
      brand: "EKF",
      series: "PROxima",
      poles: 1,
      ratedCurrentA: 25,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 1_760
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 1,
      ratedCurrentA: 16,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 2_890
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 1,
      ratedCurrentA: 25,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 3_020
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 1,
      ratedCurrentA: 32,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 3_090
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 1,
      ratedCurrentA: 40,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 3_240
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 3,
      ratedCurrentA: 25,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 8_890
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 3,
      ratedCurrentA: 32,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 9_120
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 3,
      ratedCurrentA: 50,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 10_690,
      stockProfile: "out"
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 3,
      ratedCurrentA: 63,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 11_450
    },
    {
      brand: "ABB",
      series: "SH203",
      poles: 3,
      ratedCurrentA: 16,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 13_690
    },
    {
      brand: "ABB",
      series: "SH203",
      poles: 3,
      ratedCurrentA: 25,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 14_290
    },
    {
      brand: "ABB",
      series: "SH203",
      poles: 3,
      ratedCurrentA: 32,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 14_860
    },
    {
      brand: "ABB",
      series: "SH203",
      poles: 3,
      ratedCurrentA: 50,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 16_090
    },
    {
      brand: "CHINT",
      series: "NB1-63",
      poles: 3,
      ratedCurrentA: 25,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 5_790
    },
    {
      brand: "CHINT",
      series: "NB1-63",
      poles: 3,
      ratedCurrentA: 32,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 5_980
    },
    {
      brand: "CHINT",
      series: "NB1-63",
      poles: 3,
      ratedCurrentA: 40,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 6_190
    },
    {
      brand: "CHINT",
      series: "NB1-63",
      poles: 3,
      ratedCurrentA: 50,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 6_490
    },
    {
      brand: "CHINT",
      series: "NB1-63",
      poles: 3,
      ratedCurrentA: 63,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 6_880,
      stockProfile: "limited"
    },
    {
      brand: "Legrand",
      series: "TX3",
      poles: 2,
      ratedCurrentA: 16,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 6_290
    },
    {
      brand: "Legrand",
      series: "TX3",
      poles: 2,
      ratedCurrentA: 25,
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 6_680
    }
  ] satisfies McbDefinition[]
).map(makeMcb);

interface RccbDefinition {
  brand: string;
  series: string;
  poles: 2 | 4;
  ratedCurrentA: number;
  residualCurrentMa: number;
  residualType: "AC" | "A";
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeRccb = (definition: RccbDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-rccb-${serial}`;
  const slug = `rccb-${slugify(definition.brand)}-${slugify(definition.series)}-${definition.poles}p-${definition.ratedCurrentA}a-${definition.residualCurrentMa}ma-${definition.residualType.toLowerCase()}`;

  return makeProduct({
    id,
    sku: `EKT-RCCB-${serial}`,
    supplierSku: `MOCK-RCCB-${serial}-${definition.poles}P-${definition.ratedCurrentA}A-${definition.residualCurrentMa}MA-${definition.residualType}`,
    name: `УЗО ${definition.brand} ${definition.series}, ${definition.poles}P ${definition.ratedCurrentA} А / ${definition.residualCurrentMa} мА, тип ${definition.residualType}`,
    slug,
    category: "RCD",
    subcategory: "RCCB",
    brand: definition.brand,
    description: `Устройство защитного отключения ${definition.poles}P для сетей ${definition.poles === 2 ? "230" : "400"} В с током утечки ${definition.residualCurrentMa} мА, тип ${definition.residualType}.`,
    synonyms: [
      "узо",
      `узо ${definition.ratedCurrentA}а ${definition.residualCurrentMa}ма`,
      `rccb ${definition.poles}p`,
      "қорғаныс ажыратқыш",
      "дифференциалды ажыратқыш"
    ],
    attributes: {
      deviceType: "rccb",
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: definition.poles === 2 ? 230 : 400,
      residualCurrentMa: definition.residualCurrentMa,
      sensitivityMA: definition.residualCurrentMa,
      residualType: definition.residualType,
      shortCircuitCapacityKA: 6,
      mounting: "DIN-рейка 35 мм",
      moduleWidth: definition.poles === 2 ? 2 : 4,
      ipRating: "IP20"
    },
    technicalSpecifications: {
      deviceType: "rccb",
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      residualCurrentMa: definition.residualCurrentMa,
      sensitivityMA: definition.residualCurrentMa,
      residualType: definition.residualType,
      ratedVoltageV: definition.poles === 2 ? 230 : 400,
      frequencyHz: 50,
      mounting: "DIN-рейка 35 мм",
      standards: ["IEC 61008-1", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const rccbs: SeedProduct[] = (
  [
    {
      brand: "IEK",
      series: "VD1-63",
      poles: 2,
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "AC",
      retailUnitPrice: 6_240
    },
    {
      brand: "IEK",
      series: "VD1-63",
      poles: 2,
      ratedCurrentA: 40,
      residualCurrentMa: 30,
      residualType: "AC",
      retailUnitPrice: 6_790
    },
    {
      brand: "IEK",
      series: "VD1-63",
      poles: 2,
      ratedCurrentA: 63,
      residualCurrentMa: 30,
      residualType: "A",
      retailUnitPrice: 8_240
    },
    {
      brand: "EKF",
      series: "PROxima",
      poles: 2,
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "AC",
      retailUnitPrice: 6_480
    },
    {
      brand: "EKF",
      series: "PROxima",
      poles: 2,
      ratedCurrentA: 40,
      residualCurrentMa: 30,
      residualType: "A",
      retailUnitPrice: 8_390
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 2,
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "AC",
      retailUnitPrice: 10_490
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 2,
      ratedCurrentA: 40,
      residualCurrentMa: 30,
      residualType: "A",
      retailUnitPrice: 13_690
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: 4,
      ratedCurrentA: 40,
      residualCurrentMa: 30,
      residualType: "A",
      retailUnitPrice: 22_590
    },
    {
      brand: "ABB",
      series: "F202",
      poles: 2,
      ratedCurrentA: 40,
      residualCurrentMa: 30,
      residualType: "A",
      retailUnitPrice: 19_890
    },
    {
      brand: "ABB",
      series: "F204",
      poles: 4,
      ratedCurrentA: 63,
      residualCurrentMa: 30,
      residualType: "A",
      retailUnitPrice: 37_490,
      stockProfile: "limited"
    },
    {
      brand: "CHINT",
      series: "NL1-63",
      poles: 2,
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "AC",
      retailUnitPrice: 5_980
    },
    {
      brand: "CHINT",
      series: "NL1-63",
      poles: 2,
      ratedCurrentA: 63,
      residualCurrentMa: 30,
      residualType: "A",
      retailUnitPrice: 8_760
    },
    {
      brand: "Legrand",
      series: "RX3",
      poles: 4,
      ratedCurrentA: 40,
      residualCurrentMa: 100,
      residualType: "AC",
      retailUnitPrice: 20_690
    },
    {
      brand: "Legrand",
      series: "RX3",
      poles: 4,
      ratedCurrentA: 63,
      residualCurrentMa: 300,
      residualType: "A",
      retailUnitPrice: 24_980,
      stockProfile: "preorder"
    }
  ] satisfies RccbDefinition[]
).map(makeRccb);

interface RcboDefinition {
  brand: string;
  series: string;
  poles: "1P+N" | "2P";
  ratedCurrentA: number;
  residualCurrentMa: number;
  residualType: "AC" | "A";
  tripCurve: "B" | "C";
  breakingCapacityKA: number;
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeRcbo = (definition: RcboDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-rcbo-${serial}`;
  const slug = `rcbo-${slugify(definition.brand)}-${slugify(definition.series)}-${definition.poles.toLowerCase().replace("+", "-")}-${definition.tripCurve.toLowerCase()}${definition.ratedCurrentA}-${definition.residualCurrentMa}ma`;

  return makeProduct({
    id,
    sku: `EKT-RCBO-${serial}`,
    supplierSku: `MOCK-RCBO-${serial}-${definition.poles}-${definition.tripCurve}${definition.ratedCurrentA}-${definition.residualCurrentMa}MA-${definition.residualType}`,
    name: `Дифференциальный автомат ${definition.brand} ${definition.series}, ${definition.poles} ${definition.tripCurve}${definition.ratedCurrentA}, ${definition.residualCurrentMa} мА, тип ${definition.residualType}`,
    slug,
    category: "RCD",
    subcategory: "RCBO",
    brand: definition.brand,
    description: `Дифференциальный автомат ${definition.poles} объединяет защиту от перегрузки и токов утечки ${definition.residualCurrentMa} мА для однофазной линии 230 В.`,
    synonyms: [
      "дифавтомат",
      "дифференциальный автомат",
      `rcbo ${definition.ratedCurrentA}a`,
      `диф автомат ${definition.tripCurve}${definition.ratedCurrentA}`,
      "дифференциалды автомат"
    ],
    attributes: {
      deviceType: "rcbo",
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: 230,
      residualCurrentMa: definition.residualCurrentMa,
      sensitivityMA: definition.residualCurrentMa,
      residualType: definition.residualType,
      tripCurve: definition.tripCurve,
      breakingCapacityKA: definition.breakingCapacityKA,
      mounting: "DIN-рейка 35 мм",
      moduleWidth: definition.poles === "1P+N" ? 2 : 2,
      ipRating: "IP20"
    },
    technicalSpecifications: {
      deviceType: "rcbo",
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      residualCurrentMa: definition.residualCurrentMa,
      sensitivityMA: definition.residualCurrentMa,
      residualType: definition.residualType,
      tripCurve: definition.tripCurve,
      breakingCapacityKA: definition.breakingCapacityKA,
      ratedVoltageV: 230,
      standards: ["IEC 61009-1", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const rcbos: SeedProduct[] = (
  [
    {
      brand: "IEK",
      series: "AD12",
      poles: "1P+N",
      ratedCurrentA: 10,
      residualCurrentMa: 30,
      residualType: "AC",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 7_690
    },
    {
      brand: "IEK",
      series: "AD12",
      poles: "1P+N",
      ratedCurrentA: 16,
      residualCurrentMa: 30,
      residualType: "AC",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 7_890
    },
    {
      brand: "IEK",
      series: "AD12",
      poles: "1P+N",
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "A",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 9_490
    },
    {
      brand: "EKF",
      series: "PROxima",
      poles: "1P+N",
      ratedCurrentA: 16,
      residualCurrentMa: 30,
      residualType: "AC",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 8_190
    },
    {
      brand: "EKF",
      series: "PROxima",
      poles: "1P+N",
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "A",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 10_290
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: "1P+N",
      ratedCurrentA: 10,
      residualCurrentMa: 30,
      residualType: "AC",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 13_490
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: "1P+N",
      ratedCurrentA: 16,
      residualCurrentMa: 30,
      residualType: "A",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 15_690
    },
    {
      brand: "Schneider Electric",
      series: "Easy9",
      poles: "1P+N",
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "A",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 16_990,
      stockProfile: "limited"
    },
    {
      brand: "ABB",
      series: "DS201",
      poles: "1P+N",
      ratedCurrentA: 16,
      residualCurrentMa: 30,
      residualType: "A",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 23_490
    },
    {
      brand: "ABB",
      series: "DS201",
      poles: "1P+N",
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "A",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 24_690
    },
    {
      brand: "CHINT",
      series: "NXBLE-63",
      poles: "1P+N",
      ratedCurrentA: 16,
      residualCurrentMa: 30,
      residualType: "AC",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 7_480
    },
    {
      brand: "CHINT",
      series: "NXBLE-63",
      poles: "1P+N",
      ratedCurrentA: 25,
      residualCurrentMa: 30,
      residualType: "A",
      tripCurve: "C",
      breakingCapacityKA: 6,
      retailUnitPrice: 9_190
    }
  ] satisfies RcboDefinition[]
).map(makeRcbo);

interface ContactorDefinition {
  brand: string;
  series: string;
  ratedCurrentA: number;
  coilVoltageV: 24 | 220 | 380;
  auxiliaryContacts: string;
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeContactor = (definition: ContactorDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-contactor-${serial}`;
  const slug = `contactor-${slugify(definition.brand)}-${slugify(definition.series)}-${definition.ratedCurrentA}a-coil-${definition.coilVoltageV}v`;

  return makeProduct({
    id,
    sku: `EKT-KM-${serial}`,
    supplierSku: `MOCK-KM-${serial}-3P-${definition.ratedCurrentA}A-${definition.coilVoltageV}V`,
    name: `Контактор ${definition.brand} ${definition.series}, 3P ${definition.ratedCurrentA} А, катушка ${definition.coilVoltageV} В`,
    slug,
    category: "Contactors",
    subcategory: "Power contactors",
    brand: definition.brand,
    description: `Трехполюсный контактор для коммутации силовых цепей до ${definition.ratedCurrentA} А; напряжение катушки управления ${definition.coilVoltageV} В.`,
    synonyms: [
      "контактор",
      `магнитный пускатель ${definition.ratedCurrentA}а`,
      `контактор ${definition.coilVoltageV}в`,
      "магнитті іске қосқыш",
      "қуат контакторы"
    ],
    attributes: {
      deviceType: "contactor",
      poles: 3,
      ratedCurrentA: definition.ratedCurrentA,
      operationalVoltageV: 400,
      coilVoltageV: definition.coilVoltageV,
      auxiliaryContacts: definition.auxiliaryContacts,
      contactConfiguration: definition.auxiliaryContacts,
      mounting: "DIN-рейка или монтажная плата",
      utilizationCategory: "AC-3",
      ipRating: "IP20"
    },
    technicalSpecifications: {
      deviceType: "contactor",
      poles: 3,
      ratedCurrentA: definition.ratedCurrentA,
      operationalVoltageV: 400,
      coilVoltageV: definition.coilVoltageV,
      auxiliaryContacts: definition.auxiliaryContacts,
      contactConfiguration: definition.auxiliaryContacts,
      utilizationCategory: "AC-3",
      frequencyHz: 50,
      standards: ["IEC 60947-4-1", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const contactors: SeedProduct[] = (
  [
    {
      brand: "IEK",
      series: "KMI",
      ratedCurrentA: 9,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO",
      retailUnitPrice: 5_690
    },
    {
      brand: "IEK",
      series: "KMI",
      ratedCurrentA: 12,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO",
      retailUnitPrice: 6_190
    },
    {
      brand: "IEK",
      series: "KMI",
      ratedCurrentA: 18,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO",
      retailUnitPrice: 7_480
    },
    {
      brand: "IEK",
      series: "KMI",
      ratedCurrentA: 25,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO+1NC",
      retailUnitPrice: 9_890
    },
    {
      brand: "EKF",
      series: "PROxima",
      ratedCurrentA: 9,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO",
      retailUnitPrice: 5_390
    },
    {
      brand: "EKF",
      series: "PROxima",
      ratedCurrentA: 18,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO+1NC",
      retailUnitPrice: 7_690
    },
    {
      brand: "Schneider Electric",
      series: "TeSys D",
      ratedCurrentA: 9,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO+1NC",
      retailUnitPrice: 17_490
    },
    {
      brand: "Schneider Electric",
      series: "TeSys D",
      ratedCurrentA: 18,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO+1NC",
      retailUnitPrice: 23_890
    },
    {
      brand: "Schneider Electric",
      series: "TeSys D",
      ratedCurrentA: 25,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO+1NC",
      retailUnitPrice: 28_990
    },
    {
      brand: "CHINT",
      series: "NC1",
      ratedCurrentA: 12,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO",
      retailUnitPrice: 5_180
    },
    {
      brand: "CHINT",
      series: "NC1",
      ratedCurrentA: 25,
      coilVoltageV: 220,
      auxiliaryContacts: "1NO+1NC",
      retailUnitPrice: 8_690
    },
    {
      brand: "CHINT",
      series: "NC1",
      ratedCurrentA: 40,
      coilVoltageV: 380,
      auxiliaryContacts: "1NO+1NC",
      retailUnitPrice: 14_790,
      stockProfile: "limited"
    }
  ] satisfies ContactorDefinition[]
).map(makeContactor);

interface ControlRelayDefinition {
  kind: "thermal_relay" | "time_relay";
  brand: string;
  series: string;
  nameSuffix: string;
  attributes: AttributeMap;
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeControlRelay = (definition: ControlRelayDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-${definition.kind}-${serial}`;
  const label = definition.kind === "thermal_relay" ? "Тепловое реле" : "Реле времени";
  const slug = `${definition.kind.replace("_", "-")}-${slugify(definition.brand)}-${slugify(definition.series)}-${serial}`;

  return makeProduct({
    id,
    sku: `EKT-${definition.kind === "thermal_relay" ? "TR" : "TIME"}-${serial}`,
    supplierSku: `MOCK-${definition.kind.toUpperCase()}-${serial}`,
    name: `${label} ${definition.brand} ${definition.series}, ${definition.nameSuffix}`,
    slug,
    category: "Relays",
    subcategory: definition.kind === "thermal_relay" ? "Thermal relays" : "Time relays",
    brand: definition.brand,
    description:
      definition.kind === "thermal_relay"
        ? `Тепловое реле ${definition.series} для защиты электродвигателя от перегрузки; диапазон настройки указан в характеристиках.`
        : `Многофункциональное реле времени ${definition.series} для автоматизации цепей управления.`,
    synonyms:
      definition.kind === "thermal_relay"
        ? ["тепловое реле", "реле перегрузки", "жылу релесі"]
        : ["реле времени", "таймер DIN", "уақыт релесі"],
    attributes: {
      deviceType: definition.kind,
      mounting: "DIN-рейка или прямое присоединение к контактору",
      ...definition.attributes
    },
    technicalSpecifications: {
      deviceType: definition.kind,
      mounting: "DIN-рейка или прямое присоединение к контактору",
      ...definition.attributes,
      standards: ["IEC 60947", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const controlRelayDefinitions: ControlRelayDefinition[] = [
  {
    kind: "thermal_relay",
    brand: "IEK",
    series: "RTT-1312",
    nameSuffix: "диапазон 7–10 А",
    attributes: {
      currentRangeA: "7-10",
      compatibleContactorSeries: "IEK KMI 9-12 A",
      resetMode: "ручной/автоматический",
      tripClass: "10A"
    },
    retailUnitPrice: 4_290
  },
  {
    kind: "thermal_relay",
    brand: "IEK",
    series: "RTT-1316",
    nameSuffix: "диапазон 9–13 А",
    attributes: {
      currentRangeA: "9-13",
      compatibleContactorSeries: "IEK KMI 12-18 A",
      resetMode: "ручной/автоматический",
      tripClass: "10A"
    },
    retailUnitPrice: 4_690
  },
  {
    kind: "thermal_relay",
    brand: "Schneider Electric",
    series: "LRD14",
    nameSuffix: "диапазон 7–10 А",
    attributes: {
      currentRangeA: "7-10",
      compatibleContactorSeries: "Schneider TeSys D 9-18 A",
      resetMode: "ручной/автоматический",
      tripClass: "10A"
    },
    retailUnitPrice: 13_890
  },
  {
    kind: "thermal_relay",
    brand: "CHINT",
    series: "NXR-25",
    nameSuffix: "диапазон 17–25 А",
    attributes: {
      currentRangeA: "17-25",
      compatibleContactorSeries: "CHINT NC1 25 A",
      resetMode: "ручной/автоматический",
      tripClass: "10A"
    },
    retailUnitPrice: 4_980,
    stockProfile: "limited"
  },
  {
    kind: "time_relay",
    brand: "IEK",
    series: "ORBIS-01",
    nameSuffix: "0,1 с – 100 ч, 220 В",
    attributes: {
      supplyVoltageV: 220,
      timeRange: "0.1 s - 100 h",
      outputContacts: "1CO, 8 A",
      functions: ["задержка включения", "импульс"]
    },
    retailUnitPrice: 6_790
  },
  {
    kind: "time_relay",
    brand: "EKF",
    series: "PROxima RV-01",
    nameSuffix: "0,1 с – 10 ч, 220 В",
    attributes: {
      supplyVoltageV: 220,
      timeRange: "0.1 s - 10 h",
      outputContacts: "1CO, 8 A",
      functions: ["задержка включения", "циклический режим"]
    },
    retailUnitPrice: 7_190
  },
  {
    kind: "time_relay",
    brand: "Schneider Electric",
    series: "Zelio RE17",
    nameSuffix: "0,1 с – 100 ч, 24–240 В AC/DC",
    attributes: {
      supplyVoltageV: "24-240 AC/DC",
      timeRange: "0.1 s - 100 h",
      outputContacts: "1CO, 8 A",
      functions: ["задержка включения", "импульс", "циклический режим"]
    },
    retailUnitPrice: 24_890
  },
  {
    kind: "time_relay",
    brand: "Novatek-Electro",
    series: "REV-114",
    nameSuffix: "0,1 с – 10 ч, 230 В",
    attributes: {
      supplyVoltageV: 230,
      timeRange: "0.1 s - 10 h",
      outputContacts: "1NO, 16 A",
      functions: ["задержка отключения", "задержка включения"]
    },
    retailUnitPrice: 8_490
  }
];

const controlRelays: SeedProduct[] = controlRelayDefinitions.map(makeControlRelay);

interface CableDefinition {
  brand: string;
  marking: string;
  cores: number;
  crossSectionMm2: number;
  conductorClass: string;
  sheath: string;
  fireSafety: string;
  voltageV: number;
  retailUnitPrice: number;
  packageSize?: number;
  stockProfile?: StockProfile;
}

const makeCable = (definition: CableDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-cable-${serial}`;
  const size = `${definition.cores}x${definition.crossSectionMm2}`;
  const slug = `cable-${slugify(definition.marking)}-${size.replace("x", "x")}-${serial}`;

  return makeProduct({
    id,
    sku: `EKT-CBL-${serial}`,
    supplierSku: `MOCK-CBL-${slugify(definition.marking).toUpperCase()}-${definition.cores}X${String(definition.crossSectionMm2).replace(".", "P")}`,
    name: `Кабель ${definition.brand} ${definition.marking} ${size} мм²`,
    slug,
    category: "Cables",
    subcategory: definition.marking.startsWith("ПВ") ? "Installation wire" : "Power cables",
    brand: definition.brand,
    description: `Медный ${definition.cores}-жильный кабель ${definition.marking} с сечением ${definition.crossSectionMm2} мм² для стационарной или гибкой прокладки согласно маркировке. Цена указана за метр.`,
    synonyms: [
      "кабель",
      definition.marking.toLowerCase(),
      `${definition.marking} ${size}`,
      `сым ${definition.cores}x${definition.crossSectionMm2}`,
      "электр сымы"
    ],
    attributes: {
      deviceType: "cable",
      cableMarking: definition.marking,
      cores: definition.cores,
      coreCount: definition.cores,
      crossSectionMm2: definition.crossSectionMm2,
      conductorMaterial: "медь",
      conductorClass: definition.conductorClass,
      insulationMaterial: definition.sheath,
      fireSafety: definition.fireSafety,
      ratedVoltageV: definition.voltageV,
      voltageRatingV: definition.voltageV,
      saleUnit: "метр"
    },
    technicalSpecifications: {
      deviceType: "cable",
      cableMarking: definition.marking,
      cores: definition.cores,
      coreCount: definition.cores,
      crossSectionMm2: definition.crossSectionMm2,
      conductorMaterial: "медь",
      conductorClass: definition.conductorClass,
      insulationMaterial: definition.sheath,
      fireSafety: definition.fireSafety,
      ratedVoltageV: definition.voltageV,
      voltageRatingV: definition.voltageV,
      operatingTemperatureC: "-50…+50",
      standards: ["ГОСТ 31996", "ТР ТС 004/2011"]
    },
    unit: "м",
    packageSize: definition.packageSize ?? 100,
    stockProfile: definition.stockProfile ?? "bulk",
    retailUnitPrice: definition.retailUnitPrice,
    wholesaleDiscount: 0.1
  });
};

const cables: SeedProduct[] = (
  [
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 3,
      crossSectionMm2: 1.5,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 438
    },
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 3,
      crossSectionMm2: 2.5,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 690
    },
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 3,
      crossSectionMm2: 4,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 1_090
    },
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 3,
      crossSectionMm2: 6,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 1_670
    },
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 4,
      crossSectionMm2: 10,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 4_670
    },
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 5,
      crossSectionMm2: 6,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 3_490
    },
    {
      brand: "Rexant",
      marking: "NYM-J",
      cores: 3,
      crossSectionMm2: 1.5,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "низкое дымо- и газовыделение",
      voltageV: 660,
      retailUnitPrice: 590
    },
    {
      brand: "Rexant",
      marking: "NYM-J",
      cores: 3,
      crossSectionMm2: 2.5,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "низкое дымо- и газовыделение",
      voltageV: 660,
      retailUnitPrice: 890
    },
    {
      brand: "Rexant",
      marking: "NYM-J",
      cores: 5,
      crossSectionMm2: 2.5,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "низкое дымо- и газовыделение",
      voltageV: 660,
      retailUnitPrice: 1_490
    },
    {
      brand: "Кабельный завод",
      marking: "ПВ-3",
      cores: 1,
      crossSectionMm2: 1.5,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "обычный",
      voltageV: 450,
      retailUnitPrice: 178,
      packageSize: 100
    },
    {
      brand: "Кабельный завод",
      marking: "ПВ-3",
      cores: 1,
      crossSectionMm2: 2.5,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "обычный",
      voltageV: 450,
      retailUnitPrice: 278,
      packageSize: 100
    },
    {
      brand: "Кабельный завод",
      marking: "ПВ-3",
      cores: 1,
      crossSectionMm2: 4,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "обычный",
      voltageV: 450,
      retailUnitPrice: 438,
      packageSize: 100
    },
    {
      brand: "Кабельный завод",
      marking: "ПВ-3",
      cores: 1,
      crossSectionMm2: 6,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "обычный",
      voltageV: 450,
      retailUnitPrice: 670,
      packageSize: 100
    },
    {
      brand: "Кабельный завод",
      marking: "ПВ-3",
      cores: 1,
      crossSectionMm2: 10,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "обычный",
      voltageV: 450,
      retailUnitPrice: 1_120,
      packageSize: 100
    },
    {
      brand: "Кабельный завод",
      marking: "КГ",
      cores: 3,
      crossSectionMm2: 1.5,
      conductorClass: "5",
      sheath: "резина",
      fireSafety: "гибкий кабель",
      voltageV: 660,
      retailUnitPrice: 620
    },
    {
      brand: "Кабельный завод",
      marking: "КГ",
      cores: 3,
      crossSectionMm2: 2.5,
      conductorClass: "5",
      sheath: "резина",
      fireSafety: "гибкий кабель",
      voltageV: 660,
      retailUnitPrice: 960
    },
    {
      brand: "Кабельный завод",
      marking: "КГ",
      cores: 3,
      crossSectionMm2: 4,
      conductorClass: "5",
      sheath: "резина",
      fireSafety: "гибкий кабель",
      voltageV: 660,
      retailUnitPrice: 1_390
    },
    {
      brand: "Кабельный завод",
      marking: "КГ",
      cores: 5,
      crossSectionMm2: 4,
      conductorClass: "5",
      sheath: "резина",
      fireSafety: "гибкий кабель",
      voltageV: 660,
      retailUnitPrice: 2_240
    },
    {
      brand: "Rexant",
      marking: "ПВС",
      cores: 2,
      crossSectionMm2: 0.75,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "гибкий провод",
      voltageV: 380,
      retailUnitPrice: 196
    },
    {
      brand: "Rexant",
      marking: "ПВС",
      cores: 2,
      crossSectionMm2: 1.5,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "гибкий провод",
      voltageV: 380,
      retailUnitPrice: 330
    },
    {
      brand: "Rexant",
      marking: "ПВС",
      cores: 3,
      crossSectionMm2: 1.5,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "гибкий провод",
      voltageV: 380,
      retailUnitPrice: 488
    },
    {
      brand: "Rexant",
      marking: "ПВС",
      cores: 3,
      crossSectionMm2: 2.5,
      conductorClass: "5",
      sheath: "ПВХ",
      fireSafety: "гибкий провод",
      voltageV: 380,
      retailUnitPrice: 770
    },
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 5,
      crossSectionMm2: 10,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 6_240,
      stockProfile: "limited"
    },
    {
      brand: "Кабельный завод",
      marking: "ВВГнг(А)-LS",
      cores: 4,
      crossSectionMm2: 16,
      conductorClass: "1",
      sheath: "ПВХ",
      fireSafety: "нг(А)-LS",
      voltageV: 660,
      retailUnitPrice: 7_460,
      stockProfile: "preorder"
    }
  ] satisfies CableDefinition[]
).map(makeCable);

interface EnclosureDefinition {
  brand: string;
  series: string;
  kind: "distribution_board" | "junction_box";
  moduleCapacity?: number;
  dimensions?: string;
  material: string;
  ipRating: string;
  installation: "встраиваемый" | "навесной" | "наружный";
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeEnclosure = (definition: EnclosureDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-enclosure-${serial}`;
  const capacity = definition.moduleCapacity
    ? `${definition.moduleCapacity} мод.`
    : (definition.dimensions ?? "компактный");
  const productKind =
    definition.kind === "distribution_board" ? "Щит распределительный" : "Коробка монтажная";
  const slug = `${definition.kind.replace("_", "-")}-${slugify(definition.brand)}-${slugify(definition.series)}-${serial}`;

  return makeProduct({
    id,
    sku: `EKT-ENC-${serial}`,
    supplierSku: `MOCK-ENC-${serial}-${definition.moduleCapacity ?? "BOX"}-${definition.ipRating}`,
    name: `${productKind} ${definition.brand} ${definition.series}, ${capacity}, ${definition.ipRating}`,
    slug,
    category: "Enclosures",
    subcategory:
      definition.kind === "distribution_board" ? "Distribution enclosures" : "Junction boxes",
    brand: definition.brand,
    description: `${productKind.toLowerCase()} из материала «${definition.material}» для ${definition.installation} установки, степень защиты ${definition.ipRating}.`,
    synonyms:
      definition.kind === "distribution_board"
        ? [
            "электрощит",
            `щит ${definition.moduleCapacity ?? ""} модулей`.trim(),
            "тарату қалқаны",
            "модульный щит"
          ]
        : ["монтажная коробка", "распаячная коробка", "монтаж қорабы"],
    attributes: {
      deviceType: definition.kind,
      moduleCapacity: definition.moduleCapacity ?? 0,
      moduleCount: definition.moduleCapacity ?? 0,
      dimensions: definition.dimensions ?? "по серии",
      material: definition.material,
      ipRating: definition.ipRating,
      installation: definition.installation,
      doorType: definition.kind === "distribution_board" ? "прозрачная/непрозрачная" : "крышка"
    },
    technicalSpecifications: {
      deviceType: definition.kind,
      moduleCapacity: definition.moduleCapacity ?? 0,
      moduleCount: definition.moduleCapacity ?? 0,
      dimensions: definition.dimensions ?? "по серии",
      material: definition.material,
      ipRating: definition.ipRating,
      installation: definition.installation,
      operatingTemperatureC: "-25…+60",
      standards: ["IEC 60670", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const enclosures: SeedProduct[] = (
  [
    {
      brand: "IEK",
      series: "MKM14",
      kind: "distribution_board",
      moduleCapacity: 12,
      material: "пластик",
      ipRating: "IP41",
      installation: "встраиваемый",
      retailUnitPrice: 5_890
    },
    {
      brand: "IEK",
      series: "MKM14",
      kind: "distribution_board",
      moduleCapacity: 24,
      material: "пластик",
      ipRating: "IP41",
      installation: "встраиваемый",
      retailUnitPrice: 8_790
    },
    {
      brand: "IEK",
      series: "MKM14",
      kind: "distribution_board",
      moduleCapacity: 36,
      material: "пластик",
      ipRating: "IP41",
      installation: "встраиваемый",
      retailUnitPrice: 12_490
    },
    {
      brand: "Schneider Electric",
      series: "Easy9 Box",
      kind: "distribution_board",
      moduleCapacity: 12,
      material: "пластик",
      ipRating: "IP40",
      installation: "навесной",
      retailUnitPrice: 11_490
    },
    {
      brand: "Schneider Electric",
      series: "Easy9 Box",
      kind: "distribution_board",
      moduleCapacity: 24,
      material: "пластик",
      ipRating: "IP40",
      installation: "навесной",
      retailUnitPrice: 17_890
    },
    {
      brand: "Schneider Electric",
      series: "Pragma",
      kind: "distribution_board",
      moduleCapacity: 36,
      material: "пластик",
      ipRating: "IP40",
      installation: "навесной",
      retailUnitPrice: 29_690
    },
    {
      brand: "EKF",
      series: "PROxima ЩМП",
      kind: "distribution_board",
      moduleCapacity: 24,
      dimensions: "400x300x120 мм",
      material: "сталь",
      ipRating: "IP54",
      installation: "навесной",
      retailUnitPrice: 22_490
    },
    {
      brand: "EKF",
      series: "PROxima ЩМП",
      kind: "distribution_board",
      moduleCapacity: 36,
      dimensions: "500x400x150 мм",
      material: "сталь",
      ipRating: "IP54",
      installation: "навесной",
      retailUnitPrice: 34_890
    },
    {
      brand: "IEK",
      series: "ЩМП",
      kind: "distribution_board",
      moduleCapacity: 54,
      dimensions: "600x500x200 мм",
      material: "сталь",
      ipRating: "IP54",
      installation: "навесной",
      retailUnitPrice: 49_990,
      stockProfile: "limited"
    },
    {
      brand: "TDM Electric",
      series: "SQ1401",
      kind: "junction_box",
      dimensions: "100x100x50 мм",
      material: "ABS-пластик",
      ipRating: "IP54",
      installation: "наружный",
      retailUnitPrice: 1_190
    },
    {
      brand: "TDM Electric",
      series: "SQ1401",
      kind: "junction_box",
      dimensions: "150x110x70 мм",
      material: "ABS-пластик",
      ipRating: "IP54",
      installation: "наружный",
      retailUnitPrice: 1_790
    },
    {
      brand: "IEK",
      series: "KMPn",
      kind: "junction_box",
      dimensions: "100x100x50 мм",
      material: "полипропилен",
      ipRating: "IP55",
      installation: "наружный",
      retailUnitPrice: 1_320
    },
    {
      brand: "IEK",
      series: "KMPn",
      kind: "junction_box",
      dimensions: "200x150x80 мм",
      material: "полипропилен",
      ipRating: "IP55",
      installation: "наружный",
      retailUnitPrice: 2_490
    },
    {
      brand: "Schneider Electric",
      series: "Kaedra",
      kind: "distribution_board",
      moduleCapacity: 12,
      material: "поликарбонат",
      ipRating: "IP65",
      installation: "навесной",
      retailUnitPrice: 36_890,
      stockProfile: "preorder"
    },
    {
      brand: "Legrand",
      series: "Plexo3",
      kind: "distribution_board",
      moduleCapacity: 18,
      material: "полистирол",
      ipRating: "IP65",
      installation: "навесной",
      retailUnitPrice: 32_490
    }
  ] satisfies EnclosureDefinition[]
).map(makeEnclosure);

interface LightingDefinition {
  brand: string;
  series: string;
  kind: "panel" | "floodlight" | "linear" | "emergency";
  powerW: number;
  luminousFluxLm: number;
  colorTemperatureK: number;
  ipRating: string;
  mounting: string;
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeLighting = (definition: LightingDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-light-${serial}`;
  const kindLabel: Record<LightingDefinition["kind"], string> = {
    panel: "Светильник LED-панель",
    floodlight: "Прожектор светодиодный",
    linear: "Линейный светильник",
    emergency: "Светильник аварийный"
  };
  const slug = `light-${definition.kind}-${slugify(definition.brand)}-${slugify(definition.series)}-${definition.powerW}w-${serial}`;

  return makeProduct({
    id,
    sku: `EKT-LGT-${serial}`,
    supplierSku: `MOCK-LGT-${definition.kind.toUpperCase()}-${definition.powerW}W-${definition.colorTemperatureK}K-${serial}`,
    name: `${kindLabel[definition.kind]} ${definition.brand} ${definition.series}, ${definition.powerW} Вт, ${definition.colorTemperatureK} K, ${definition.ipRating}`,
    slug,
    category: "Lighting",
    subcategory:
      definition.kind === "floodlight"
        ? "Прожекторы"
        : definition.kind === "emergency"
          ? "Аварийное освещение"
          : "Светодиодные светильники",
    brand: definition.brand,
    description: `Светодиодный светильник мощностью ${definition.powerW} Вт, световой поток ${definition.luminousFluxLm} лм, цветовая температура ${definition.colorTemperatureK} K.`,
    synonyms: [
      "светильник",
      "лед светильник",
      `led ${definition.powerW}вт`,
      "жарықдиодты шам",
      definition.kind === "floodlight" ? "прожектор" : "жарықтандырғыш"
    ],
    attributes: {
      deviceType: `led_${definition.kind}`,
      powerW: definition.powerW,
      luminousFluxLm: definition.luminousFluxLm,
      colorTemperatureK: definition.colorTemperatureK,
      ratedVoltageV: 230,
      ipRating: definition.ipRating,
      mounting: definition.mounting,
      colorRenderingIndex: ">80"
    },
    technicalSpecifications: {
      deviceType: `led_${definition.kind}`,
      powerW: definition.powerW,
      luminousFluxLm: definition.luminousFluxLm,
      colorTemperatureK: definition.colorTemperatureK,
      ratedVoltageV: 230,
      frequencyHz: 50,
      ipRating: definition.ipRating,
      mounting: definition.mounting,
      serviceLifeHours: 30000,
      standards: ["ТР ТС 004/2011", "ТР ТС 020/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const lighting: SeedProduct[] = (
  [
    {
      brand: "IEK",
      series: "ДВО 595x595",
      kind: "panel",
      powerW: 36,
      luminousFluxLm: 3600,
      colorTemperatureK: 4000,
      ipRating: "IP20",
      mounting: "встраиваемый в потолок Армстронг",
      retailUnitPrice: 7_890
    },
    {
      brand: "IEK",
      series: "ДВО 595x595",
      kind: "panel",
      powerW: 40,
      luminousFluxLm: 4000,
      colorTemperatureK: 6500,
      ipRating: "IP20",
      mounting: "встраиваемый в потолок Армстронг",
      retailUnitPrice: 8_190
    },
    {
      brand: "EKF",
      series: "PROxima Office",
      kind: "panel",
      powerW: 36,
      luminousFluxLm: 3600,
      colorTemperatureK: 4000,
      ipRating: "IP20",
      mounting: "встраиваемый в потолок Армстронг",
      retailUnitPrice: 7_490
    },
    {
      brand: "Schneider Electric",
      series: "Thorsman LED",
      kind: "panel",
      powerW: 40,
      luminousFluxLm: 4200,
      colorTemperatureK: 4000,
      ipRating: "IP20",
      mounting: "накладной или встраиваемый",
      retailUnitPrice: 17_490
    },
    {
      brand: "IEK",
      series: "СДО",
      kind: "floodlight",
      powerW: 30,
      luminousFluxLm: 2700,
      colorTemperatureK: 6500,
      ipRating: "IP65",
      mounting: "настенный кронштейн",
      retailUnitPrice: 3_890
    },
    {
      brand: "IEK",
      series: "СДО",
      kind: "floodlight",
      powerW: 50,
      luminousFluxLm: 4500,
      colorTemperatureK: 6500,
      ipRating: "IP65",
      mounting: "настенный кронштейн",
      retailUnitPrice: 5_190
    },
    {
      brand: "IEK",
      series: "СДО",
      kind: "floodlight",
      powerW: 100,
      luminousFluxLm: 9000,
      colorTemperatureK: 6500,
      ipRating: "IP65",
      mounting: "настенный кронштейн",
      retailUnitPrice: 8_890
    },
    {
      brand: "Gauss",
      series: "Qplus",
      kind: "floodlight",
      powerW: 50,
      luminousFluxLm: 5000,
      colorTemperatureK: 4000,
      ipRating: "IP65",
      mounting: "настенный кронштейн",
      retailUnitPrice: 9_790
    },
    {
      brand: "IEK",
      series: "ДСП",
      kind: "linear",
      powerW: 36,
      luminousFluxLm: 3600,
      colorTemperatureK: 4000,
      ipRating: "IP65",
      mounting: "накладной или подвесной",
      retailUnitPrice: 7_190
    },
    {
      brand: "EKF",
      series: "PROxima Line",
      kind: "linear",
      powerW: 40,
      luminousFluxLm: 4200,
      colorTemperatureK: 6500,
      ipRating: "IP65",
      mounting: "накладной или подвесной",
      retailUnitPrice: 7_690
    },
    {
      brand: "IEK",
      series: "ДПА",
      kind: "emergency",
      powerW: 3,
      luminousFluxLm: 180,
      colorTemperatureK: 6500,
      ipRating: "IP20",
      mounting: "настенный",
      retailUnitPrice: 8_490
    },
    {
      brand: "Eaton",
      series: "Exit LED",
      kind: "emergency",
      powerW: 4,
      luminousFluxLm: 220,
      colorTemperatureK: 6500,
      ipRating: "IP40",
      mounting: "настенный/потолочный",
      retailUnitPrice: 18_690,
      stockProfile: "limited"
    }
  ] satisfies LightingDefinition[]
).map(makeLighting);

interface SocketDefinition {
  brand: string;
  series: string;
  kind: "socket" | "industrial_socket" | "switch" | "isolator";
  poles: string;
  ratedCurrentA: number;
  ratedVoltageV: number;
  ipRating: string;
  installation: string;
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeSocket = (definition: SocketDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-wiring-${serial}`;
  const kindLabel: Record<SocketDefinition["kind"], string> = {
    socket: "Розетка",
    industrial_socket: "Розетка промышленная",
    switch: "Выключатель",
    isolator: "Выключатель нагрузки"
  };
  const slug = `wiring-${definition.kind.replace("_", "-")}-${slugify(definition.brand)}-${slugify(definition.series)}-${serial}`;

  return makeProduct({
    id,
    sku: `EKT-WIR-${serial}`,
    supplierSku: `MOCK-WIR-${definition.kind.toUpperCase()}-${serial}-${definition.ratedCurrentA}A`,
    name: `${kindLabel[definition.kind]} ${definition.brand} ${definition.series}, ${definition.poles}, ${definition.ratedCurrentA} А, ${definition.ipRating}`,
    slug,
    category: "Sockets and switches",
    subcategory:
      definition.kind === "industrial_socket"
        ? "Industrial sockets"
        : definition.kind === "isolator"
          ? "Load isolators"
          : "Domestic sockets and switches",
    brand: definition.brand,
    description: `${kindLabel[definition.kind]} для сети ${definition.ratedVoltageV} В, номинальный ток ${definition.ratedCurrentA} А, исполнение ${definition.installation}.`,
    synonyms: [
      "розетка",
      `розетка ${definition.ratedCurrentA}а`,
      definition.kind === "industrial_socket" ? "силовая розетка" : "электророзетка",
      "электр розетка",
      "ажыратқыш"
    ],
    attributes: {
      deviceType: definition.kind,
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: definition.ratedVoltageV,
      ipRating: definition.ipRating,
      installation: definition.installation,
      terminalType: "винтовой зажим",
      grounding: definition.kind.includes("socket"),
      frequencyHz: 50
    },
    technicalSpecifications: {
      deviceType: definition.kind,
      poles: definition.poles,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: definition.ratedVoltageV,
      ipRating: definition.ipRating,
      installation: definition.installation,
      terminalType: "винтовой зажим",
      grounding: definition.kind.includes("socket"),
      frequencyHz: 50,
      standards: ["IEC 60884-1", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 1,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice
  });
};

const wiringProducts: SeedProduct[] = (
  [
    {
      brand: "Legrand",
      series: "Valena Life",
      kind: "socket",
      poles: "2P+PE",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
      ipRating: "IP20",
      installation: "встраиваемый",
      retailUnitPrice: 2_890
    },
    {
      brand: "Schneider Electric",
      series: "Glossa",
      kind: "socket",
      poles: "2P+PE",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
      ipRating: "IP20",
      installation: "встраиваемый",
      retailUnitPrice: 2_390
    },
    {
      brand: "IEK",
      series: "BRITE",
      kind: "socket",
      poles: "2P+PE",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
      ipRating: "IP20",
      installation: "встраиваемый",
      retailUnitPrice: 1_390
    },
    {
      brand: "Legrand",
      series: "Plexo",
      kind: "socket",
      poles: "2P+PE",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
      ipRating: "IP55",
      installation: "накладной",
      retailUnitPrice: 4_690
    },
    {
      brand: "IEK",
      series: "PSR11",
      kind: "industrial_socket",
      poles: "2P+PE",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
      ipRating: "IP44",
      installation: "накладной",
      retailUnitPrice: 2_790
    },
    {
      brand: "IEK",
      series: "PSR12",
      kind: "industrial_socket",
      poles: "3P+PE",
      ratedCurrentA: 16,
      ratedVoltageV: 400,
      ipRating: "IP44",
      installation: "накладной",
      retailUnitPrice: 4_190
    },
    {
      brand: "IEK",
      series: "PSR12",
      kind: "industrial_socket",
      poles: "3P+N+PE",
      ratedCurrentA: 32,
      ratedVoltageV: 400,
      ipRating: "IP44",
      installation: "накладной",
      retailUnitPrice: 7_890
    },
    {
      brand: "Schneider Electric",
      series: "Pratika",
      kind: "industrial_socket",
      poles: "3P+N+PE",
      ratedCurrentA: 32,
      ratedVoltageV: 400,
      ipRating: "IP67",
      installation: "накладной",
      retailUnitPrice: 19_490,
      stockProfile: "limited"
    },
    {
      brand: "Schneider Electric",
      series: "Glossa",
      kind: "switch",
      poles: "1P",
      ratedCurrentA: 10,
      ratedVoltageV: 230,
      ipRating: "IP20",
      installation: "встраиваемый",
      retailUnitPrice: 1_790
    },
    {
      brand: "Legrand",
      series: "Valena Life",
      kind: "switch",
      poles: "1P",
      ratedCurrentA: 10,
      ratedVoltageV: 230,
      ipRating: "IP20",
      installation: "встраиваемый",
      retailUnitPrice: 2_190
    },
    {
      brand: "IEK",
      series: "VA-88",
      kind: "isolator",
      poles: "3P",
      ratedCurrentA: 40,
      ratedVoltageV: 400,
      ipRating: "IP20",
      installation: "DIN-рейка 35 мм",
      retailUnitPrice: 4_690
    },
    {
      brand: "Schneider Electric",
      series: "Acti9 iSW",
      kind: "isolator",
      poles: "3P",
      ratedCurrentA: 63,
      ratedVoltageV: 400,
      ipRating: "IP20",
      installation: "DIN-рейка 35 мм",
      retailUnitPrice: 12_890
    }
  ] satisfies SocketDefinition[]
).map(makeSocket);

interface TerminalDefinition {
  brand: string;
  series: string;
  terminalType: "screw" | "spring" | "ground" | "fuse";
  crossSectionMm2: number;
  ratedCurrentA: number;
  ratedVoltageV: number;
  color: string;
  retailUnitPrice: number;
  stockProfile?: StockProfile;
}

const makeTerminal = (definition: TerminalDefinition, index: number): SeedProduct => {
  const serial = String(index + 1).padStart(3, "0");
  const id = `prd-terminal-${serial}`;
  const typeLabel: Record<TerminalDefinition["terminalType"], string> = {
    screw: "Клемма винтовая",
    spring: "Клемма пружинная",
    ground: "Клемма заземления",
    fuse: "Клемма с предохранителем"
  };
  const slug = `terminal-${definition.terminalType}-${slugify(definition.brand)}-${slugify(definition.series)}-${serial}`;

  return makeProduct({
    id,
    sku: `EKT-TRM-${serial}`,
    supplierSku: `MOCK-TRM-${definition.terminalType.toUpperCase()}-${serial}-${String(definition.crossSectionMm2).replace(".", "P")}MM2`,
    name: `${typeLabel[definition.terminalType]} ${definition.brand} ${definition.series}, ${definition.crossSectionMm2} мм², ${definition.ratedCurrentA} А`,
    slug,
    category: "Terminals",
    subcategory: "DIN rail terminal blocks",
    brand: definition.brand,
    description: `Клеммный блок для установки на DIN-рейку: до ${definition.crossSectionMm2} мм², ${definition.ratedCurrentA} А, ${definition.ratedVoltageV} В.`,
    synonyms: [
      "клемма",
      "клеммник",
      `клемма ${definition.crossSectionMm2} мм2`,
      "din рейка клеммасы",
      "қысқыш клемма"
    ],
    attributes: {
      deviceType: "terminal",
      terminalType: definition.terminalType,
      crossSectionMm2: definition.crossSectionMm2,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: definition.ratedVoltageV,
      conductorMaterial: "медь",
      mounting: "DIN-рейка 35 мм",
      color: definition.color
    },
    technicalSpecifications: {
      deviceType: "terminal",
      terminalType: definition.terminalType,
      crossSectionMm2: definition.crossSectionMm2,
      ratedCurrentA: definition.ratedCurrentA,
      ratedVoltageV: definition.ratedVoltageV,
      conductorMaterial: "медь",
      mounting: "DIN-рейка 35 мм",
      wireConnection: "одножильный и многожильный провод",
      standards: ["IEC 60947-7-1", "ТР ТС 004/2011"]
    },
    unit: "шт.",
    packageSize: 10,
    stockProfile: definition.stockProfile ?? "standard",
    retailUnitPrice: definition.retailUnitPrice,
    wholesaleDiscount: 0.1
  });
};

const terminals: SeedProduct[] = (
  [
    {
      brand: "IEK",
      series: "ZVI-2.5",
      terminalType: "screw",
      crossSectionMm2: 2.5,
      ratedCurrentA: 24,
      ratedVoltageV: 800,
      color: "серый",
      retailUnitPrice: 189
    },
    {
      brand: "IEK",
      series: "ZVI-4",
      terminalType: "screw",
      crossSectionMm2: 4,
      ratedCurrentA: 32,
      ratedVoltageV: 800,
      color: "серый",
      retailUnitPrice: 248
    },
    {
      brand: "IEK",
      series: "ZVI-6",
      terminalType: "screw",
      crossSectionMm2: 6,
      ratedCurrentA: 41,
      ratedVoltageV: 800,
      color: "серый",
      retailUnitPrice: 338
    },
    {
      brand: "IEK",
      series: "ZPE-2.5",
      terminalType: "ground",
      crossSectionMm2: 2.5,
      ratedCurrentA: 24,
      ratedVoltageV: 800,
      color: "желто-зеленый",
      retailUnitPrice: 269
    },
    {
      brand: "Phoenix Contact",
      series: "UK 2,5 N",
      terminalType: "screw",
      crossSectionMm2: 2.5,
      ratedCurrentA: 24,
      ratedVoltageV: 800,
      color: "серый",
      retailUnitPrice: 990
    },
    {
      brand: "Phoenix Contact",
      series: "UT 4",
      terminalType: "spring",
      crossSectionMm2: 4,
      ratedCurrentA: 32,
      ratedVoltageV: 1000,
      color: "серый",
      retailUnitPrice: 1_290
    },
    {
      brand: "Phoenix Contact",
      series: "UT 2,5-PE",
      terminalType: "ground",
      crossSectionMm2: 2.5,
      ratedCurrentA: 24,
      ratedVoltageV: 1000,
      color: "желто-зеленый",
      retailUnitPrice: 1_490
    },
    {
      brand: "WAGO",
      series: "2002-1201",
      terminalType: "spring",
      crossSectionMm2: 2.5,
      ratedCurrentA: 24,
      ratedVoltageV: 800,
      color: "серый",
      retailUnitPrice: 1_090
    },
    {
      brand: "WAGO",
      series: "2002-1207",
      terminalType: "ground",
      crossSectionMm2: 2.5,
      ratedCurrentA: 24,
      ratedVoltageV: 800,
      color: "желто-зеленый",
      retailUnitPrice: 1_390
    },
    {
      brand: "EKF",
      series: "PROxima JXB-2.5",
      terminalType: "screw",
      crossSectionMm2: 2.5,
      ratedCurrentA: 24,
      ratedVoltageV: 800,
      color: "синий",
      retailUnitPrice: 198
    },
    {
      brand: "EKF",
      series: "PROxima JXB-4",
      terminalType: "screw",
      crossSectionMm2: 4,
      ratedCurrentA: 32,
      ratedVoltageV: 800,
      color: "серый",
      retailUnitPrice: 258
    },
    {
      brand: "Weidmüller",
      series: "WDU 2.5",
      terminalType: "fuse",
      crossSectionMm2: 2.5,
      ratedCurrentA: 6.3,
      ratedVoltageV: 500,
      color: "серый",
      retailUnitPrice: 2_490,
      stockProfile: "limited"
    }
  ] satisfies TerminalDefinition[]
).map(makeTerminal);

const allSeeds = [
  ...mcbs,
  ...rccbs,
  ...rcbos,
  ...contactors,
  ...controlRelays,
  ...cables,
  ...enclosures,
  ...lighting,
  ...wiringProducts,
  ...terminals
];

const withRelatedProducts = (seeds: SeedProduct[]): CatalogProduct[] =>
  seeds.map(({ product }) => {
    const relatedProductIds = seeds
      .filter(
        ({ product: candidate }) =>
          candidate.id !== product.id &&
          candidate.category === product.category &&
          candidate.subcategory === product.subcategory
      )
      .slice(0, 4)
      .map(({ product: candidate }) => candidate.id);

    return { ...product, relatedProductIds };
  });

const roundedPrice = (price: number): number => Math.round(price / 10) * 10;

const makePrices = (seeds: SeedProduct[]): CatalogPriceRecord[] =>
  seeds.flatMap(({ product, retailUnitPrice, wholesaleDiscount }) =>
    priceCities.map((city) => {
      const cityRetailPrice = roundedPrice(retailUnitPrice * cityPriceFactors[city]);

      return {
        productId: product.id,
        city,
        currency: "KZT",
        retailUnitPrice: cityRetailPrice,
        wholesaleUnitPrice: roundedPrice(cityRetailPrice * (1 - wholesaleDiscount)),
        priceList: city === "Алматы" ? "Mock retail Алматы" : `Mock retail ${city}`,
        updatedAt: PRICE_UPDATED_AT
      };
    })
  );

export const mockCatalogProducts: readonly CatalogProduct[] = withRelatedProducts(allSeeds);
export const mockCatalogPrices: readonly CatalogPriceRecord[] = makePrices(allSeeds);

/** Backwards-friendly aliases for direct mock-data consumers. */
export const mockProducts = mockCatalogProducts;
export const mockPrices = mockCatalogPrices;

export const mockCatalog: MockCatalogData = {
  products: mockCatalogProducts,
  prices: mockCatalogPrices
};

export const mockCatalogSummary: MockCatalogSummary = {
  productCount: mockCatalogProducts.length,
  priceRecordCount: mockCatalogPrices.length,
  cities: [...priceCities],
  categories: [...new Set(mockCatalogProducts.map((product) => product.category))],
  generatedAt: UPDATED_AT
};

export default mockCatalog;
