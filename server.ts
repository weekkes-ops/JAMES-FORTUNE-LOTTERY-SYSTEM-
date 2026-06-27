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
      console.error("Gemini OCR error:", error);
      return res.status(500).json({
        error: error.message || "An unexpected error occurred during image parsing.",
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
