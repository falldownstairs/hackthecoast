import { NextRequest, NextResponse } from "next/server";
import { analyzeFrames, AnalysisResult } from "../check-image/imageAnalysis";

// Running total of score across batches (persists in server memory)
let cumulativeScore = 0;
let batchHistory: Array<{ batchNumber: number; result: AnalysisResult; cumulativeScore: number }> = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, timestamps } = body as {
      images: string[]; // base64 data URLs
      timestamps: string[];
    };

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: "No images provided" },
        { status: 400 }
      );
    }

    if (!timestamps || timestamps.length !== images.length) {
      return NextResponse.json(
        { error: "Timestamps must match number of images" },
        { status: 400 }
      );
    }

    const result = await analyzeFrames(images, timestamps);

    // Update running total
    cumulativeScore += result.scoreChange;
    const batchNumber = batchHistory.length + 1;

    batchHistory.push({
      batchNumber,
      result,
      cumulativeScore: Math.round(cumulativeScore * 100) / 100,
    });

    return NextResponse.json({
      ...result,
      batchNumber,
      cumulativeScore: Math.round(cumulativeScore * 100) / 100,
    });
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// GET: retrieve cumulative score and batch history
export async function GET() {
  return NextResponse.json({
    cumulativeScore: Math.round(cumulativeScore * 100) / 100,
    totalBatches: batchHistory.length,
    history: batchHistory,
  });
}

// DELETE: reset running total
export async function DELETE() {
  cumulativeScore = 0;
  batchHistory = [];
  return NextResponse.json({ message: "Score reset" });
}
