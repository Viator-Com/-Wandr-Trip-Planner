import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Step {
  num: string;
  bg: string;
  color: string;
  icon: string;
  title: string;
  desc: string;
}

interface Feature {
  accent?: boolean;
  bg: string;
  color: string;
  icon: string;
  title: string;
  desc: string;
}

interface DestinationPreview {
  emoji: string;
  name: string;
  tag: string;
  score: string;
}

interface Testimonial {
  color: string;
  init: string;
  name: string;
  loc: string;
  text: string;
}

interface CTAProps {
  onCTA: () => void;
}

// ─── Data ──────────────────────────────────────────────────────────────────────
const DESTINATIONS: string[] = [
  "🗼 Paris",
  "⛩️ Kyoto",
  "🌊 Santorini",
  "🌴 Bali",
  "🏔️ Patagonia",
  "🏙️ New York",
  "🌅 Maldives",
  "🎭 Rome",
  "🐘 Serengeti",
  "🌸 Tokyo",
  "🏜️ Morocco",
  "🌿 Costa Rica",
];

const STEPS: Step[] = [
  {
    num: "01",
    bg: "#E1F5EE",
    color: "#0F6E56",
    icon: "✈",
    title: "Tell the AI your dream",
    desc: "Type your destination, trip length, travel vibe, and budget. No rigid forms — just a natural conversation.",
  },
  {
    num: "02",
    bg: "#FAEEDA",
    color: "#854F0B",
    icon: "✨",
    title: "AI builds your itinerary",
    desc: "Wandr generates a full day-by-day plan with activities, restaurants, and transport tailored to you.",
  },
  {
    num: "03",
    bg: "#EEEDFE",
    color: "#534AB7",
    icon: "✏️",
    title: "Tweak, share & go",
    desc: "Edit anything by chatting. Share with co-travelers and book directly from your itinerary.",
  },
];

const FEATURES: Feature[] = [
  {
    accent: true,
    bg: "#E1F5EE",
    color: "#0F6E56",
    icon: "🤖",
    title: "Conversational AI agent",
    desc: "Chat naturally to build, change, or expand your itinerary at any point — like texting a travel-obsessed friend.",
  },
  {
    bg: "#FAEEDA",
    color: "#854F0B",
    icon: "💰",
    title: "Smart budget tracker",
    desc: "Set your budget and watch AI keep costs in check — flights, stays, food, and experiences all tracked live.",
  },
  {
    bg: "#EEEDFE",
    color: "#534AB7",
    icon: "👥",
    title: "Collaborate with co-travelers",
    desc: "Share your plan, vote on activities, and sync changes in real time across your travel group.",
  },
  {
    bg: "#E6F1FB",
    color: "#185FA5",
    icon: "🗺️",
    title: "Interactive map view",
    desc: "See your full route on a live map, optimize for travel time, and discover hidden gems nearby.",
  },
];

const DESTINATIONS_PREVIEW: DestinationPreview[] = [
  {
    emoji: "⛩️",
    name: "Senso-ji, Asakusa",
    tag: "Culture · Day 1",
    score: "96%",
  },
  {
    emoji: "🍜",
    name: "Tsukiji Outer Market",
    tag: "Food · Day 2",
    score: "94%",
  },
  { emoji: "🏔️", name: "Nikko Day Trip", tag: "Nature · Day 5", score: "91%" },
];

const TESTIMONIALS: Testimonial[] = [
  {
    color: "#1D9E75",
    init: "P",
    name: "Priya M.",
    loc: "Mumbai → Paris",
    text: "Planned our entire two-week Europe trip in under 20 minutes. The AI even knew which train passes we needed.",
  },
  {
    color: "#7F77DD",
    init: "J",
    name: "Jake T.",
    loc: "London → Hanoi",
    text: "I just said 'surprise me in Southeast Asia' and got the most incredible 12-day route through Vietnam and Cambodia.",
  },
  {
    color: "#D4537E",
    init: "A",
    name: "Aisha K.",
    loc: "Dubai → Kyoto",
    text: "Finally an app that understands I want culture AND good food without blowing my budget. Absolutely brilliant.",
  },
];

const AVATAR_LIST: [string, string][] = [
  ["#1D9E75", "R"],
  ["#7F77DD", "A"],
  ["#D85A30", "S"],
  ["#D4537E", "M"],
  ["#185FA5", "K"],
];

const STAT_LIST: [string, string][] = [
  ["40K+", "Travelers using Wandr"],
  ["120+", "Countries covered"],
  ["2 min", "Avg. itinerary build time"],
  ["4.9 ★", "Average user rating"],
];

const FOOTER_LINKS: string[] = [
  "Privacy",
  "Terms",
  "Support",
  "Twitter",
  "GitHub",
];
const NAV_LINKS: string[] = ["Features", "How it works", "Pricing", "Blog"];

// ─── Hook ──────────────────────────────────────────────────────────────────────
function useFadeIn(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ─── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ onCTA }: CTAProps): React.ReactElement {
  const navigate = useNavigate();
  return (
    <nav className="nav">
      <a className="logo" href="#">
        <div className="logo-icon">✈</div>
        <span className="logo-name">Wandr AI</span>
      </a>
      <div className="nav-links">
        {NAV_LINKS.map((l) => (
          <a key={l} className="nav-link" href="#">
            {l}
          </a>
        ))}
      </div>
      <div className="nav-cta">
        <button className="btn btn-outline" onClick={() => navigate("/login")}>
          Sign in
        </button>
        <button className="btn btn-green" onClick={() => navigate("/signup")}>
          Get started free
        </button>
      </div>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ onCTA }: CTAProps): React.ReactElement {
  return (
    <section className="hero">
      <svg
        className="hero-geo"
        viewBox="0 0 1200 560"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="600"
          cy="280"
          r="380"
          fill="none"
          stroke="#fff"
          strokeWidth="0.8"
        />
        <circle
          cx="600"
          cy="280"
          r="240"
          fill="none"
          stroke="#fff"
          strokeWidth="0.8"
        />
        <circle
          cx="600"
          cy="280"
          r="120"
          fill="none"
          stroke="#fff"
          strokeWidth="0.8"
        />
        <ellipse
          cx="600"
          cy="280"
          rx="380"
          ry="140"
          fill="none"
          stroke="#fff"
          strokeWidth="0.5"
        />
        <ellipse
          cx="600"
          cy="280"
          rx="380"
          ry="220"
          fill="none"
          stroke="#fff"
          strokeWidth="0.5"
        />
        <line
          x1="100"
          y1="280"
          x2="1100"
          y2="280"
          stroke="#fff"
          strokeWidth="0.5"
        />
        <line
          x1="600"
          y1="0"
          x2="600"
          y2="560"
          stroke="#fff"
          strokeWidth="0.5"
        />
      </svg>

      <div className="hero-badge">✦ Powered by AI · No itinerary stress</div>
      <h1 className="hero-h1">
        Travel smarter with your
        <br />
        <em>AI trip planner</em>
      </h1>
      <p className="hero-p">
        Tell us where you want to go. Our AI builds your full itinerary, finds
        the best spots, and keeps your budget on track — in seconds.
      </p>
      <div className="hero-actions">
        <button className="btn btn-hero" onClick={onCTA}>
          🚀 Plan my trip — it's free
        </button>
        <button className="btn btn-ghost-dark">▶ Watch demo</button>
      </div>
      <div className="hero-proof">
        <div className="avatars">
          {AVATAR_LIST.map(([bg, l]) => (
            <div key={l} className="av" style={{ background: bg }}>
              {l}
            </div>
          ))}
        </div>
        <div>
          <div className="proof-stars">★★★★★</div>
          <div className="proof-text">Loved by 40,000+ travelers worldwide</div>
        </div>
      </div>
    </section>
  );
}

// ─── Ticker ────────────────────────────────────────────────────────────────────
function Ticker(): React.ReactElement {
  const items: string[] = [...DESTINATIONS, ...DESTINATIONS];
  return (
    <div className="ticker-wrap" aria-hidden="true">
      <div className="ticker-track">
        {items.map((d, i) => (
          <span key={i} className="ticker-item">
            {d}
            {i < items.length - 1 && <span className="ticker-sep">·</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Stats ─────────────────────────────────────────────────────────────────────
function Stats(): React.ReactElement {
  const ref = useFadeIn();
  return (
    <div className="stats-strip fade-in" ref={ref}>
      {STAT_LIST.map(([n, l]) => (
        <div key={l} className="stat-cell">
          <div className="stat-num">{n}</div>
          <div className="stat-lbl">{l}</div>
        </div>
      ))}
    </div>
  );
}

// ─── How It Works ──────────────────────────────────────────────────────────────
function HowItWorks(): React.ReactElement {
  const ref = useFadeIn();
  return (
    <section className="section fade-in" ref={ref}>
      <div className="section-label">How it works</div>
      <h2 className="section-title">From idea to itinerary in minutes</h2>
      <p className="section-sub">
        No more 10-tab research rabbit holes. Wandr AI handles it all.
      </p>
      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.num} className="step">
            <div className="step-num">{s.num}</div>
            <div
              className="step-icon"
              style={{ background: s.bg, color: s.color }}
            >
              {s.icon}
            </div>
            <div className="step-title">{s.title}</div>
            <div className="step-desc">{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── AI Preview ────────────────────────────────────────────────────────────────
function AIPreview(): React.ReactElement {
  const ref = useFadeIn();
  return (
    <div className="preview-wrap fade-in" ref={ref}>
      <div className="preview-bar">
        <div className="bar-dots">
          <div className="bd" style={{ background: "#E24B4A" }} />
          <div className="bd" style={{ background: "#EF9F27" }} />
          <div className="bd" style={{ background: "#1D9E75" }} />
        </div>
        <span className="bar-label">Wandr AI — Live preview</span>
      </div>
      <div className="preview-body">
        <div className="preview-chat">
          <div className="chat-msg chat-ai">
            <div className="msg-lbl">Wandr AI</div>
            <div className="bubble">
              Hi! Where are you dreaming of going? Tell me the destination,
              dates, and how you love to travel ✈
            </div>
          </div>
          <div className="chat-msg chat-user">
            <div className="bubble">
              Tokyo for 10 days in October, two people, mix of culture and food,
              budget $3,500
            </div>
          </div>
          <div className="chat-msg chat-ai">
            <div className="msg-lbl">Wandr AI</div>
            <div className="bubble">
              Perfect timing — October is stunning in Tokyo with autumn foliage.
              I've drafted a 10-day itinerary across Tokyo and a day trip to
              Nikko. Here are your highlights 👇
            </div>
          </div>
        </div>
        <div className="preview-result">
          <div className="result-label">AI suggestions</div>
          {DESTINATIONS_PREVIEW.map((d) => (
            <div key={d.name} className="dest-card">
              <span className="dest-emoji">{d.emoji}</span>
              <div>
                <div className="dest-name">{d.name}</div>
                <div className="dest-tag">{d.tag}</div>
              </div>
              <span className="dest-score">{d.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Features ──────────────────────────────────────────────────────────────────
function Features(): React.ReactElement {
  const ref = useFadeIn();
  return (
    <section className="section section-alt fade-in" ref={ref}>
      <div className="section-label">Features</div>
      <h2 className="section-title">Everything your trip needs</h2>
      <div className="features-grid">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className={`feat-card${f.accent ? " accent" : ""}`}
          >
            <div
              className="feat-icon"
              style={{ background: f.bg, color: f.color }}
            >
              {f.icon}
            </div>
            <div className="feat-title">{f.title}</div>
            <div className="feat-desc">{f.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Testimonials ──────────────────────────────────────────────────────────────
function Testimonials(): React.ReactElement {
  const ref = useFadeIn();
  return (
    <section className="section fade-in" ref={ref}>
      <div className="section-label">Testimonials</div>
      <h2 className="section-title">Travelers love Wandr</h2>
      <div className="testi-grid">
        {TESTIMONIALS.map((t) => (
          <div key={t.name} className="testi">
            <div className="testi-stars">★★★★★</div>
            <p className="testi-text">"{t.text}"</p>
            <div className="testi-author">
              <div className="testi-av" style={{ background: t.color }}>
                {t.init}
              </div>
              <div>
                <div className="testi-name">{t.name}</div>
                <div className="testi-loc">{t.loc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA Section ───────────────────────────────────────────────────────────────
function CTASection({ onCTA }: CTAProps): React.ReactElement {
  const navigate = useNavigate();
  return (
    <section className="cta-section">
      <svg
        className="cta-geo"
        viewBox="0 0 1200 360"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="600"
          cy="180"
          r="300"
          fill="none"
          stroke="#fff"
          strokeWidth="0.8"
        />
        <circle
          cx="600"
          cy="180"
          r="180"
          fill="none"
          stroke="#fff"
          strokeWidth="0.8"
        />
        <ellipse
          cx="600"
          cy="180"
          rx="300"
          ry="100"
          fill="none"
          stroke="#fff"
          strokeWidth="0.5"
        />
      </svg>
      <h2 className="cta-title">Ready to plan your next adventure?</h2>
      <p className="cta-sub">
        Join 40,000+ travelers. Free to start, no credit card needed.
      </p>
      <div className="cta-btns">
        <button className="btn btn-hero" onClick={onCTA}>
          🚀 Start planning for free
        </button>
        <button
          className="btn btn-ghost-dark"
          onClick={() => navigate("/login")}
        >
          🔐 Sign in
        </button>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────
function Footer(): React.ReactElement {
  return (
    <footer className="footer">
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          className="logo-icon"
          style={{ width: "24px", height: "24px", fontSize: "12px" }}
        >
          ✈
        </div>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--green-muted)",
            opacity: 0.7,
          }}
        >
          Wandr AI
        </span>
      </div>
      <div className="footer-links">
        {FOOTER_LINKS.map((l) => (
          <a key={l} className="footer-link" href="#">
            {l}
          </a>
        ))}
      </div>
      <span className="footer-copy">© 2025 Wandr AI. All rights reserved.</span>
    </footer>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function HomePage(): React.ReactElement {
  const navigate = useNavigate();

  const handleCTA = (): void => {
    navigate("/signup");
  };

  return (
    <div className="wandr-root">
      <Navbar onCTA={handleCTA} />
      <Hero onCTA={handleCTA} />
      <Ticker />
      <Stats />
      <HowItWorks />
      <AIPreview />
      <Features />
      <Testimonials />
      <CTASection onCTA={handleCTA} />
      <Footer />
    </div>
  );
}
