"use client";

import { useState, useEffect } from "react";

interface LeaderboardEntry {
  rank: number;
  name: string;
  dailyCO2: number;
  avatar: string;
  isUser: boolean;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      if (res.ok) {
        setLeaderboard(data.leaderboard);
        setUserRank(data.userRank);
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { background: "linear-gradient(135deg, #ffd700, #ffec8b)", color: "#8b6914" };
    if (rank === 2) return { background: "linear-gradient(135deg, #c0c0c0, #e8e8e8)", color: "#5a5a5a" };
    if (rank === 3) return { background: "linear-gradient(135deg, #cd7f32, #daa06d)", color: "#5c3a21" };
    return { background: "#f3f4f6", color: "#374151" };
  };

  const getRankLabel = (rank: number) => {
    return rank;
  };

  if (loading) {
    return (
      <div className="leaderboard-container">
        <div className="loading">Loading leaderboard...</div>
        <style jsx>{`
          .leaderboard-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 2rem 1rem;
          }
          .loading {
            text-align: center;
            color: #6b7280;
            padding: 3rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="leaderboard-container">
      <div className="header">
        <h1>Leaderboard</h1>
        <p>Today&apos;s lowest carbon footprint</p>
        {userRank && (
          <div className="user-rank">
            Your rank: <strong>#{getRankLabel(userRank)}</strong>
          </div>
        )}
      </div>

      <div className="leaderboard-list">
        {leaderboard.map((entry) => (
          <div
            key={entry.name}
            className={`leaderboard-entry ${entry.isUser ? "is-user" : ""}`}
            style={entry.rank <= 3 ? getRankStyle(entry.rank) : undefined}
          >
            <div className="rank">{getRankLabel(entry.rank)}</div>
            <div className="avatar-circle">{entry.avatar}</div>
            <div className="name">{entry.name}</div>
            <div className="co2">
              <span className="value">{entry.dailyCO2}</span>
              <span className="unit">kg CO₂</span>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .leaderboard-container {
          max-width: 600px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }
        .header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .header h1 {
          font-size: 2rem;
          margin-bottom: 0.5rem;
          color: #111827;
        }
        .header p {
          color: #6b7280;
          margin-bottom: 1rem;
        }
        .user-rank {
          display: inline-block;
          padding: 0.5rem 1rem;
          background: #dbeafe;
          border-radius: 9999px;
          color: #1d4ed8;
          font-size: 0.9rem;
        }
        .leaderboard-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .leaderboard-entry {
          display: flex;
          align-items: center;
          padding: 1rem 1.25rem;
          background: #f9fafb;
          border-radius: 12px;
          gap: 1rem;
          transition: transform 0.15s ease;
        }
        .leaderboard-entry:hover {
          transform: translateX(4px);
        }
        .leaderboard-entry.is-user {
          border: 2px solid #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
        }
        .rank {
          font-size: 1.25rem;
          font-weight: 700;
          min-width: 40px;
          text-align: center;
        }
        .avatar-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.85rem;
        }
        .name {
          flex: 1;
          font-weight: 600;
          color: inherit;
        }
        .co2 {
          text-align: right;
        }
        .co2 .value {
          font-size: 1.25rem;
          font-weight: 700;
          color: inherit;
        }
        .co2 .unit {
          display: block;
          font-size: 0.75rem;
          color: inherit;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
