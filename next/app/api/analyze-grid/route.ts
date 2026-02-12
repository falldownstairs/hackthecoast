import { NextRequest, NextResponse } from "next/server";
import { analyzeGrid } from "../check-image/imageAnalysis";
import { getDb } from "@/lib/mongodb";

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

export async function POST(request: NextRequest) {
  try {
    const { gridImage, startTime, endTime } = (await request.json()) as {
      gridImage: string;
      startTime: string;
      endTime: string;
    };

    if (!gridImage) {
      return NextResponse.json({ error: "No grid image provided" }, { status: 400 });
    }

    const result = await analyzeGrid(gridImage, startTime, endTime);
    const db = await getDb();
    const collection = db.collection("carbonLogs");

    const today = getTodayDate();

    // Get cumulative score for today
    const todayLogs = await collection.find({ date: today }).toArray();
    const previousTotal = todayLogs.reduce((sum, log) => sum + (log.scoreChange || 0), 0);
    const cumulativeScore = Math.round((previousTotal + result.scoreChange) * 100) / 100;

    // Store to MongoDB
    await collection.insertOne({
      summary: result.summary,
      activities: result.activities,
      totalCO2Kg: result.totalCO2Kg,
      scoreChange: result.scoreChange,
      startTime: result.startTime,
      endTime: result.endTime,
      date: today,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, cumulativeScore });
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const db = await getDb();
    const collection = db.collection("carbonLogs");
    const today = getTodayDate();

    const todayLogs = await collection.find({ date: today }).toArray();
    const cumulativeScore = todayLogs.reduce((sum, log) => sum + (log.scoreChange || 0), 0);

    return NextResponse.json({
      cumulativeScore: Math.round(cumulativeScore * 100) / 100,
      totalBatches: todayLogs.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const db = await getDb();
    const collection = db.collection("carbonLogs");
    const today = getTodayDate();
    await collection.deleteMany({ date: today });
    return NextResponse.json({ message: "Today's logs cleared" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
