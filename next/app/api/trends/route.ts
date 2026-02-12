import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

// Hardcoded data for the past 6 days
const hardcodedDays = [
  { date: "2026-02-02", totalCO2: 3.2, activities: 8 },
  { date: "2026-02-03", totalCO2: 2.8, activities: 6 },
  { date: "2026-02-04", totalCO2: 4.5, activities: 12 },
  { date: "2026-02-05", totalCO2: 1.9, activities: 5 },
  { date: "2026-02-06", totalCO2: 3.7, activities: 9 },
  { date: "2026-02-07", totalCO2: 2.4, activities: 7 },
];

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
}

export async function GET() {
  try {
    const db = await getDb();
    const collection = db.collection("carbonLogs");
    const today = getTodayDate();

    // Get today's data from MongoDB
    const todayLogs = await collection.find({ date: today }).toArray();
    const todayTotal = todayLogs.reduce((sum, log) => sum + (log.totalCO2Kg || 0), 0);

    // Combine hardcoded + today's real data
    const weekData = [
      ...hardcodedDays.map(d => ({
        date: d.date,
        label: formatDateLabel(d.date),
        totalCO2: d.totalCO2,
        activities: d.activities,
      })),
      {
        date: today,
        label: "Today",
        totalCO2: Math.round(todayTotal * 100) / 100,
        activities: todayLogs.length,
      },
    ];

    // Calculate stats
    const avgCO2 = weekData.reduce((sum, d) => sum + d.totalCO2, 0) / weekData.length;
    const maxCO2 = Math.max(...weekData.map(d => d.totalCO2));
    const minCO2 = Math.min(...weekData.map(d => d.totalCO2));
    const trend = todayTotal < avgCO2 ? "improving" : todayTotal > avgCO2 ? "worsening" : "stable";

    return NextResponse.json({
      weekData,
      stats: {
        average: Math.round(avgCO2 * 100) / 100,
        max: maxCO2,
        min: minCO2,
        trend,
        totalWeek: Math.round(weekData.reduce((sum, d) => sum + d.totalCO2, 0) * 100) / 100,
      },
    });
  } catch (err) {
    console.error("Trends error:", err);
    return NextResponse.json(
      { error: `Failed to get trends: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
