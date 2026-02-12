"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <div className="nav-left">
        <Link href="/" className="logo-link">
          <Image src="/logo.png" alt="Home" width={100} height={38} style={{ objectFit: 'contain' }} />
        </Link>
      </div>
      <div className="nav-right">
        <Link href="/trends" className={`nav-link ${pathname === "/trends" ? "active" : ""}`}>
          Trends
        </Link>
        <Link href="/leaderboard" className={`nav-link ${pathname === "/leaderboard" ? "active" : ""}`}>
          Leaderboard
        </Link>
        <Link href="/chat" className={`nav-link ${pathname === "/chat" ? "active" : ""}`}>
          Chat
        </Link>
      </div>

      <style jsx>{`
        .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1.5rem;
          background: white;
          border-bottom: 1px solid #e5e7eb;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .nav-left, .nav-right {
          display: flex;
          gap: 1rem;
          align-items: center;
        }
        .nav-link {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 500;
          color: #374151;
          transition: all 0.15s ease;
        }
        .nav-link:hover {
          background: #f3f4f6;
        }
        .nav-link.active {
          background: #3b82f6;
          color: white;
        }
      `}</style>
    </nav>
  );
}
