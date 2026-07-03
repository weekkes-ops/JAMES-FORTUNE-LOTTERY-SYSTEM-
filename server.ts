import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON and urlencoded parser with generous limits for image uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Lazy initialize Google GenAI SDK to avoid crashing if the API key is missing
  let ai: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!ai) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error("GEMINI_API_KEY environment variable is missing. Please configure it in your Settings > Secrets.");
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

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", keyConfigured: !!process.env.GEMINI_API_KEY });
  });

  // Lotto results image extraction API
  app.post("/api/extract", async (req, res) => {
    try {
      const { image } = req.body;
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

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
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
      return res.json({ success: true, data: extractedData });
    } catch (error: any) {
      console.warn("Gemini OCR warning (handled gracefully):", error.message || error);
      return res.status(200).json({
        success: false,
        error: error.message || "An unexpected error occurred during image parsing.",
      });
    }
  });

  // Lotto results prediction API
  app.post("/api/predict", async (req, res) => {
    try {
      const { gameName, history, strategy, targetDate, targetTime, targetEventName } = req.body;
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

      // We will provide a neat prompt that passes the history of recent draws for this game,
      // and asks Gemini to output exactly 5 predicted numbers (between 1 and 90), 2 extra numbers,
      // and a detailed reason/rationale.
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

      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
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
              }
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
      return res.json({ success: true, data: predictionData });
    } catch (error: any) {
      console.warn("Gemini Prediction warning (handled gracefully):", error.message || error);
      return res.status(200).json({
        success: false,
        error: error.message || "An unexpected error occurred during prediction generation.",
      });
    }
  });

  // Vite development server / production asset serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Full-stack server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
