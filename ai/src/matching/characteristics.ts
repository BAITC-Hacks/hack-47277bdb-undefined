import type { CatalogProduct, CatalogProductAttributeValue } from "../schemas/catalog.js";

export type CharacteristicComparison =
  "exact" | "at_least" | "ip_at_least" | "residual_current_type";

export interface CriticalCharacteristic {
  readonly key: string;
  readonly labelRu: string;
  readonly labelKk: string;
  readonly comparison: CharacteristicComparison;
  readonly required: boolean;
}

export interface ProductCategoryProfile {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly critical: readonly CriticalCharacteristic[];
  readonly soft: readonly string[];
}

const exact = (
  key: string,
  labelRu: string,
  labelKk: string,
  required = true
): CriticalCharacteristic => ({ key, labelRu, labelKk, comparison: "exact", required });

const atLeast = (
  key: string,
  labelRu: string,
  labelKk: string,
  required = true
): CriticalCharacteristic => ({ key, labelRu, labelKk, comparison: "at_least", required });

export const CATEGORY_PROFILES: readonly ProductCategoryProfile[] = [
  {
    id: "circuit_breaker",
    aliases: [
      "circuit breaker",
      "circuit breakers",
      "автомат",
      "автоматический выключатель",
      "автоматты ажыратқыш"
    ],
    critical: [
      exact("deviceType", "тип устройства", "құрылғы түрі"),
      exact("poles", "число полюсов", "полюстер саны"),
      exact("ratedCurrentA", "номинальный ток", "номиналды ток"),
      atLeast("ratedVoltageV", "номинальное напряжение", "номиналды кернеу"),
      atLeast("breakingCapacityKA", "отключающая способность", "ажырату қабілеті"),
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["tripCurve", "moduleWidth", "series", "terminalType"]
  },
  {
    id: "rcd",
    aliases: [
      "rcd",
      "residual current device",
      "узо",
      "дифференциальный выключатель",
      "қорғаныс ажыратқышы"
    ],
    critical: [
      exact("deviceType", "тип устройства", "құрылғы түрі"),
      exact("poles", "число полюсов", "полюстер саны"),
      exact("ratedCurrentA", "номинальный ток", "номиналды ток"),
      atLeast("ratedVoltageV", "номинальное напряжение", "номиналды кернеу"),
      {
        key: "residualCurrentType",
        labelRu: "тип дифференциального тока",
        labelKk: "дифференциалдық ток түрі",
        comparison: "residual_current_type",
        required: true
      },
      exact("sensitivityMA", "ток утечки", "ағып кету тогы"),
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["shortCircuitRatingKA", "moduleWidth", "series"]
  },
  {
    id: "rcbo",
    aliases: ["rcbo", "дифференциальный автомат", "дифавтомат", "дифференциалды автомат"],
    critical: [
      exact("deviceType", "тип устройства", "құрылғы түрі"),
      exact("poles", "число полюсов", "полюстер саны"),
      exact("ratedCurrentA", "номинальный ток", "номиналды ток"),
      atLeast("ratedVoltageV", "номинальное напряжение", "номиналды кернеу"),
      atLeast("breakingCapacityKA", "отключающая способность", "ажырату қабілеті"),
      exact("tripCurve", "характеристика срабатывания", "іске қосылу сипаттамасы"),
      {
        key: "residualCurrentType",
        labelRu: "тип дифференциального тока",
        labelKk: "дифференциалдық ток түрі",
        comparison: "residual_current_type",
        required: true
      },
      exact("sensitivityMA", "ток утечки", "ағып кету тогы"),
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["moduleWidth", "series"]
  },
  {
    id: "contactor",
    aliases: ["contactor", "contactors", "контактор", "магнитный пускатель", "контактор"],
    critical: [
      exact("deviceType", "тип устройства", "құрылғы түрі"),
      exact("poles", "число главных полюсов", "негізгі полюстер саны"),
      atLeast("ratedCurrentA", "номинальный ток", "номиналды ток"),
      atLeast("ratedVoltageV", "рабочее напряжение", "жұмыс кернеуі"),
      exact("coilVoltageV", "напряжение катушки", "катушка кернеуі"),
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["contactConfiguration", "auxiliaryContacts", "utilizationCategory"]
  },
  {
    id: "relay",
    aliases: ["relay", "relays", "реле", "реле"],
    critical: [
      exact("deviceType", "тип устройства", "құрылғы түрі"),
      exact("coilVoltageV", "напряжение катушки", "катушка кернеуі"),
      exact("contactConfiguration", "контактная группа", "контактілер тобы"),
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["ratedCurrentA", "timeRange", "function"]
  },
  {
    id: "cable",
    aliases: ["cable", "cables", "кабель", "провод", "кабель"],
    critical: [
      exact("deviceType", "тип изделия", "өнім түрі"),
      exact("conductorMaterial", "материал жилы", "өткізгіш материалы"),
      exact("coreCount", "число жил", "талшықтар саны"),
      exact("crossSectionMm2", "сечение жилы", "талшық қимасы"),
      atLeast("voltageRatingV", "номинальное напряжение", "номиналды кернеу")
    ],
    soft: ["insulation", "fireClass", "shielded", "color"]
  },
  {
    id: "enclosure",
    aliases: ["enclosure", "enclosures", "щит", "корпус", "распределительный щит", "қалқан"],
    critical: [
      exact("deviceType", "тип изделия", "өнім түрі"),
      atLeast("moduleCount", "число модулей", "модульдер саны"),
      {
        key: "ipRating",
        labelRu: "степень защиты IP",
        labelKk: "IP қорғаныс дәрежесі",
        comparison: "ip_at_least",
        required: true
      },
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["doorType", "bodyMaterial", "color"]
  },
  {
    id: "terminal",
    aliases: ["terminal", "terminals", "клемма", "клеммник", "қысқыш"],
    critical: [
      exact("deviceType", "тип изделия", "өнім түрі"),
      exact("terminalType", "тип клеммы", "қысқыш түрі"),
      atLeast("ratedCurrentA", "номинальный ток", "номиналды ток"),
      atLeast("ratedVoltageV", "номинальное напряжение", "номиналды кернеу"),
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["crossSectionMm2", "color", "connectionSides"]
  },
  {
    id: "socket_switch",
    aliases: [
      "sockets and switches",
      "socket",
      "switch",
      "розетка",
      "выключатель",
      "розетка және қосқыш"
    ],
    critical: [
      exact("deviceType", "тип изделия", "өнім түрі"),
      atLeast("ratedVoltageV", "номинальное напряжение", "номиналды кернеу"),
      atLeast("ratedCurrentA", "номинальный ток", "номиналды ток"),
      exact("mounting", "способ монтажа", "орнату тәсілі")
    ],
    soft: ["ipRating", "color", "series", "grounding"]
  }
];

const CHARACTERISTIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  deviceType: ["device type", "тип", "тип устройства", "product type"],
  poles: ["pole", "poles", "полюса", "число полюсов", "полюстер"],
  ratedCurrentA: ["rated current", "current", "номинальный ток", "ток", "ток a"],
  ratedVoltageV: ["rated voltage", "voltage", "номинальное напряжение", "напряжение", "кернеу"],
  breakingCapacityKA: [
    "breaking capacity",
    "short circuit capacity",
    "отключающая способность",
    "кз ka"
  ],
  tripCurve: ["trip curve", "характеристика", "кривая"],
  mounting: ["mounting", "installation", "монтаж", "установка"],
  sensitivityMA: ["sensitivity", "residual current", "ток утечки", "чувствительность"],
  residualCurrentType: [
    "residual current type",
    "residual type",
    "residualType",
    "rcd type",
    "тип узо",
    "дифференциальный тип"
  ],
  coilVoltageV: ["coil voltage", "напряжение катушки", "катушка"],
  contactConfiguration: ["contact configuration", "контактная группа", "контакты"],
  conductorMaterial: ["conductor material", "материал жилы", "материал проводника"],
  coreCount: ["core count", "number of cores", "число жил", "жил"],
  crossSectionMm2: ["cross section", "section mm2", "сечение", "қима"],
  voltageRatingV: ["voltage rating", "кабельное напряжение", "напряжение кабеля"],
  moduleCount: [
    "module count",
    "module capacity",
    "moduleCapacity",
    "modules",
    "число модулей",
    "модули"
  ],
  ipRating: ["ip", "ip rating", "степень защиты", "қорғау дәрежесі"],
  terminalType: ["terminal type", "тип клеммы", "клемма"]
};

function normalizedKey(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]/gu, "");
}

export function canonicalCharacteristicKey(input: string): string {
  const normalizedInput = normalizedKey(input);
  for (const [canonicalKey, aliases] of Object.entries(CHARACTERISTIC_ALIASES)) {
    if (
      normalizedKey(canonicalKey) === normalizedInput ||
      aliases.some((alias) => normalizedKey(alias) === normalizedInput)
    ) {
      return canonicalKey;
    }
  }
  return input;
}

export function getCategoryProfile(category: string, subcategory?: string): ProductCategoryProfile {
  const searchableCategory = `${category} ${subcategory ?? ""}`.toLocaleLowerCase("ru-RU");
  const profile = CATEGORY_PROFILES.find((candidate) =>
    candidate.aliases.some((alias) => searchableCategory.includes(alias.toLocaleLowerCase("ru-RU")))
  );

  return (
    profile ?? {
      id: "generic",
      aliases: [],
      critical: [exact("deviceType", "тип изделия", "өнім түрі", false)],
      soft: []
    }
  );
}

export function characteristicValue(
  product: Pick<CatalogProduct, "attributes" | "technicalSpecifications">,
  key: string
): CatalogProductAttributeValue | undefined {
  const canonicalKey = canonicalCharacteristicKey(key);
  const directTechnical = product.technicalSpecifications[canonicalKey];
  if (directTechnical !== undefined) {
    return directTechnical;
  }

  const directAttribute = product.attributes[canonicalKey];
  if (directAttribute !== undefined) {
    return directAttribute;
  }

  const allEntries = [
    ...Object.entries(product.technicalSpecifications),
    ...Object.entries(product.attributes)
  ];
  const aliasMatch = allEntries.find(
    ([candidateKey]) => canonicalCharacteristicKey(candidateKey) === canonicalKey
  );

  return aliasMatch?.[1];
}

export function asComparableNumber(
  value: CatalogProductAttributeValue | undefined
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

export function asComparableText(
  value: CatalogProductAttributeValue | undefined
): string | undefined {
  if (typeof value === "string") {
    return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

export function parseIpRating(value: CatalogProductAttributeValue | undefined): number | undefined {
  const text = asComparableText(value);
  if (!text) {
    return undefined;
  }

  const match = text.match(/ip\s?(\d{2})/i);
  return match ? Number(match[1]) : undefined;
}
