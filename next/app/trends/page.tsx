"use client";

import { useState, useEffect } from "react";

interface DayData {
  date: string;
  label: string;
  totalCO2: number;
  activities: number;
}

interface Stats {
  average: number;
  max: number;
  min: number;
  trend: "improving" | "worsening" | "stable";
  totalWeek: number;
}

export default function TrendsPage() {
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrends();
  }, []);

  const fetchTrends = async () => {
    try {
      const res = await fetch("/api/trends");
      const data = await res.json();
      if (res.ok) {
        setWeekData(data.weekData);
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch trends:", err);
    } finally {
      setLoading(false);
    }
  };

  const maxCO2 = stats?.max || 1;

  const getTrendEmoji = (trend: string) => {
    if (trend === "improving") return "📉";
    if (trend === "worsening") return "📈";
    return "➡️";
  };

  const getTrendColor = (trend: string) => {
    if (trend === "improving") return "#10b981";
    if (trend === "worsening") return "#ef4444";
    return "#6b7280";
  };

  if (loading) {
    return (
      <div className="trends-container">
        <div className="loading">Loading trends...</div>
        <style jsx>{`
          .trends-container {
            max-width: 800px;
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
    <div className="trends-container">
      <div className="header">
        <h1>📊 Weekly Trends</h1>
        <p>Your carbon footprint over the past 7 days</p>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalWeek}</div>
            <div className="stat-label">Total kg CO₂</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.average}</div>
            <div className="stat-label">Daily Average</div>
          </div>
          <div className="stat-card" style={{ borderColor: getTrendColor(stats.trend) }}>
            <div className="stat-value">{getTrendEmoji(stats.trend)}</div>
            <div className="stat-label" style={{ color: getTrendColor(stats.trend) }}>
              {stats.trend.charAt(0).toUpperCase() + stats.trend.slice(1)}
            </div>
          </div>
        </div>
      )}

      <div className="chart-container">
        <div className="chart">
          {weekData.map((day, i) => (
            <div key={day.date} className="bar-container">
              <div className="bar-value">{day.totalCO2}</div>
              <div
                className={`bar ${i === weekData.length - 1 ? "today" : ""}`}
                style={{ height: `${(day.totalCO2 / maxCO2) * 200}px` }}
              >
                <div className="bar-tooltip">
                  {day.totalCO2} kg CO₂<br />
                  {day.activities} activities
                </div>
              </div>
              <div className="bar-label">{day.label}</div>
            </div>
          ))}
        </div>
        <div className="chart-baseline"></div>
      </div>

      <div className="insights">
        <h2>💡 Insights</h2>
        {stats && stats.trend === "improving" && (
          <p className="insight good">Great job! Your emissions today are below your weekly average.</p>
        )}
        {stats && stats.trend === "worsening" && (
          <p className="insight bad">Your emissions today are above average. Consider taking public transit or walking tomorrow!</p>
        )}
        {stats && stats.trend === "stable" && (
          <p className="insight neutral">Your emissions are consistent. Keep up the steady habits!</p>
        )}
        <p className="insight neutral">
          Your best day was {weekData.reduce((min, d) => d.totalCO2 < min.totalCO2 ? d : min).label} with only {stats?.min} kg CO₂.
        </p>
      </div>

      <style jsx>{`
        .trends-container {
          max-width: 800px;
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
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .stat-card {
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 1.25rem;
          text-align: center;
        }
        .stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
        }
        .stat-label {
          font-size: 0.875rem;
          color: #6b7280;
          margin-top: 0.25rem;
        }
        .chart-container {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          border: 1px solid #e5e7eb;
          position: relative;
        }
        .chart {
          display: flex;
          justify-content: space-around;
          align-items: flex-end;
          height: 250px;
          padding-bottom: 40px;
        }
        .chart-baseline {
          position: absolute;
          bottom: 60px;
          left: 2rem;
          right: 2rem;
          height: 2px;
          background: #e5e7eb;
        }
        .bar-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .bar-value {
          font-size: 0.75rem;
          font-weight: 600;
          color: #374151;
        }
        .bar {
          width: 40px;
          background: linear-gradient(180deg, #3b82f6, #60a5fa);
          border-radius: 6px 6px 0 0;
          min-height: 4px;
          position: relative;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        .bar:hover {
          transform: scaleX(1.1);
        }
        .bar.today {
          background: linear-gradient(180deg, #10b981, #34d399);
        }
        .bar-tooltip {
          display: none;
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: #1f2937;
          color: white;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          font-size: 0.75rem;
          white-space: nowrap;
          margin-bottom: 8px;
        }
        .bar:hover .bar-tooltip {
          display: block;
        }
        .bar-label {
          font-size: 0.7rem;
          color: #6b7280;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 50px;
        }
        .insights {
          background: #f9fafb;
          border-radius: 12px;
          padding: 1.5rem;
        }
        .insights h2 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
          color: #111827;
        }
        .insight {
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 0.75rem;
          font-size: 0.9rem;
        }
        .insight:last-child {
          margin-bottom: 0;
        }
        .insight.good {
          background: #d1fae5;
          color: #065f46;
        }
        .insight.bad {
          background: #fee2e2;
          color: #991b1b;
        }
        .insight.neutral {
          background: #e5e7eb;
          color: #374151;
        }
        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          .bar {
            width: 30px;
          }
        }
      `}</style>
    </div>
  );
}
