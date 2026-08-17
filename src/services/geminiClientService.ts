import { GoogleGenAI, Type } from "@google/genai";
import { LottoResult } from "../types";
import { normalizeDateToYMD } from "../utils/dateUtils";

/**
 * Client-side direct fallback for Gemini extraction in case the hosted backend
 * is temporarily unreachable (e.g., during static hosting transitions or 404s).
 */
export async function directClientExtract(imageBase64: string, mimeType: string = "image/jpeg"): Promise<LottoResult | null> {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (typeof window !== "undefined" && (window as any).__GEMINI_API_KEY__);
  if (!apiKey) {
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/);
  let resolvedMime = mimeType;
  let base64Data = imageBase64;
  if (match) {
    resolvedMime = match[1];
    base64Data = match[2];
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          inlineData: {
            mimeType: resolvedMime,
            data: base64Data,
          },
        },
        {
          text: "Extract lottery draw details. Look for Game Name (e.g., MAD MAX, MANO, NATIONAL, BOMBALI SPECIAL, Peninsular, DAILY SPECIAL, COTTON TREE, Tonkolili SPECIAL, KOINADUGU SPECIAL, KANGARI), Date (format as YYYY-MM-DD), draw time (e.g. 11AM, 2PM, 4PM, 6PM, 8PM), Edition, 5 winning numbers, 2 extra numbers (if present), and 5 machine numbers (if present). If extra or machine numbers are not present, leave them as empty arrays.",
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gameName: { type: Type.STRING },
            date: { type: Type.STRING },
            time: { type: Type.STRING },
            edition: { type: Type.STRING },
            winningNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            extraNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            machineNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
          },
          required: ["gameName", "date", "time", "winningNumbers"],
        },
      },
    });
  } catch {
    response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: [
        {
          inlineData: {
            mimeType: resolvedMime,
            data: base64Data,
          },
        },
        {
          text: "Extract lottery draw details. Look for Game Name (e.g., MAD MAX, MANO, NATIONAL, BOMBALI SPECIAL, Peninsular, DAILY SPECIAL, COTTON TREE, Tonkolili SPECIAL, KOINADUGU SPECIAL, KANGARI), Date (format as YYYY-MM-DD), draw time (e.g. 11AM, 2PM, 4PM, 6PM, 8PM), Edition, 5 winning numbers, 2 extra numbers (if present), and 5 machine numbers (if present). If extra or machine numbers are not present, leave them as empty arrays.",
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            gameName: { type: Type.STRING },
            date: { type: Type.STRING },
            time: { type: Type.STRING },
            edition: { type: Type.STRING },
            winningNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            extraNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
            machineNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
            },
          },
          required: ["gameName", "date", "time", "winningNumbers"],
        },
      },
    });
  }

  const text = response.text;
  if (!text) return null;
  const parsed = JSON.parse(text);

  return {
    id: "lotto-extracted-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
    gameName: (parsed.gameName || "MAD MAX").trim().toUpperCase(),
    edition: (parsed.edition || "").trim(),
    date: normalizeDateToYMD(parsed.date),
    time: (parsed.time || "18:30").trim(),
    winningNumbers: Array.isArray(parsed.winningNumbers) ? parsed.winningNumbers.map(Number) : [],
    extraNumbers: Array.isArray(parsed.extraNumbers) ? parsed.extraNumbers.map(Number) : [],
    machineNumbers: Array.isArray(parsed.machineNumbers) ? parsed.machineNumbers.map(Number) : [],
  };
}
