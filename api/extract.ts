import { GoogleGenAI, Type } from "@google/genai";

// Lazy initialize Google GenAI SDK
let ai: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is missing in server environment.");
    }
    ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return ai;
}

function cleanErrorMessage(error: any): string {
  if (!error) return "An unexpected error occurred.";
  let msg = error.message || String(error);

  try {
    if (typeof msg === "string" && (msg.startsWith("{") || msg.includes('{"error":'))) {
      const jsonStart = msg.indexOf("{");
      const jsonEnd = msg.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(msg.substring(jsonStart, jsonEnd + 1));
        if (parsed?.error?.message) {
          msg = parsed.error.message;
        }
      }
    }
  } catch {
    // Ignore JSON parse errors and continue
  }

  if (msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
    return "Gemini API free tier rate limit reached. Please wait 30 seconds before uploading again, or provide a paid key in Settings.";
  }
  if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
    return "The AI service is temporarily experiencing high traffic. Please retry in a few moments.";
  }

  return msg;
}

async function generateContentWithRetry(
  client: GoogleGenAI,
  params: {
    models?: string[];
    contents: any;
    config?: any;
    maxAttempts?: number;
  }
) {
  const candidateModels = params.models || ["gemini-3.1-flash-lite", "gemini-3.7-flash"];
  let lastError: any = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const modelToUse = candidateModels[i];

    try {
      const response = await client.models.generateContent({
        model: modelToUse,
        contents: params.contents,
        config: params.config,
      });

      if (response && response.text) {
        return response;
      }
      throw new Error(`Empty response received from AI model ${modelToUse}`);
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      console.warn(`[Gemini Model ${modelToUse} failed]:`, errMsg);

      // If it's a quota or rate limit error on this model, immediately try the next model without delay
      const isQuotaError = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("Quota exceeded");
      if (isQuotaError && i < candidateModels.length - 1) {
        console.warn(`[Gemini Failover]: 429 quota on ${modelToUse}, switching immediately to ${candidateModels[i + 1]}`);
        continue;
      }

      // For temporary 503 errors, briefly pause before trying next candidate
      if (i < candidateModels.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  throw lastError;
}

export default async function handler(req: any, res: any) {
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: "No image data provided" });
    }

    const client = getGeminiClient();

    // Decode Base64 string safely
    const match = image.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/);
    let mimeType = "image/png";
    let base64Data = image;
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    const response = await generateContentWithRetry(client, {
      models: ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"],
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
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
            gameName: {
              type: Type.STRING,
              description: "Name of the lottery game in uppercase (e.g. MAD MAX, MANO, NATIONAL, etc)",
            },
            date: {
              type: Type.STRING,
              description: "The draw date formatted precisely as YYYY-MM-DD",
            },
            time: {
              type: Type.STRING,
              description: "The draw time (e.g. 11AM, 2PM, 4PM, 6PM, 8PM)",
            },
            edition: {
              type: Type.STRING,
              description: "The edition or draw number",
            },
            winningNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "List of exactly 5 winning numbers",
            },
            extraNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "List of extra/bonus numbers (usually 2 numbers), if any",
            },
            machineNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "List of machine numbers (usually 5 numbers), if any",
            },
          },
          required: ["gameName", "date", "time", "winningNumbers"],
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) {
      return res.status(500).json({ error: "Empty response received from Gemini" });
    }

    const extractedData = JSON.parse(jsonStr.trim());
    return res.status(200).json({ success: true, data: extractedData });
  } catch (error: any) {
    const sanitizedMessage = cleanErrorMessage(error);
    console.warn("Gemini OCR warning (handled gracefully):", sanitizedMessage);
    return res.status(200).json({
      success: false,
      error: sanitizedMessage,
    });
  }
}
