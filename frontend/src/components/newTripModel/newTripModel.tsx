import React, { useState, useRef } from "react";
import "./newTripModel.css";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */

export type TripVisibility = "private" | "shared" | "public";
export type TripStatus = "planning" | "upcoming" | "ongoing" | "completed";

export interface TripForm {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  timezone: string;
  budget: number;
  currency: string;
  status: TripStatus;
  visibility: TripVisibility;
  travelers: string[];
  tags: string[];
}

interface Props {
  onClose: () => void;
  onCreate: (data: TripForm) => void;
}

/* ─────────────────────────────────────────
   Constants
───────────────────────────────────────── */

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "INR",
  "AUD",
  "CAD",
  "CHF",
  "SGD",
  "AED",
];
const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

const DEFAULT_FORM: TripForm = {
  title: "",
  destination: "",
  startDate: "",
  endDate: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  budget: 0,
  currency: "USD",
  status: "planning",
  visibility: "private",
  travelers: [],
  tags: [],
};

/* ─────────────────────────────────────────
   Component
───────────────────────────────────────── */

const NewTripModal: React.FC<Props> = ({ onClose, onCreate }) => {
  const [form, setForm] = useState<TripForm>(DEFAULT_FORM);
  const [tagInput, setTagInput] = useState("");
  const [travelerInput, setTravelerInput] = useState("");
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof TripForm>(key: K, value: TripForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* ── Tag helpers ── */
  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !form.tags.includes(t) && form.tags.length < 20) {
      set("tags", [...form.tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    set(
      "tags",
      form.tags.filter((t) => t !== tag),
    );

  /* ── Traveler helpers ── */
  const addTraveler = () => {
    const name = travelerInput.trim();
    if (name && !form.travelers.includes(name)) {
      set("travelers", [...form.travelers, name]);
    }
    setTravelerInput("");
  };

  const removeTraveler = (name: string) =>
    set(
      "travelers",
      form.travelers.filter((t) => t !== name),
    );

  /* ── Submit ── */
  const handleSubmit = () => {
    if (!form.title.trim()) return setError("Trip title is required.");
    if (!form.destination.trim()) return setError("Destination is required.");
    if (!form.startDate) return setError("Start date is required.");
    if (!form.endDate) return setError("End date is required.");
    if (new Date(form.endDate) < new Date(form.startDate))
      return setError("End date must be after start date.");
    if (!form.budget || form.budget <= 0)
      return setError("Budget must be greater than 0.");

    setError("");
    onCreate({ ...form, budget: Number(form.budget) });
  };

  /* Close on overlay click */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      className="tp-modal-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
    >
      <div className="tp-modal">
        <h2>Plan a New Trip</h2>

        {/* ── Title ── */}
        <div className="tp-field">
          <label>Title</label>
          <input
            placeholder="e.g. Golden Week in Japan"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>

        {/* ── Destination ── */}
        <div className="tp-field">
          <label>Destination</label>
          <input
            placeholder="e.g. Tokyo, Japan"
            value={form.destination}
            onChange={(e) => set("destination", e.target.value)}
          />
        </div>

        {/* ── Dates ── */}
        <div className="tp-row">
          <div className="tp-field">
            <label>Start Date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>
          <div className="tp-field">
            <label>End Date</label>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </div>
        </div>

        {/* ── Budget + Currency ── */}
        <div className="tp-row">
          <div className="tp-field" style={{ flex: 2 }}>
            <label>Budget</label>
            <input
              type="number"
              placeholder="0"
              min={0}
              value={form.budget || ""}
              onChange={(e) => set("budget", Number(e.target.value))}
            />
          </div>
          <div className="tp-field" style={{ flex: 1 }}>
            <label>Currency</label>
            <select
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Timezone ── */}
        <div className="tp-field">
          <label>Timezone</label>
          <select
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* ── Status + Visibility ── */}
        <div className="tp-row">
          <div className="tp-field">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value as TripStatus)}
            >
              <option value="planning">Planning</option>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="tp-field">
            <label>Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) =>
                set("visibility", e.target.value as TripVisibility)
              }
            >
              <option value="private">🔒 Private</option>
              <option value="shared">👥 Shared</option>
              <option value="public">🌐 Public</option>
            </select>
          </div>
        </div>

        {/* ── Travelers ── */}
        <div className="tp-field">
          <label>Travelers</label>
          <div className="tp-chip-input-row">
            <input
              placeholder="Add traveler name…"
              value={travelerInput}
              onChange={(e) => setTravelerInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.preventDefault(), addTraveler())
              }
            />
            <button type="button" className="tp-add-btn" onClick={addTraveler}>
              Add
            </button>
          </div>
          {form.travelers.length > 0 && (
            <div className="tp-chips">
              {form.travelers.map((name) => (
                <span key={name} className="tp-chip tp-chip--traveler">
                  {name}
                  <button onClick={() => removeTraveler(name)}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Tags ── */}
        <div className="tp-field">
          <label>Tags</label>
          <div className="tp-chip-input-row">
            <input
              placeholder="e.g. beach, solo, budget…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.preventDefault(), addTag())
              }
            />
            <button type="button" className="tp-add-btn" onClick={addTag}>
              Add
            </button>
          </div>
          {form.tags.length > 0 && (
            <div className="tp-chips">
              {form.tags.map((tag) => (
                <span key={tag} className="tp-chip tp-chip--tag">
                  #{tag}
                  <button onClick={() => removeTag(tag)}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && <p className="tp-error">{error}</p>}

        {/* ── Actions ── */}
        <div className="tp-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit}>
            Create Trip
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewTripModal;
