import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

// Hardcoded leaderboard users (daily CO2 in kg)
const hardcodedUsers = [
  { name: "Emma Green", dailyCO2: 0.8, avatar: "EG" },
  { name: "Alex Rivers", dailyCO2: 1.2, avatar: "AR" },
  { name: "Sam Chen", dailyCO2: 1.5, avatar: "SC" },
  { name: "Jordan Park", dailyCO2: 2.1, avatar: "JP" },
  { name: "Taylor Swift", dailyCO2: 2.8, avatar: "TS" },
  { name: "Morgan Lee", dailyCO2: 3.2, avatar: "ML" },
  { name: "Casey Kim", dailyCO2: 4.0, avatar: "CK" },
  { name: "Riley Johnson", dailyCO2: 5.5, avatar: "RJ" },
  { name: "Avery Williams", dailyCO2: 7.2, avatar: "AW" },
];

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET() {
  try {
    const db = await getDb();
    const collection = db.collection("carbonLogs");
    const today = getTodayDate();

    // Get user's total CO2 for today
    const todayLogs = await collection.find({ date: today }).toArray();
    const userDailyCO2 = todayLogs.reduce((sum, log) => sum + (log.totalCO2Kg || 0), 0);

    // Combine user with hardcoded users
    const allUsers = [
      { name: "You", dailyCO2: Math.round(userDailyCO2 * 100) / 100, avatar: "ME", isUser: true },
      ...hardcodedUsers.map(u => ({ ...u, isUser: false })),
    ];

    // Sort by lowest CO2 (best first)
    allUsers.sort((a, b) => a.dailyCO2 - b.dailyCO2);

    // Add rank
    const leaderboard = allUsers.map((user, index) => ({
      ...user,
      rank: index + 1,
    }));

    return NextResponse.json({ leaderboard, userRank: leaderboard.find(u => u.isUser)?.rank });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return NextResponse.json(
      { error: `Failed to get leaderboard: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
