import { AppError } from "../errors/app-error.js";

const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?instructions/i,
  /system\s+prompt/i,
  /добавь\s+.*\s+в\s+корзин/i,
  /игнорируй\s+.*\s+инструкц/i,
  /нұсқаулықтарды\s+елеме/i
];

const DANGEROUS_ELECTRICAL_PATTERNS: readonly RegExp[] = [
  /под\s+напряжени/i,
  /без\s+отключения/i,
  /обойти\s+(защит|автомат|узо)/i,
  /live\s+(wire|electrical)/i
];

export interface DocumentSafetyResult {
  readonly cleanText: string;
  readonly ignoredInstructionCount: number;
}

/** Treat every uploaded document as untrusted data, never as executable instructions. */
export function isolateDocumentData(text: string): DocumentSafetyResult {
  const lines = text.split(/\r?\n/u);
  let ignoredInstructionCount = 0;
  const cleanLines = lines.map((line) => {
    if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(line))) {
      ignoredInstructionCount += 1;
      return "[untrusted instruction removed]";
    }
    return line;
  });
  return { cleanText: cleanLines.join("\n"), ignoredInstructionCount };
}

export function ensureSafeElectricalRequest(message: string): void {
  if (DANGEROUS_ELECTRICAL_PATTERNS.some((pattern) => pattern.test(message))) {
    throw new AppError(
      "UNSAFE_REQUEST",
      "Для работ с электроустановками обратитесь к квалифицированному специалисту и соблюдайте требования безопасности.",
      422
    );
  }
}
