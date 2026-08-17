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
    return "Gemini API free tier rate limit reached. Please wait 30 seconds before trying again, or provide a paid key in Settings.";
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
    const { gameName, history, strategy, targetDate, targetTime, targetEventName } = req.body || {};
    if (!gameName) {
      return res.status(400).json({ error: "Game name is required" });
    }

    const client = getGeminiClient();

    let strategyInstruction = "";
    if (strategy === "evens") {
      strategyInstruction = `
      CRITICAL MANDATE: The user has selected the "Pure Evens" strategy.
      - EVERY SINGLE ONE of your predicted winning numbers, predicted extra numbers, and predicted machine numbers MUST BE AN EVEN INTEGER (divisible by 2).
      - Absolutely DO NOT include any odd numbers in your predictions.
      `;
    } else if (strategy === "evens-next") {
      strategyInstruction = `
      CRITICAL MANDATE: The user has selected "According to Evens, Whichever is Next" (Counter-Movement Evens).
      - EVERY SINGLE ONE of your predicted winning numbers, predicted extra numbers, and predicted machine numbers MUST BE AN EVEN INTEGER (divisible by 2).
      - Ground your prediction by taking the numbers from the last draw and selecting their historical even successors/counterparts from counter-movement theory.
      - Absolutely DO NOT include any odd numbers in your predictions.
      `;
    }

    const scheduleDetails = `
    UPCOMING PREDICTION DRAW TARGET CONFIGURATION:
    - Draw Event Name: ${targetEventName || gameName}
    - Target Draw Date: ${targetDate || "Not specified"}
    - Target Draw Time: ${targetTime || "Not specified"}
    
    CRITICAL INSTRUCTION: In your reasoning analysis, you MUST explicitly mention and base the forecasting on this specific target draw date, time, and event name (e.g., "Predictive analysis calculated for the ${targetEventName || gameName} draw scheduled on ${targetDate || "upcoming date"} at ${targetTime || "upcoming time"}").
    `;

    const prompt = `
      You are an expert lottery analyst for the JAMES FORTUNE LOTTERY SYSTEM.
      Analyze the historical draw results for the game "${gameName}" provided below:
      ${JSON.stringify(history, null, 2)}

      Based on these historical results, predict the outcomes of the next game (next edition).
      ${strategyInstruction}
      ${scheduleDetails}

      Return:
      1. A list of exactly 5 predicted winning numbers (each between 1 and 90, unique, sorted).
      2. A list of exactly 2 predicted extra numbers (each between 1 and 90, unique, sorted).
      3. A list of exactly 5 predicted machine numbers (each between 1 and 90, unique, sorted).
      4. A comprehensive reasoning and analysis (e.g. Hot/Cold numbers, gap analysis, parity pattern, or recent frequency trends) explaining why these numbers were selected.

      Make sure your analysis is grounded in the actual history provided (e.g. "Number 79 appeared 3 times recently").
    `;

    const response = await generateContentWithRetry(client, {
      models: ["gemini-3.1-flash-lite", "gemini-3.7-flash"],
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictedWinningNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "List of exactly 5 predicted winning numbers",
            },
            predictedExtraNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "List of exactly 2 predicted extra numbers",
            },
            predictedMachineNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "List of exactly 5 predicted machine numbers",
            },
            reasoning: {
              type: Type.STRING,
              description: "Detailed step-by-step statistical reasoning and analysis based on hot/cold frequencies, spacing, parity, etc.",
            },
            nextEdition: {
              type: Type.STRING,
              description: "Predicted next edition number (usually current edition + 1)",
            },
          },
          required: ["predictedWinningNumbers", "predictedExtraNumbers", "predictedMachineNumbers", "reasoning"],
        },
      },
    });

    const jsonStr = response.text;
    if (!jsonStr) {
      return res.status(500).json({ error: "Empty response received from Gemini" });
    }

    const predictionData = JSON.parse(jsonStr.trim());
    return res.status(200).json({ success: true, data: predictionData });
  } catch (error: any) {
    const sanitizedMessage = cleanErrorMessage(error);
    console.warn("Gemini Prediction warning (handled gracefully):", sanitizedMessage);
    return res.status(200).json({
      success: false,
      error: sanitizedMessage,
    });
  }
}
