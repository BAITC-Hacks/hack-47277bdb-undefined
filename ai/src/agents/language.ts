import type { Language } from "../types/domain.js";

const KAZAKH_LETTERS = /[әғқңөұүһі]/giu;
const CYRILLIC_LETTERS = /[а-яё]/giu;

export function detectLanguage(message: string, fallback: Language = "ru"): Language {
  const kazakhCount = [...message.matchAll(KAZAKH_LETTERS)].length;
  const cyrillicCount = [...message.matchAll(CYRILLIC_LETTERS)].length;
  if (kazakhCount > 0 && kazakhCount * 5 >= Math.max(1, cyrillicCount)) {
    return "kk";
  }
  if (cyrillicCount > 0) {
    return "ru";
  }
  if (/[a-z]/iu.test(message)) {
    return "en";
  }
  return fallback;
}

export function localizedMessage(language: Language, ru: string, kk: string, en: string): string {
  switch (language) {
    case "kk":
      return kk;
    case "en":
      return en;
    default:
      return ru;
  }
}
