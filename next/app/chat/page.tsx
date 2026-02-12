"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// TypeScript declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        recognitionRef.current = new SpeechRecognitionAPI();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = "en-US";
      }
    }
  }, []);

  // Format timestamps for natural speech
  const formatTextForSpeech = (text: string): string => {
    // Match ISO timestamps like 2026-02-08T14:30:00.000Z or 2026-02-08T14:30:00
    const isoPattern = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?/g;
    
    // Match date-only patterns like 2026-02-08
    const datePattern = /(\d{4})-(\d{2})-(\d{2})(?![T\d])/g;
    
    // Match time patterns like 14:30:00 or 14:30
    const timePattern = /(?<!\d)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)/g;

    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const formatTime = (hours: number, minutes: number): string => {
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      if (minutes === 0) {
        return `${hour12} ${period}`;
      }
      return `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
    };

    const getOrdinal = (n: number): string => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    // Replace ISO timestamps
    text = text.replace(isoPattern, (_, year, month, day, hour, minute) => {
      const monthName = months[parseInt(month, 10) - 1];
      const dayOrdinal = getOrdinal(parseInt(day, 10));
      const timeStr = formatTime(parseInt(hour, 10), parseInt(minute, 10));
      return `${monthName} ${dayOrdinal}, ${year} at ${timeStr}`;
    });

    // Replace date-only patterns
    text = text.replace(datePattern, (_, year, month, day) => {
      const monthName = months[parseInt(month, 10) - 1];
      const dayOrdinal = getOrdinal(parseInt(day, 10));
      return `${monthName} ${dayOrdinal}, ${year}`;
    });

    // Replace standalone time patterns (be careful not to break already formatted times)
    text = text.replace(timePattern, (match, hour, minute) => {
      // Skip if it looks like it's part of a larger pattern or already formatted
      const h = parseInt(hour, 10);
      const m = parseInt(minute, 10);
      if (h > 23 || m > 59) return match;
      return formatTime(h, m);
    });

    return text;
  };

  // Text-to-speech function (always on)
  const speakText = async (text: string) => {
    if (!text) return;

    // Format timestamps for natural speech
    const formattedText = formatTextForSpeech(text);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: formattedText }),
      });

      if (!res.ok) {
        console.error("TTS failed:", await res.text());
        return;
      }

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (err) {
      console.error("TTS error:", err);
    }
  };

  // Start listening
  const startListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }

    setIsListening(true);

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognitionRef.current.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
        // Speak the response
        speakText(data.reply);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <h2>💬 Carbon Activity Chat</h2>
            <p>Ask questions about your carbon footprint activity logs.</p>
            <div className="examples">
              <p>Try asking:</p>
              <ul>
                <li>"When was the last time I drove?"</li>
                <li>"What activities did I do today?"</li>
                <li>"How much CO2 did I produce this week?"</li>
              </ul>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="message-content loading">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <button
          className={`voice-btn ${isListening ? "listening" : ""}`}
          onClick={isListening ? stopListening : startListening}
          disabled={loading}
          title={isListening ? "Stop listening" : "Speak your question"}
        >
          {isListening ? "⏹️" : "🎤"}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening..." : "Ask about your carbon footprint..."}
          rows={1}
          disabled={loading || isListening}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>

      <style jsx>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 57px);
          max-width: 800px;
          margin: 0 auto;
          background: #f9fafb;
        }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .empty-state {
          text-align: center;
          color: #6b7280;
          margin: auto;
          padding: 2rem;
        }
        .empty-state h2 {
          font-size: 1.5rem;
          color: #374151;
          margin-bottom: 0.5rem;
        }
        .empty-state p {
          margin-bottom: 1.5rem;
        }
        .examples {
          text-align: left;
          background: white;
          padding: 1rem 1.5rem;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }
        .examples p {
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: #374151;
        }
        .examples ul {
          margin: 0;
          padding-left: 1.25rem;
          color: #6b7280;
        }
        .examples li {
          margin: 0.25rem 0;
        }
        .message {
          display: flex;
          max-width: 80%;
        }
        .message.user {
          align-self: flex-end;
        }
        .message.assistant {
          align-self: flex-start;
        }
        .message-content {
          padding: 0.75rem 1rem;
          border-radius: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .message.user .message-content {
          background: #3b82f6;
          color: white;
          border-bottom-right-radius: 4px;
        }
        .message.assistant .message-content {
          background: white;
          color: #374151;
          border: 1px solid #e5e7eb;
          border-bottom-left-radius: 4px;
        }
        .message-content.loading {
          display: flex;
          gap: 4px;
          padding: 1rem;
        }
        .dot {
          width: 8px;
          height: 8px;
          background: #9ca3af;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }
        .dot:nth-child(1) { animation-delay: 0s; }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        .chat-input-container {
          display: flex;
          gap: 0.75rem;
          padding: 1rem 1.5rem;
          background: white;
          border-top: 1px solid #e5e7eb;
          align-items: center;
        }
        .voice-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid #d1d5db;
          background: white;
          cursor: pointer;
          font-size: 1.2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .voice-btn:hover:not(:disabled) {
          background: #f3f4f6;
        }
        .voice-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .voice-btn.listening {
          background: #fee2e2;
          border-color: #ef4444;
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .chat-input-container textarea {
          flex: 1;
          padding: 0.75rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 1rem;
          resize: none;
          font-family: inherit;
        }
        .chat-input-container textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .chat-input-container button {
          padding: 0.75rem 1.5rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .chat-input-container button:hover:not(:disabled) {
          background: #2563eb;
        }
        .chat-input-container button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
