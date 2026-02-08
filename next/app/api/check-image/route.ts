import { NextRequest, NextResponse } from "next/server";
import { computeHash, hammingDistance } from "@/lib/phash";

// Store the last hash in memory (sufficient for hackathon)
let lastHash: string | null = null;

const SIMILARITY_THRESHOLD = 20; // < 5 = too similar, >= 5 = keep

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const currentHash = await computeHash(buffer);

    // First image is always processed
    if (!lastHash) {
      lastHash = currentHash;
      return NextResponse.json({
        shouldProcess: true,
        distance: null,
        message: "First image — accepted",
      });
    }

    const distance = hammingDistance(lastHash, currentHash);
    const shouldProcess = distance >= SIMILARITY_THRESHOLD;

    // Only update stored hash if the image is accepted
    if (shouldProcess) {
      lastHash = currentHash;
    }

    return NextResponse.json({
      shouldProcess,
      distance,
      message: shouldProcess
        ? `Accepted (distance: ${distance})`
        : `Too similar (distance: ${distance})`,
    });
  } catch (err) {
    console.error("Error in check-image:", err);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}

// Reset endpoint — call with DELETE to clear stored hash
export async function DELETE() {
  lastHash = null;
  return NextResponse.json({ message: "Hash cache cleared" });
}
