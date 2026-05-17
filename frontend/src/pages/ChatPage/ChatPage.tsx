import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/SideBar/SideBar";
import { sendQuery } from "../../api/sendQuery";
import axios from "axios";
import "./ChatPage.css";
import MapView from "../../components/MapView/MapView";
import MarkdownMessage from "../../components/MarkDownMessage/MarkDownMessage";
import type { MapPin } from "../../components/MapView/MapView";
import NewTripModal from "../../components/newTripModel/newTripModel";
import { createTrip, getTrips, deleteTrip } from "../../api/trips";
import { fetchProfile } from "../../api/user";

/* ═══════════════════════════════════════════════════════════════════
   COORDINATE PARSING
═══════════════════════════════════════════════════════════════════ */

function parseCoords(text: string): { lat: number; lng: number } | null {
  const nsew =
    /([+-]?\d{1,3}\.\d+)\s*°?\s*(N|S)[,\s]+([+-]?\d{1,3}\.\d+)\s*°?\s*(E|W)/i.exec(
      text,
    );
  if (nsew) {
    const lat = parseFloat(nsew[1]) * (nsew[2].toUpperCase() === "S" ? -1 : 1);
    const lng = parseFloat(nsew[3]) * (nsew[4].toUpperCase() === "W" ? -1 : 1);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  const labelled =
    /(?:latitude|lat)[:\s°]*([+-]?\d{1,3}\.\d+)[°\s,]+(?:longitude|lon(?:g)?|lng)[:\s°]*([+-]?\d{1,3}\.\d+)/i.exec(
      text,
    );
  if (labelled) {
    const lat = parseFloat(labelled[1]);
    const lng = parseFloat(labelled[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  const jsonLike =
    /[{,]\s*"?lat(?:itude)?"?\s*:\s*([+-]?\d{1,3}\.\d+).*?"?(?:lng|lon(?:g)?|longitude)"?\s*:\s*([+-]?\d{1,3}\.\d+)/i.exec(
      text,
    );
  if (jsonLike) {
    const lat = parseFloat(jsonLike[1]);
    const lng = parseFloat(jsonLike[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  const bare =
    /(?:location|coordinates?|coords?)[:\s]+([+-]?\d{1,3}\.\d+)\s*,\s*([+-]?\d{1,3}\.\d+)/i.exec(
      text,
    );
  if (bare) {
    const lat = parseFloat(bare[1]);
    const lng = parseFloat(bare[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  return null;
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TITLE EXTRACTION
═══════════════════════════════════════════════════════════════════ */
function extractTitle(line: string): string | null {
  let s = line.trim();
  s = s.replace(/^#{1,6}\s*/, "");
  s = s.replace(/^\d+[.)]\s*/, "");
  s = s.replace(/^\*{1,2}(.+?)\*{1,2}$/, "$1").trim();
  if (!s || /https?:\/\//i.test(s) || parseCoords(s)) return null;
  if (s.length < 2 || s.length > 120) return null;
  return s;
}

/* ═══════════════════════════════════════════════════════════════════
   LINE CLASSIFICATION
═══════════════════════════════════════════════════════════════════ */
function isTitleLine(line: string): boolean {
  const t = line.trim();
  return (
    /^#{1,6}\s/.test(t) || /^\d+[.)]\s/.test(t) || /^\*{2}.+\*{2}$/.test(t)
  );
}

function isLocationLine(line: string): boolean {
  const t = line.replace(/^[-–*\s]+/, "").trim();
  return /\*{0,2}location\*{0,2}/i.test(t) || /coordinates?/i.test(t);
}

function isImageLine(line: string): boolean {
  return /!\[[^\]]*\]\(https?:\/\/[^\s)]+\)/.test(line.trim());
}

/* ═══════════════════════════════════════════════════════════════════
   PIN EXTRACTOR
═══════════════════════════════════════════════════════════════════ */
export function extractPins(content: string): MapPin[] {
  const lines = content.split("\n");
  const pins: MapPin[] = [];
  const seen = new Set<string>();

  function addPin(
    name: string,
    coords: { lat: number; lng: number },
    description?: string,
    image?: string,
  ) {
    const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pins.push({ name, lat: coords.lat, lng: coords.lng, description, image });
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isTitleLine(line)) {
      i++;
      continue;
    }

    const name = extractTitle(line);
    if (!name) {
      i++;
      continue;
    }

    let coords: { lat: number; lng: number } | null = null;
    let image = "";
    let description = "";

    for (let j = i + 1; j < Math.min(i + 11, lines.length); j++) {
      const sub = lines[j].trim();
      if (!sub) continue;
      if (isTitleLine(sub) && j > i + 1) break;
      if (!image && isImageLine(sub)) {
        const m = sub.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
        if (m) image = m[1];
      }
      if (!coords && isLocationLine(sub)) coords = parseCoords(sub);
      if (!description && /^[-–]\s/.test(sub)) {
        const text = sub
          .replace(/^[-–]\s+/, "")
          .replace(/\*\*/g, "")
          .trim();
        if (!isImageLine(text) && !isLocationLine(text) && !parseCoords(text))
          description = text;
      }
    }

    if (coords)
      addPin(name, coords, description || undefined, image || undefined);
    i++;
  }

  let lastTitle = "";
  let lastImage = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (isTitleLine(trimmed)) {
      const t = extractTitle(trimmed);
      if (t) {
        lastTitle = t;
        lastImage = "";
      }
      continue;
    }
    if (isImageLine(trimmed)) {
      const m = trimmed.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
      if (m) lastImage = m[1];
      continue;
    }
    const coords = parseCoords(trimmed);
    if (coords && lastTitle)
      addPin(lastTitle, coords, undefined, lastImage || undefined);
  }

  return pins;
}

/* ═══════════════════════════════════════════════════════════════════
   TYPES & CONSTANTS
═══════════════════════════════════════════════════════════════════ */
interface Message {
  label: "human" | "ai";
  content: string;
}

// _id is string to match Sidebar's Trip interface
interface Trip {
  _id: string;
  title: string;
}

const STATUS_MESSAGES = [
  "Thinking about your trip…",
  "Checking itinerary details…",
  "Crafting a response…",
  "Almost there…",
];

import type { UserProfile } from "../../api/types";

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 120000;

/* ═══════════════════════════════════════════════════════════════════
   CHAT PAGE
═══════════════════════════════════════════════════════════════════ */
interface TripForm {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
}

const ChatPage: React.FC = () => {
  const { tripId } = useParams();
  const navigate = useNavigate();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  // const [loadingProfile, setLoadingProfile] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedLengthRef = useRef(0);

  const handleNewTrip = () => {
    setShowModal(true);
  };

  const handleCreateTrip = async (form: TripForm) => {
    try {
      const trip = await createTrip(form);
      const normalised = { ...trip, _id: String(trip._id) };

      setTrips((prev) => [normalised, ...prev]);
      navigate(`/chat/${normalised._id}`);
    } catch (err) {
      console.error("Trip creation failed", err);
    }
  };

  // _id is string so compare directly (no Number() conversion)
  const activeTrip = trips.find((t) => t._id === tripId) || null;

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const stopPolling = () => {
    [pollTimerRef, elapsedTimerRef, statusTimerRef].forEach((r) => {
      if (r.current) {
        clearInterval(r.current);
        r.current = null;
      }
    });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const fetchAllMessages = async (): Promise<Message[]> => {
    const res = await axios.get(`http://localhost:3000/api/chats/${tripId}`, {
      withCredentials: true,
    });
    return (res.data.data || []).flatMap((c: any) => c.messages);
  };

  useEffect(() => {
    autoResize();
  }, [input]);
  useEffect(() => {
    if (!loading) textareaRef.current?.focus();
  }, [loading]);
  useEffect(
    () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages, loading],
  );

  useEffect(() => {
    if (loading) {
      setStatusIdx(0);
      statusTimerRef.current = setInterval(
        () => setStatusIdx((idx) => (idx + 1) % STATUS_MESSAGES.length),
        2200,
      );
    } else {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    }
    return () => {
      if (statusTimerRef.current) clearInterval(statusTimerRef.current);
    };
  }, [loading]);

  useEffect(() => {
    getTrips()
      .then((data) =>
        setTrips(data.map((t: any) => ({ ...t, _id: String(t._id) }))),
      )
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!tripId) return;
    fetchAllMessages()
      .then(setMessages)
      .catch((err) => console.error("Failed to load messages:", err.message));
  }, [tripId]);

  useEffect(() => () => stopPolling(), []);

  const handleSend = async () => {
    if (!input.trim() || !tripId || loading) return;

    const query = input.trim();
    expectedLengthRef.current = messages.length + 1;

    setMessages((prev) => [...prev, { label: "human", content: query }]);
    setInput("");
    setLoading(true);
    setElapsed(0);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    sendQuery(query, tripId).catch((err) => console.error("sendQuery:", err));

    elapsedTimerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    pollTimerRef.current = setInterval(async () => {
      try {
        const fetched = await fetchAllMessages();
        if (fetched.length > expectedLengthRef.current) {
          stopPolling();
          setMessages((prev) => {
            const newMsgs = fetched.slice(prev.length);
            return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
          });
          setLoading(false);
          setElapsed(0);
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, POLL_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setLoading(false);
      setElapsed(0);
      fetchAllMessages()
        .then((fetched) =>
          setMessages((prev) => {
            const newMsgs = fetched.slice(prev.length);
            return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
          }),
        )
        .catch(console.error);
    }, TIMEOUT_MS);
  };

  const elapsedLabel = elapsed > 0 ? `${elapsed}s` : null;

  const handleDeleteTrip = async (deletedId: string) => {
    try {
      await deleteTrip(deletedId);
      setTrips((prev) => prev.filter((t) => t._id !== deletedId));
      if (deletedId === tripId) {
        navigate("/");
      }
    } catch (err) {
      console.error("Trip deletion failed", err);
    }
  };

  const sidebarUser = profile
    ? { name: profile.name, email: profile.email }
    : undefined;

  useEffect(() => {
    (async () => {
      const [profileRes, tripsRes] = await Promise.allSettled([
        fetchProfile(),
        getTrips(),
      ]);

      if (
        profileRes.status === "fulfilled" &&
        profileRes.value.success &&
        profileRes.value.data
      ) {
        setProfile(profileRes.value.data);
      } else {
        setProfile({
          id: "u1",
          name: "Traveller",
          email: "user@example.com",
          badge: "Wanderer",
          avatarInitial: "T",
        });
      }

      if (tripsRes.status === "fulfilled") {
        setTrips(tripsRes.value);
      }

      // setLoadingProfile(false);
    })();
  }, []);

  return (
    <div className="tp-app">
      {showModal && (
        <NewTripModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreateTrip}
        />
      )}

      <Sidebar
        trips={trips}
        activeTrip={activeTrip}
        setActiveTrip={() => {}}
        onNewTrip={handleNewTrip}
        sidebarOpen={sidebarOpen}
        user={sidebarUser}
        onDeleteTrip={handleDeleteTrip}
      />

      <main className={`tp-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <header className="tp-topbar">
          <button
            className="tp-toggle-btn"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle sidebar"
          >
            <span />
            <span />
            <span />
          </button>

          {activeTrip && (
            <div className="tp-trip-title">
              <span className="trip-icon">✦</span>
              <h2>{activeTrip.title}</h2>
            </div>
          )}

          <div className={`topbar-progress ${loading ? "active" : ""}`} />
        </header>

        <div className={`status-banner ${loading ? "visible" : ""}`}>
          <span className="status-dot" />
          <span className="status-text" key={statusIdx}>
            {STATUS_MESSAGES[statusIdx]}
          </span>
          {elapsedLabel && (
            <span className="status-countdown">{elapsedLabel}</span>
          )}
        </div>

        <div className="chat-messages">
          {messages.length === 0 && !loading && (
            <div className="chat-empty">
              <div className="empty-icon">✦</div>
              <p>Ask anything about your trip</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const pins = msg.label === "ai" ? extractPins(msg.content) : [];
            return (
              <div key={idx} className={`chat-row ${msg.label}`}>
                {msg.label === "ai" && (
                  <div className="avatar ai-avatar">W</div>
                )}
                <div className={`chat-bubble ${msg.label}`}>
                  {msg.label === "ai" ? (
                    <>
                      <MarkdownMessage content={msg.content} />
                      {pins.length > 0 && <MapView pins={pins} />}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="chat-row ai">
              <div className="avatar ai-avatar">W</div>
              <div className="chat-bubble ai typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-wrapper">
          <div className={`chat-input ${loading ? "is-loading" : ""}`}>
            <textarea
              ref={textareaRef}
              placeholder={
                loading ? "Waiting for response…" : "Ask about your trip..."
              }
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label="Send"
              className={loading ? "btn-loading" : ""}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
          <p className="input-hint">Enter to send · Shift+Enter for new line</p>
        </div>
      </main>
    </div>
  );
};

export default ChatPage;
