import { GoogleGenAI } from "@google/genai";

const CARBON_TABLE = `
Carbon Emission Reference Table:
| Activity | CO2 (kg) | Notes |
|---|---|---|
| Driving a Car (Gasoline) | +0.17 per km | High emissions |
| Taking Public Transit (Bus/Train) | +0.06 per km | Moderate emissions |
| Biking or Walking | 0.00 | Zero emissions |
| Using Single-Use Plastic Bottle | +0.08 per unit | Consumption waste |
| Beef/Lamb-based Meal | +2.50 per meal | Heavy emissions |
| Average Mixed Meal | +1.50 per meal | Moderate emissions |
`;

const SYSTEM_PROMPT = `You are a carbon footprint analyst. You will be shown a sequence of images (frames captured over time) from a person's daily activity.

Your job:
1. Analyze what is happening across the frames — identify activities, movement, food, transport, consumption, etc.
2. Estimate the carbon emissions based on the activities you observe using the reference table below.
3. Provide a brief summary of what happened.
4. Calculate the total estimated CO2 emissions (in kg) from the observed activities.

${CARBON_TABLE}

You MUST respond in valid JSON only, no markdown, no explanation outside the JSON. Use this exact structure:
{
  "summary": "Brief 2-3 sentence description of what happened across the frames",
  "activities": [
    {
      "activity": "Name of activity detected",
      "estimatedQuantity": "e.g. ~5km, ~1 meal, ~2 bottles",
      "co2Kg": 0.85
    }
  ],
  "totalCO2Kg": 1.23
}

If no carbon-emitting activities are detected, set totalCO2Kg to 0 and explain in the summary what you saw instead.
Be conservative with estimates — only report what you can reasonably infer from the images.`;

export interface ActivityDetection {
  activity: string;
  estimatedQuantity: string;
  co2Kg: number;
}

export interface AnalysisResult {
  summary: string;
  activities: ActivityDetection[];
  totalCO2Kg: number;
  scoreChange: number; // (totalCO2Kg / 12.85) * 100
  timestamps: string[];
}

/**
 * Analyze a batch of captured frames using Gemini vision.
 * Returns a summary, detected activities, CO2 estimate, and score change.
 */
export async function analyzeFrames(
  imageDataUrls: string[],
  timestamps: string[]
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build multimodal content parts: images + text prompt
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  // Add each frame as an inline image
  imageDataUrls.forEach((dataUrl, i) => {
    // Extract base64 data and mime type from data URL
    const matches = dataUrl.match(/^data:(.+?);base64,(.+)$/);
    if (matches) {
      const mimeType = matches[1];
      const base64Data = matches[2];
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
      parts.push({
        text: `[Frame ${i + 1} — captured at ${timestamps[i]}]`,
      });
    }
  });

  // Add the analysis request
  parts.push({
    text: `The above ${imageDataUrls.length} frames were captured sequentially over time. Analyze them and provide your carbon footprint assessment as JSON.`,
  });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  const text = response.text ?? "";

  // Parse JSON from response (strip any markdown code fences if present)
  const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: { summary: string; activities: ActivityDetection[]; totalCO2Kg: number };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("Failed to parse Gemini response:", text);
    parsed = {
      summary: "Analysis could not be parsed. Raw response: " + text.slice(0, 200),
      activities: [],
      totalCO2Kg: 0,
    };
  }

  // Calculate score change: (emissions / 12.85) * 100
  const scoreChange = (parsed.totalCO2Kg / 12.85) * 100;

  return {
    summary: parsed.summary,
    activities: parsed.activities || [],
    totalCO2Kg: parsed.totalCO2Kg,
    scoreChange: Math.round(scoreChange * 100) / 100, // round to 2 decimals
    timestamps,
  };
}
