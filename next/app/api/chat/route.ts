import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const { message } = (await request.json()) as { message: string };

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    const db = await getDb();
    const collection = db.collection("carbonLogs");

    // Fetch recent logs (last 50 entries, sorted by date)
    const logs = await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    console.log(`[Chat API] Found ${logs.length} logs in database`);
    if (logs.length > 0) {
      console.log(`[Chat API] Most recent log: ${logs[0].date} ${logs[0].startTime}-${logs[0].endTime}`);
    }

    // Format context for Gemini
    const context = logs
      .map((r, i) => {
        const activities = r.activities?.map((a: { activity: string; estimatedQuantity: string; co2Kg: number }) => 
          `${a.activity} (${a.estimatedQuantity}, ${a.co2Kg}kg CO2)`
        ).join(", ") || "none";
        return `[${i + 1}] Date: ${r.date}, Time: ${r.startTime}-${r.endTime}
Summary: ${r.summary}
Activities: ${activities}
Total CO2: ${r.totalCO2Kg}kg`;
      })
      .join("\n\n");

    // Generate response with Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a helpful assistant with access to a user's carbon footprint activity logs.

Based on the following activity records, answer the user's question. Be concise and helpful. If the information isn't in the records, say so.

ACTIVITY RECORDS:
${context || "No records found."}

USER QUESTION: ${message}`,
            },
          ],
        },
      ],
      config: { temperature: 0.3 },
    });

    const reply = response.text ?? "I couldn't generate a response.";

    return NextResponse.json({ reply, sources: logs.length });
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json(
      { error: `Chat failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
