import { GoogleGenAI } from "@google/genai";

const PROMPT = `Look at this 3x4 grid of 12 frames. List ONLY what you literally see.

CRITICAL: Do NOT invent, assume, or hallucinate activities. If you only see driving, the activities array should ONLY contain driving. Do NOT add food, drinks, or other items unless they are PHYSICALLY VISIBLE in the frames.

Carbon rates per activity:
- Driving car: 0.17 kg CO2 per km
- Bus/Train: 0.06 kg CO2 per km  
- Walking/Biking: 0 kg CO2
- Plastic bottle: 0.08 kg CO2 each
- Beef meal: 2.50 kg CO2 each
- Other meal: 1.50 kg CO2 each

Respond with JSON only:
{"summary":"describe what you see","activities":[{"activity":"Driving","estimatedQuantity":"~5km","co2Kg":0.85}],"totalCO2Kg":0.85}`;

export interface ActivityDetection {
  activity: string;
  estimatedQuantity: string;
  co2Kg: number;
}

export interface AnalysisResult {
  summary: string;
  activities: ActivityDetection[];
  totalCO2Kg: number;
  scoreChange: number;
  startTime: string;
  endTime: string;
}

/** Analyze a grid image with Gemini. */
export async function analyzeGrid(
  gridDataUrl: string,
  startTime: string,
  endTime: string
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const ai = new GoogleGenAI({ apiKey });

  // Extract base64 from data URL
  const match = gridDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL format");
  const [, mimeType, base64Data] = match;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: PROMPT },
        ],
      },
    ],
    config: {
      temperature: 0,
    },
  });

  const text = response.text ?? "";
  console.log("=== GEMINI RAW RESPONSE ===");
  console.log(text);
  console.log("=== END RESPONSE ===");
  
  const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: { summary: string; activities: ActivityDetection[]; totalCO2Kg: number };
  try {
    parsed = JSON.parse(jsonStr);
    console.log("=== PARSED ACTIVITIES ===");
    console.log(JSON.stringify(parsed.activities, null, 2));
  } catch {
    parsed = { summary: "Parse failed: " + text.slice(0, 100), activities: [], totalCO2Kg: 0 };
  }

  return {
    summary: parsed.summary,
    activities: parsed.activities || [],
    totalCO2Kg: parsed.totalCO2Kg,
    scoreChange: Math.round((parsed.totalCO2Kg / 12.85) * 10000) / 100,
    startTime,
    endTime,
  };
}
