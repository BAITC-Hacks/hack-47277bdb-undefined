import type { AnalogExplanation, AnalogExplanationKind } from "../analogs/types.js";
import type { CatalogProduct, CatalogProductAttributeValue } from "../catalog/types.js";
import {
  asComparableNumber,
  asComparableText,
  canonicalCharacteristicKey,
  characteristicValue,
  getCategoryProfile,
  parseIpRating,
  type CharacteristicComparison,
  type CriticalCharacteristic,
  type ProductCategoryProfile
} from "./characteristics.js";

export interface AnalogRequirements {
  readonly category: string;
  readonly profile: ProductCategoryProfile;
  readonly values: Readonly<Record<string, CatalogProductAttributeValue>>;
}

export interface CompatibilityEvaluation {
  readonly compatible: boolean;
  readonly profile: ProductCategoryProfile;
  readonly verifiedCriticalCharacteristics: readonly string[];
  readonly unverifiedCharacteristics: readonly string[];
  readonly explanations: readonly AnalogExplanation[];
  readonly technicalSimilarity: number;
}

interface CharacteristicComparisonResult {
  readonly compatible: boolean;
  readonly similarity: number;
  readonly differs: boolean;
}

function readableValue(value: CatalogProductAttributeValue | undefined): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value === undefined ? "не указано" : String(value);
}

function normalizedText(value: CatalogProductAttributeValue | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value
      .map((item) => item.toLocaleLowerCase("ru-RU").trim())
      .sort()
      .join("|");
  }
  return asComparableText(value)?.replace(/[^\p{L}\p{N}]/gu, "");
}

function compareExact(
  expected: CatalogProductAttributeValue,
  actual: CatalogProductAttributeValue
): CharacteristicComparisonResult {
  const expectedNumber = asComparableNumber(expected);
  const actualNumber = asComparableNumber(actual);
  if (expectedNumber !== undefined && actualNumber !== undefined) {
    const matches = Math.abs(expectedNumber - actualNumber) < 0.000_001;
    return { compatible: matches, similarity: matches ? 1 : 0, differs: !matches };
  }

  const matches = normalizedText(expected) === normalizedText(actual);
  return { compatible: matches, similarity: matches ? 1 : 0, differs: !matches };
}

function compareAtLeast(
  expected: CatalogProductAttributeValue,
  actual: CatalogProductAttributeValue
): CharacteristicComparisonResult {
  const expectedNumber = asComparableNumber(expected);
  const actualNumber = asComparableNumber(actual);
  if (expectedNumber === undefined || actualNumber === undefined) {
    return { compatible: false, similarity: 0, differs: true };
  }

  if (actualNumber < expectedNumber) {
    return { compatible: false, similarity: 0, differs: true };
  }

  if (actualNumber === expectedNumber) {
    return { compatible: true, similarity: 1, differs: false };
  }

  const relativeDifference = (actualNumber - expectedNumber) / Math.max(expectedNumber, 1);
  return {
    compatible: true,
    similarity: Math.max(0.78, 1 - relativeDifference / 4),
    differs: true
  };
}

function compareIpAtLeast(
  expected: CatalogProductAttributeValue,
  actual: CatalogProductAttributeValue
): CharacteristicComparisonResult {
  const expectedIp = parseIpRating(expected);
  const actualIp = parseIpRating(actual);
  if (expectedIp === undefined || actualIp === undefined || actualIp < expectedIp) {
    return { compatible: false, similarity: 0, differs: true };
  }
  return {
    compatible: true,
    similarity: actualIp === expectedIp ? 1 : 0.94,
    differs: actualIp !== expectedIp
  };
}

function residualCurrentRank(value: CatalogProductAttributeValue): number | undefined {
  const normalized = normalizedText(value);
  switch (normalized) {
    case "ac":
      return 1;
    case "a":
      return 2;
    case "f":
      return 3;
    case "b":
      return 4;
    default:
      return undefined;
  }
}

function compareResidualCurrentType(
  expected: CatalogProductAttributeValue,
  actual: CatalogProductAttributeValue
): CharacteristicComparisonResult {
  const expectedRank = residualCurrentRank(expected);
  const actualRank = residualCurrentRank(actual);
  if (expectedRank === undefined || actualRank === undefined) {
    return compareExact(expected, actual);
  }

  const compatible = actualRank >= expectedRank;
  return {
    compatible,
    similarity: compatible ? (actualRank === expectedRank ? 1 : 0.92) : 0,
    differs: actualRank !== expectedRank
  };
}

function compareCharacteristic(
  comparison: CharacteristicComparison,
  expected: CatalogProductAttributeValue,
  actual: CatalogProductAttributeValue
): CharacteristicComparisonResult {
  switch (comparison) {
    case "at_least":
      return compareAtLeast(expected, actual);
    case "ip_at_least":
      return compareIpAtLeast(expected, actual);
    case "residual_current_type":
      return compareResidualCurrentType(expected, actual);
    case "exact":
      return compareExact(expected, actual);
  }
}

function message(
  kind: AnalogExplanationKind,
  characteristic: CriticalCharacteristic,
  expected: CatalogProductAttributeValue | undefined,
  actual: CatalogProductAttributeValue | undefined
): AnalogExplanation {
  const sourceText = readableValue(expected);
  const candidateText = readableValue(actual);

  if (kind === "technical_match") {
    return {
      kind,
      characteristic: characteristic.key,
      sourceValue: expected,
      candidateValue: actual,
      messageRu: `Совпадает ${characteristic.labelRu}: ${candidateText}.`,
      messageKk: `${characteristic.labelKk} сәйкес: ${candidateText}.`
    };
  }

  if (kind === "technical_difference") {
    return {
      kind,
      characteristic: characteristic.key,
      sourceValue: expected,
      candidateValue: actual,
      messageRu: `Отличие по «${characteristic.labelRu}»: требуется ${sourceText}, у варианта ${candidateText}.`,
      messageKk: `«${characteristic.labelKk}» бойынша айырмашылық: талап ${sourceText}, нұсқада ${candidateText}.`
    };
  }

  return {
    kind,
    characteristic: characteristic.key,
    sourceValue: expected,
    candidateValue: actual,
    messageRu: `Не удалось подтвердить «${characteristic.labelRu}»: в данных варианта значение не указано.`,
    messageKk: `«${characteristic.labelKk}» расталмады: нұсқа деректерінде мән көрсетілмеген.`
  };
}

function dynamicRequirement(key: string): CriticalCharacteristic {
  return {
    key,
    labelRu: key,
    labelKk: key,
    comparison: "exact",
    required: true
  };
}

function isSameCategory(requirements: AnalogRequirements, candidate: CatalogProduct): boolean {
  const candidateProfile = getCategoryProfile(candidate.category, candidate.subcategory);
  if (requirements.profile.id !== "generic" || candidateProfile.id !== "generic") {
    return requirements.profile.id === candidateProfile.id;
  }

  return (
    requirements.category.toLocaleLowerCase("ru-RU").trim() ===
    candidate.category.toLocaleLowerCase("ru-RU").trim()
  );
}

export function buildAnalogRequirements(
  category: string,
  source: CatalogProduct | null,
  requiredCharacteristics: Readonly<Record<string, CatalogProductAttributeValue>>
): AnalogRequirements {
  const profile = getCategoryProfile(category, source?.subcategory);
  const values: Record<string, CatalogProductAttributeValue> = {};

  for (const [rawKey, value] of Object.entries(requiredCharacteristics)) {
    values[canonicalCharacteristicKey(rawKey)] = value;
  }

  if (source) {
    for (const characteristic of profile.critical) {
      if (values[characteristic.key] === undefined) {
        const sourceValue = characteristicValue(source, characteristic.key);
        if (sourceValue !== undefined) {
          values[characteristic.key] = sourceValue;
        }
      }
    }
  }

  return { category, profile, values };
}

export function evaluateCompatibility(
  requirements: AnalogRequirements,
  source: CatalogProduct | null,
  candidate: CatalogProduct
): CompatibilityEvaluation {
  if (!isSameCategory(requirements, candidate)) {
    return {
      compatible: false,
      profile: requirements.profile,
      verifiedCriticalCharacteristics: [],
      unverifiedCharacteristics: [],
      technicalSimilarity: 0,
      explanations: [
        {
          kind: "technical_difference",
          characteristic: "category",
          sourceValue: requirements.category,
          candidateValue: candidate.category,
          messageRu: `Категория не совпадает: требуется «${requirements.category}», найдено «${candidate.category}».`,
          messageKk: `Санат сәйкес емес: «${requirements.category}» қажет, «${candidate.category}» табылды.`
        }
      ]
    };
  }

  const profileKeys = new Set(requirements.profile.critical.map((item) => item.key));
  const characteristics = [
    ...requirements.profile.critical,
    ...Object.keys(requirements.values)
      .filter((key) => !profileKeys.has(key))
      .map(dynamicRequirement)
  ];

  const explanations: AnalogExplanation[] = [];
  const verified: string[] = [];
  const unverified: string[] = [];
  const similarityValues: number[] = [];

  for (const characteristic of characteristics) {
    const expected = requirements.values[characteristic.key];
    if (expected === undefined) {
      unverified.push(characteristic.key);
      continue;
    }

    const actual = characteristicValue(candidate, characteristic.key);
    if (actual === undefined) {
      explanations.push(message("warning", characteristic, expected, actual));
      if (characteristic.required) {
        return {
          compatible: false,
          profile: requirements.profile,
          verifiedCriticalCharacteristics: verified,
          unverifiedCharacteristics: [...unverified, characteristic.key],
          technicalSimilarity: 0,
          explanations
        };
      }
      unverified.push(characteristic.key);
      continue;
    }

    const comparison = compareCharacteristic(characteristic.comparison, expected, actual);
    if (!comparison.compatible) {
      explanations.push(message("technical_difference", characteristic, expected, actual));
      return {
        compatible: false,
        profile: requirements.profile,
        verifiedCriticalCharacteristics: verified,
        unverifiedCharacteristics: unverified,
        technicalSimilarity: 0,
        explanations
      };
    }

    verified.push(characteristic.key);
    similarityValues.push(comparison.similarity);
    explanations.push(
      message(
        comparison.differs ? "technical_difference" : "technical_match",
        characteristic,
        expected,
        actual
      )
    );
  }

  if (source) {
    for (const softKey of requirements.profile.soft) {
      const sourceValue = characteristicValue(source, softKey);
      const candidateValue = characteristicValue(candidate, softKey);
      if (sourceValue === undefined || candidateValue === undefined) {
        continue;
      }

      const comparison = compareExact(sourceValue, candidateValue);
      similarityValues.push(comparison.similarity);
      if (comparison.differs) {
        explanations.push(
          message("technical_difference", dynamicRequirement(softKey), sourceValue, candidateValue)
        );
      }
    }
  }

  const averageSimilarity =
    similarityValues.length === 0
      ? 0.5
      : similarityValues.reduce((total, value) => total + value, 0) / similarityValues.length;

  return {
    compatible: true,
    profile: requirements.profile,
    verifiedCriticalCharacteristics: verified,
    unverifiedCharacteristics: unverified,
    technicalSimilarity: Number((averageSimilarity * 100).toFixed(2)),
    explanations
  };
}
