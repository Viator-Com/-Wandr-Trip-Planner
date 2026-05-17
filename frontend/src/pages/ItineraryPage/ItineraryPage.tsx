import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/SideBar/SideBar";
import {
  fetchTrip,
  updateTripFields,
  updateTripItinerary,
  getTrips,
  createTrip,
  deleteTrip,
} from "../../api/trips";
import NewTripModal from "../../components/newTripModel/newTripModel";
import type { TripForm } from "../../components/newTripModel/newTripModel";
import "./ItineraryPage.css";
import { fetchProfile } from "../../api/user";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */
import type { UserProfile } from "../../api/types";

export type ActivityCategory =
  | "food"
  | "transport"
  | "sightseeing"
  | "accommodation"
  | "leisure"
  | "shopping"
  | "other";
export type ActivityStatus = "planned" | "confirmed" | "cancelled";
export type TripStatus = "planning" | "upcoming" | "ongoing" | "completed";
export type TripVisibility = "private" | "shared" | "public";

interface ICoordinates {
  lat: number;
  lng: number;
}
interface ITraveler {
  name: string;
  userId?: string;
}

interface IItineraryActivity {
  description?: string;
  place?: string;
  coordinates?: ICoordinates;
  category?: ActivityCategory;
  status: ActivityStatus;
  startTime?: string;
  endTime?: string;
  cost?: number;
  bookingReference?: string;
  notes?: string;
}

interface IItineraryDay {
  day: number;
  date: Date;
  title?: string;
  accommodation?: string;
  estimatedCost?: number;
  activities: IItineraryActivity[];
}

interface ITrip {
  _id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  status: TripStatus;
  visibility: TripVisibility;
  budget: number;
  totalSpent: number;
  currency: string;
  travelers: ITraveler[];
  tags: string[];
  itinerary: IItineraryDay[];
}

/* ─────────────────────────────────────────
   Config maps
───────────────────────────────────────── */

const CATEGORY_CONFIG: Record<
  ActivityCategory,
  { icon: string; label: string; color: string; bg: string }
> = {
  food: {
    icon: "🍜",
    label: "Food & Drink",
    color: "#E8633A",
    bg: "rgba(232,99,58,0.1)",
  },
  transport: {
    icon: "🚄",
    label: "Transport",
    color: "#3A7BD5",
    bg: "rgba(58,123,213,0.1)",
  },
  sightseeing: {
    icon: "🏯",
    label: "Sightseeing",
    color: "#2EAA76",
    bg: "rgba(46,170,118,0.1)",
  },
  accommodation: {
    icon: "🏨",
    label: "Accommodation",
    color: "#8B5E3C",
    bg: "rgba(139,94,60,0.1)",
  },
  leisure: {
    icon: "🎌",
    label: "Leisure",
    color: "#9B59B6",
    bg: "rgba(155,89,182,0.1)",
  },
  shopping: {
    icon: "🛍️",
    label: "Shopping",
    color: "#D4A96A",
    bg: "rgba(212,169,106,0.1)",
  },
  other: {
    icon: "📌",
    label: "Other",
    color: "#7F8C8D",
    bg: "rgba(127,140,141,0.1)",
  },
};

const STATUS_CONFIG: Record<
  ActivityStatus,
  { label: string; color: string; bg: string }
> = {
  planned: { label: "Planned", color: "#8B7355", bg: "rgba(139,115,85,0.1)" },
  confirmed: {
    label: "Confirmed",
    color: "#2EAA76",
    bg: "rgba(46,170,118,0.12)",
  },
  cancelled: {
    label: "Cancelled",
    color: "#C0392B",
    bg: "rgba(192,57,43,0.1)",
  },
};

const TRIP_STATUS_CONFIG: Record<
  TripStatus,
  { label: string; color: string; bg: string }
> = {
  planning: {
    label: "Planning",
    color: "#D4A96A",
    bg: "rgba(212,169,106,0.15)",
  },
  upcoming: {
    label: "Upcoming",
    color: "#3A7BD5",
    bg: "rgba(58,123,213,0.12)",
  },
  ongoing: { label: "Ongoing", color: "#2EAA76", bg: "rgba(46,170,118,0.12)" },
  completed: {
    label: "Completed",
    color: "#8B7355",
    bg: "rgba(139,115,85,0.1)",
  },
};

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function getDuration(start: Date, end: Date): number {
  return (
    Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1
  );
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const BLANK_ACTIVITY: IItineraryActivity = {
  description: "",
  place: "",
  category: "other",
  status: "planned",
  startTime: "",
  endTime: "",
  cost: 0,
  bookingReference: "",
  notes: "",
  coordinates: undefined,
};

/* ─────────────────────────────────────────
   Reusable edit primitives
───────────────────────────────────────── */

function EditableInput({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  step,
  min,
  max,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <input
      className={`editable-input ${className}`}
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function EditableSelect<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <select
      className={`editable-select ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ─────────────────────────────────────────
   ActivityCard
───────────────────────────────────────── */

function ActivityCard({
  activity: act,
  index,
  currency,
  editMode,
  onUpdate,
  onDelete,
}: {
  activity: IItineraryActivity;
  index: number;
  currency: string;
  editMode: boolean;
  onUpdate: (u: IItineraryActivity) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catCfg = CATEGORY_CONFIG[act.category ?? "other"];
  const stsCfg = STATUS_CONFIG[act.status];
  const set = useCallback(
    <K extends keyof IItineraryActivity>(key: K, val: IItineraryActivity[K]) =>
      onUpdate({ ...act, [key]: val }),
    [act, onUpdate],
  );

  const hasCoords =
    act.coordinates != null &&
    act.coordinates.lat !== undefined &&
    act.coordinates.lng !== undefined;

  const setLat = (v: string) => {
    const lat = parseFloat(v);
    if (isNaN(lat)) return;
    set("coordinates", { lat, lng: act.coordinates?.lng ?? 0 });
  };

  const setLng = (v: string) => {
    const lng = parseFloat(v);
    if (isNaN(lng)) return;
    set("coordinates", { lat: act.coordinates?.lat ?? 0, lng });
  };

  const clearCoords = () => set("coordinates", undefined);

  const openMap = () => {
    if (!hasCoords) return;
    window.open(
      `https://www.google.com/maps?q=${act.coordinates!.lat},${act.coordinates!.lng}`,
      "_blank",
    );
  };

  return (
    <div
      className={`activity-card${act.status === "cancelled" ? " cancelled" : ""}${editMode ? " edit-mode" : ""}`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="activity-card-header">
        {editMode ? (
          <EditableSelect
            value={act.category ?? "other"}
            options={Object.entries(CATEGORY_CONFIG).map(([v, c]) => ({
              value: v as ActivityCategory,
              label: `${c.icon} ${c.label}`,
            }))}
            onChange={(v) => set("category", v)}
            className="cat-select"
          />
        ) : (
          <div className="cat-icon" style={{ background: catCfg.bg }}>
            {catCfg.icon}
          </div>
        )}

        <div className="activity-main">
          <div className="activity-title-row">
            {editMode ? (
              <EditableInput
                value={act.description ?? ""}
                onChange={(v) => set("description", v)}
                placeholder="Activity description…"
                className="desc-input"
              />
            ) : (
              act.description && (
                <span className="activity-desc-text">{act.description}</span>
              )
            )}
            {editMode ? (
              <EditableSelect
                value={act.status}
                options={[
                  { value: "planned", label: "Planned" },
                  { value: "confirmed", label: "Confirmed" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
                onChange={(v) => set("status", v)}
                className="status-select"
              />
            ) : (
              <span
                className="act-status-badge"
                style={{ background: stsCfg.bg, color: stsCfg.color }}
              >
                {stsCfg.label}
              </span>
            )}
          </div>
          {editMode ? (
            <EditableInput
              value={act.place ?? ""}
              onChange={(v) => set("place", v)}
              placeholder="Place / location…"
              className="place-input"
            />
          ) : (
            act.place && (
              <div className="activity-place-row">
                <span className="place-dot" />
                {act.place}
              </div>
            )
          )}
        </div>

        <div className="activity-right">
          {editMode ? (
            <div className="time-edit-row">
              <EditableInput
                value={act.startTime ?? ""}
                onChange={(v) => set("startTime", v)}
                type="time"
                className="time-input"
              />
              <span className="time-sep">→</span>
              <EditableInput
                value={act.endTime ?? ""}
                onChange={(v) => set("endTime", v)}
                type="time"
                className="time-input"
              />
            </div>
          ) : (
            act.startTime && (
              <div className="time-block">
                {formatTime(act.startTime)}
                {act.endTime && (
                  <div className="time-range">→ {formatTime(act.endTime)}</div>
                )}
              </div>
            )
          )}
          {editMode ? (
            <div className="cost-edit-row">
              <span className="cost-currency-label">{currency}</span>
              <EditableInput
                value={act.cost ?? 0}
                onChange={(v) => set("cost", Number(v))}
                type="number"
                className="cost-input"
                placeholder="0"
              />
            </div>
          ) : (
            act.cost !== undefined && (
              <span className={`cost-tag${act.cost === 0 ? " free" : ""}`}>
                {act.cost === 0 ? "Free" : `${currency} ${act.cost}`}
              </span>
            )
          )}
        </div>

        {editMode ? (
          <button
            className="delete-btn"
            onClick={onDelete}
            title="Remove activity"
          >
            ✕
          </button>
        ) : (
          <div
            className={`expand-chevron${expanded ? " open" : ""}`}
            onClick={() => setExpanded((p) => !p)}
          >
            ▾
          </div>
        )}
      </div>

      {(expanded || editMode) && (
        <div className="activity-detail">
          <div className="detail-item full-width">
            <label>Notes</label>
            {editMode ? (
              <textarea
                className="editable-textarea"
                value={act.notes ?? ""}
                placeholder="Add notes, tips, reminders…"
                onChange={(e) => set("notes", e.target.value)}
              />
            ) : (
              <p>{act.notes || <em style={{ opacity: 0.4 }}>No notes</em>}</p>
            )}
          </div>

          <div className="detail-item">
            <label>Booking Reference</label>
            {editMode ? (
              <EditableInput
                value={act.bookingReference ?? ""}
                onChange={(v) => set("bookingReference", v)}
                placeholder="e.g. ABC-12345"
              />
            ) : act.bookingReference ? (
              <span className="booking-ref">{act.bookingReference}</span>
            ) : (
              <p>
                <em style={{ opacity: 0.4 }}>None</em>
              </p>
            )}
          </div>

          <div className={`detail-item${editMode ? " coords-required" : ""}`}>
            <label>
              📍 Coordinates
              {editMode && <span className="coords-required-star"> *</span>}
            </label>

            {editMode ? (
              <div className="coords-edit-wrapper">
                <div className="coords-edit-row">
                  <div className="coord-field">
                    <span className="coord-axis-label">LAT</span>
                    <EditableInput
                      value={act.coordinates?.lat ?? ""}
                      onChange={setLat}
                      type="number"
                      step="0.000001"
                      min="-90"
                      max="90"
                      placeholder="e.g. 28.6139"
                      className="coord-input"
                    />
                  </div>
                  <div className="coord-field">
                    <span className="coord-axis-label">LNG</span>
                    <EditableInput
                      value={act.coordinates?.lng ?? ""}
                      onChange={setLng}
                      type="number"
                      step="0.000001"
                      min="-180"
                      max="180"
                      placeholder="e.g. 77.2090"
                      className="coord-input"
                    />
                  </div>
                  {hasCoords && (
                    <button
                      className="coord-clear-btn"
                      onClick={clearCoords}
                      title="Clear coordinates"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {hasCoords ? (
                  <div className="coords-set-indicator">
                    <span className="coords-set-dot" />
                    <span>
                      {act.coordinates!.lat.toFixed(5)},{" "}
                      {act.coordinates!.lng.toFixed(5)}
                    </span>
                    <button
                      className="coords-map-link"
                      onClick={openMap}
                      title="Preview on Google Maps"
                    >
                      View on map ↗
                    </button>
                  </div>
                ) : (
                  <p className="coords-missing-hint">
                    ⚠ Coordinates are required for weather tracking and map
                    features.
                  </p>
                )}
              </div>
            ) : hasCoords ? (
              <div className="coords-view-row">
                <span className="coords-value">
                  {act.coordinates!.lat.toFixed(5)},{" "}
                  {act.coordinates!.lng.toFixed(5)}
                </span>
                <button className="coords-map-link" onClick={openMap}>
                  View on map ↗
                </button>
              </div>
            ) : (
              <p className="coords-not-set">
                <em>Not set</em>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   AddDaysBanner
───────────────────────────────────────── */

function AddDaysBanner({
  missingCount,
  onAddDays,
  adding,
}: {
  missingCount: number;
  onAddDays: (n: number) => void;
  adding: boolean;
}) {
  return (
    <div className="add-days-banner">
      <div className="add-days-banner__icon">📅</div>
      <div className="add-days-banner__text">
        <strong>
          {missingCount} day{missingCount > 1 ? "s" : ""} missing
        </strong>
        <span>Your trip duration is longer than the planned itinerary.</span>
      </div>
      <div className="add-days-banner__actions">
        <button
          className="add-days-btn add-days-btn--primary"
          onClick={() => onAddDays(missingCount)}
          disabled={adding}
        >
          {adding
            ? "Adding…"
            : `+ Add all ${missingCount} day${missingCount > 1 ? "s" : ""}`}
        </button>
        {missingCount > 1 && (
          <button
            className="add-days-btn add-days-btn--secondary"
            onClick={() => onAddDays(1)}
            disabled={adding}
          >
            + Add 1 day
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Page
───────────────────────────────────────── */

export default function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();

  const [sidebarTrips, setSidebarTrips] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNewTrip, setShowNewTrip] = useState(false);

  const [activeTrip, setActiveTrip] = useState<ITrip | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [activeDay, setActiveDay] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<ITrip | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [newTag, setNewTag] = useState("");

  const [addingDays, setAddingDays] = useState(false);
  const [addDaysError, setAddDaysError] = useState("");

  const [profile, setProfile] = useState<UserProfile | null>(null);

  const sidebarUser = profile
    ? { name: profile.name, email: profile.email }
    : undefined;

  useEffect(() => {
    (async () => {
      const [profileRes] = await Promise.allSettled([fetchProfile()]);

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

      // if (tripsRes.status === "fulfilled") {
      //   setTrips(tripsRes.value);
      // }

      // setLoadingProfile(false);
    })();
  }, []);

  useEffect(() => {
    getTrips()
      .then((data: any[]) =>
        setSidebarTrips(data.map((t) => ({ ...t, _id: String(t._id) }))),
      )
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!tripId) return;
    setLoading(true);
    setFetchError("");
    setActiveTrip(null);
    setDraft(null);
    fetchTrip(tripId)
      .then((t) => {
        setActiveTrip(t);
        setDraft(deepClone(t));
        setActiveDay(t.itinerary[0]?.day ?? 1);
        setEditMode(false);
      })
      .catch((err) =>
        setFetchError(
          err.response?.data?.message ?? err.message ?? "Failed to load trip",
        ),
      )
      .finally(() => setLoading(false));
  }, [tripId]);

  const handleCreateTrip = async (data: TripForm) => {
    try {
      const created = await createTrip(data);
      const normalised = { ...created, _id: String(created._id) };
      setSidebarTrips((prev) => [normalised, ...prev]);
      setShowNewTrip(false);
      navigate(`/itinerary/${normalised._id}`);
    } catch (err) {
      console.error("Trip creation failed:", err);
    }
  };

  const handleDeleteTrip = async (deletedId: string) => {
    try {
      await deleteTrip(deletedId);
      setSidebarTrips((prev) => prev.filter((t) => t._id !== deletedId));
      // If currently viewing the deleted trip, clear state and go home
      if (deletedId === tripId) {
        setActiveTrip(null);
        setDraft(null);
        navigate("/");
      }
    } catch (err) {
      console.error("Trip deletion failed:", err);
    }
  };

  const handleSave = async () => {
    if (!draft || !tripId) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateTripItinerary(tripId, draft.itinerary);
      const updated = await updateTripFields(tripId, {
        title: draft.title,
        destination: draft.destination,
        timezone: draft.timezone,
        status: draft.status,
        visibility: draft.visibility,
        budget: draft.budget,
        currency: draft.currency,
        travelers: draft.travelers,
        tags: draft.tags,
      });
      setActiveTrip(updated);
      setDraft(deepClone(updated));
      setSidebarTrips((prev) =>
        prev.map((t) =>
          t._id === updated._id
            ? { ...t, title: updated.title, status: updated.status }
            : t,
        ),
      );
      setSaved(true);
      setEditMode(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err.response?.data?.message ?? err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(deepClone(activeTrip));
    setEditMode(false);
    setSaveError("");
  };

  const handleAddDays = async (count: number) => {
    if (!activeTrip || !tripId) return;
    setAddingDays(true);
    setAddDaysError("");

    try {
      const existing = activeTrip.itinerary;
      const lastDay = existing[existing.length - 1];
      const lastDayNum = lastDay?.day ?? 0;
      const lastDate = lastDay
        ? new Date(lastDay.date)
        : new Date(activeTrip.startDate);

      const newDays: IItineraryDay[] = Array.from(
        { length: count },
        (_, i) => ({
          day: lastDayNum + i + 1,
          date: addDays(lastDate, i + 1),
          title: `Day ${lastDayNum + i + 1}`,
          activities: [],
        }),
      );

      const updated = await updateTripItinerary(tripId, [
        ...existing,
        ...newDays,
      ]);
      setActiveTrip(updated);
      setDraft(deepClone(updated));
      setActiveDay(lastDayNum + 1);
    } catch (err: any) {
      setAddDaysError(
        err.response?.data?.message ?? err.message ?? "Failed to add days",
      );
    } finally {
      setAddingDays(false);
    }
  };

  const setTripField = <K extends keyof ITrip>(key: K, val: ITrip[K]) =>
    setDraft((p) => (p ? { ...p, [key]: val } : p));

  const updateDay = useCallback(
    (dayNum: number, patch: Partial<IItineraryDay>) =>
      setDraft((p) =>
        p
          ? {
              ...p,
              itinerary: p.itinerary.map((d) =>
                d.day === dayNum ? { ...d, ...patch } : d,
              ),
            }
          : p,
      ),
    [],
  );

  const updateActivity = useCallback(
    (dayNum: number, idx: number, updated: IItineraryActivity) =>
      setDraft((p) =>
        p
          ? {
              ...p,
              itinerary: p.itinerary.map((d) =>
                d.day === dayNum
                  ? {
                      ...d,
                      activities: d.activities.map((a, i) =>
                        i === idx ? updated : a,
                      ),
                    }
                  : d,
              ),
            }
          : p,
      ),
    [],
  );

  const deleteActivity = useCallback(
    (dayNum: number, idx: number) =>
      setDraft((p) =>
        p
          ? {
              ...p,
              itinerary: p.itinerary.map((d) =>
                d.day === dayNum
                  ? {
                      ...d,
                      activities: d.activities.filter((_, i) => i !== idx),
                    }
                  : d,
              ),
            }
          : p,
      ),
    [],
  );

  const addActivity = useCallback(
    (dayNum: number) =>
      setDraft((p) =>
        p
          ? {
              ...p,
              itinerary: p.itinerary.map((d) =>
                d.day === dayNum
                  ? {
                      ...d,
                      activities: [...d.activities, { ...BLANK_ACTIVITY }],
                    }
                  : d,
              ),
            }
          : p,
      ),
    [],
  );

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && draft && !draft.tags.includes(t))
      setDraft((p) => (p ? { ...p, tags: [...p.tags, t] } : p));
    setNewTag("");
  };
  const removeTag = (tag: string) =>
    setDraft((p) => (p ? { ...p, tags: p.tags.filter((t) => t !== tag) } : p));

  const trip = editMode && draft ? draft : activeTrip;

  return (
    <div className="tp-app">
      {showNewTrip && (
        <NewTripModal
          onClose={() => setShowNewTrip(false)}
          onCreate={handleCreateTrip}
        />
      )}

      <Sidebar
        trips={sidebarTrips}
        activeTrip={sidebarTrips.find((t) => t._id === tripId) ?? null}
        setActiveTrip={(t: any) => navigate(`/itinerary/${t._id}`)}
        onNewTrip={() => setShowNewTrip(true)}
        sidebarOpen={sidebarOpen}
        user={sidebarUser}
        onDeleteTrip={handleDeleteTrip}
      />

      <main className={`tp-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        {/* Top bar */}
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
          {trip && (
            <div className="tp-trip-title">
              <span className="trip-icon">✦</span>
              <h2>{trip.title}</h2>
            </div>
          )}
        </header>

        {loading && (
          <div className="chat-empty">
            <div className="empty-icon">✦</div>
            <p>Loading trip…</p>
          </div>
        )}
        {!loading && fetchError && (
          <div className="chat-empty">
            <div className="empty-icon">⚠️</div>
            <p>{fetchError}</p>
          </div>
        )}
        {!loading && !fetchError && !trip && (
          <div className="chat-empty">
            <div className="empty-icon">✦</div>
            <p>Select a trip from the sidebar</p>
          </div>
        )}

        {!loading &&
          !fetchError &&
          trip &&
          (() => {
            const duration = getDuration(trip.startDate, trip.endDate);
            const itineraryDays = trip.itinerary.length;
            const missingDays = duration - itineraryDays;
            const currentDay =
              trip.itinerary.find((d) => d.day === activeDay) ??
              trip.itinerary[0];
            const budgetPct = Math.min(
              (trip.totalSpent / trip.budget) * 100,
              100,
            );
            const tripStatusCfg = TRIP_STATUS_CONFIG[trip.status];
            const firstDay = trip.itinerary[0]?.day ?? 1;
            const lastDay = trip.itinerary[trip.itinerary.length - 1]?.day ?? 1;
            const titleWords = trip.title.split(" ");
            const titleMain = titleWords.slice(0, -1).join(" ");
            const titleLast = titleWords.slice(-1)[0];

            return (
              <>
                {/* ── HERO ── */}
                <div className="hero">
                  <div className="hero-inner">
                    <div className="edit-bar">
                      {!editMode ? (
                        <button
                          className="edit-toggle-btn"
                          onClick={() => {
                            setDraft(deepClone(activeTrip!));
                            setEditMode(true);
                          }}
                        >
                          ✏️ Edit Itinerary
                        </button>
                      ) : (
                        <div className="edit-actions">
                          <button
                            className="save-btn"
                            onClick={handleSave}
                            disabled={saving}
                          >
                            {saving ? "Saving…" : "✓ Save Changes"}
                          </button>
                          <button className="cancel-btn" onClick={handleCancel}>
                            ✕ Cancel
                          </button>
                        </div>
                      )}
                      {saved && (
                        <span className="saved-toast">
                          ✓ Saved successfully
                        </span>
                      )}
                      {saveError && (
                        <span className="save-error">⚠ {saveError}</span>
                      )}
                    </div>

                    <div className="hero-top">
                      <div style={{ flex: 1 }}>
                        <div className="hero-tag">
                          <span>✦</span> Trip Itinerary
                        </div>

                        {editMode && draft ? (
                          <EditableInput
                            value={draft.title}
                            onChange={(v) => setTripField("title", v)}
                            placeholder="Trip title…"
                            className="hero-title-input"
                          />
                        ) : (
                          <h1>
                            {titleMain} <em>{titleLast}</em>
                          </h1>
                        )}

                        <div className="hero-sub">
                          {editMode && draft ? (
                            <>
                              <EditableInput
                                value={draft.destination}
                                onChange={(v) => setTripField("destination", v)}
                                placeholder="Destination"
                                className="hero-sub-input"
                              />
                              <EditableInput
                                value={draft.timezone}
                                onChange={(v) => setTripField("timezone", v)}
                                placeholder="Timezone"
                                className="hero-sub-input"
                              />
                              <EditableSelect
                                value={draft.visibility}
                                options={[
                                  { value: "private", label: "🔒 Private" },
                                  { value: "shared", label: "👥 Shared" },
                                  { value: "public", label: "🌐 Public" },
                                ]}
                                onChange={(v) => setTripField("visibility", v)}
                                className="hero-sub-select"
                              />
                            </>
                          ) : (
                            <>
                              <span>📍 {trip.destination}</span>
                              <span>🕐 {trip.timezone}</span>
                              <span>👁 {trip.visibility}</span>
                            </>
                          )}
                        </div>

                        <div className="hero-badges">
                          {editMode && draft ? (
                            <EditableSelect
                              value={draft.status}
                              options={[
                                { value: "planning", label: "Planning" },
                                { value: "upcoming", label: "Upcoming" },
                                { value: "ongoing", label: "Ongoing" },
                                { value: "completed", label: "Completed" },
                              ]}
                              onChange={(v) => setTripField("status", v)}
                              className="status-select-hero"
                            />
                          ) : (
                            <span
                              className="hero-badge"
                              style={{
                                background: tripStatusCfg.bg,
                                color: tripStatusCfg.color,
                                border: `1px solid ${tripStatusCfg.color}33`,
                              }}
                            >
                              ● {tripStatusCfg.label}
                            </span>
                          )}

                          {(editMode && draft ? draft : trip).tags.map(
                            (tag) => (
                              <span key={tag} className="hero-badge tag-badge">
                                #{tag}
                                {editMode && (
                                  <button
                                    className="tag-remove"
                                    onClick={() => removeTag(tag)}
                                  >
                                    ✕
                                  </button>
                                )}
                              </span>
                            ),
                          )}

                          {editMode && (
                            <div className="tag-add-row">
                              <input
                                className="tag-input"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addTag()}
                                placeholder="+ add tag"
                              />
                              <button className="tag-add-btn" onClick={addTag}>
                                Add
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="hero-right">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span className="traveler-label">TRAVELERS</span>
                          <div className="traveler-avatars">
                            {(editMode && draft ? draft : trip).travelers.map(
                              (t) => (
                                <div
                                  key={t.name}
                                  className="traveler-chip"
                                  title={t.name}
                                >
                                  {t.name[0]}
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="hero-stats">
                      <div className="stat-item">
                        <span className="stat-value">{duration}</span>
                        <span className="stat-label">Days</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value">
                          {formatDate(trip.startDate)}
                        </span>
                        <span className="stat-label">Departure</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value">
                          {formatDate(trip.endDate)}
                        </span>
                        <span className="stat-label">Return</span>
                      </div>
                      <div className="stat-item">
                        {editMode && draft ? (
                          <div className="stat-edit-row">
                            <EditableInput
                              value={draft.currency}
                              onChange={(v) =>
                                setTripField("currency", v.toUpperCase())
                              }
                              className="currency-input"
                              placeholder="USD"
                            />
                            <EditableInput
                              value={draft.budget}
                              onChange={(v) =>
                                setTripField("budget", Number(v))
                              }
                              type="number"
                              className="budget-input"
                            />
                          </div>
                        ) : (
                          <span className="stat-value">
                            {trip.currency} {trip.budget.toLocaleString()}
                          </span>
                        )}
                        <span className="stat-label">Total Budget</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value">
                          {trip.currency} {trip.totalSpent.toLocaleString()}
                        </span>
                        <span className="stat-label">Spent So Far</span>
                      </div>
                    </div>

                    <div className="budget-row">
                      <div className="budget-bar-label">
                        <span>Budget used</span>
                        <span>{Math.round(budgetPct)}%</span>
                      </div>
                      <div className="budget-track">
                        <div
                          className="budget-fill"
                          style={{ width: `${budgetPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── MISSING DAYS BANNER ── */}
                {missingDays > 0 && !editMode && (
                  <div className="add-days-banner-wrapper">
                    <AddDaysBanner
                      missingCount={missingDays}
                      onAddDays={handleAddDays}
                      adding={addingDays}
                    />
                    {addDaysError && (
                      <p className="add-days-error">⚠ {addDaysError}</p>
                    )}
                  </div>
                )}

                {/* ── BODY ── */}
                <div className="page-body">
                  <aside className="sidebar">
                    <div className="sidebar-section-label">Journey Days</div>
                    {trip.itinerary.map((d) => (
                      <button
                        key={d.day}
                        className={`day-btn${activeDay === d.day ? " active" : ""}`}
                        onClick={() => setActiveDay(d.day)}
                      >
                        <div className="day-num-circle">{d.day}</div>
                        <div className="day-btn-meta">
                          <div className="day-btn-date">
                            {new Date(d.date).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="day-btn-title">
                            {d.title ?? `Day ${d.day}`}
                          </div>
                        </div>
                        {(d.estimatedCost ?? 0) > 0 && (
                          <div
                            className="day-cost-dot"
                            title={`~${trip.currency}${d.estimatedCost}`}
                          />
                        )}
                        <div className="day-act-count">
                          {d.activities.length}
                        </div>
                      </button>
                    ))}

                    {editMode && missingDays > 0 && (
                      <button
                        className="sidebar-add-day-btn"
                        onClick={() => handleAddDays(1)}
                        disabled={addingDays}
                      >
                        {addingDays
                          ? "Adding…"
                          : `+ Add Day ${trip.itinerary.length + 1}`}
                      </button>
                    )}
                  </aside>

                  <main>
                    {currentDay ? (
                      <>
                        <div className="day-heading-row">
                          <div className="day-big-num">
                            {String(currentDay.day).padStart(2, "0")}
                          </div>
                          <div className="day-heading-text">
                            {editMode ? (
                              <EditableInput
                                value={currentDay.title ?? ""}
                                onChange={(v) =>
                                  updateDay(currentDay.day, { title: v })
                                }
                                placeholder="Day title…"
                                className="day-title-input"
                              />
                            ) : (
                              <h2>
                                {currentDay.title ?? `Day ${currentDay.day}`}
                              </h2>
                            )}
                            <div className="day-date-str">
                              {new Date(currentDay.date).toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="day-meta-row">
                          {editMode ? (
                            <>
                              <div className="meta-edit-field">
                                <span className="meta-edit-icon">🏨</span>
                                <EditableInput
                                  value={currentDay.accommodation ?? ""}
                                  onChange={(v) =>
                                    updateDay(currentDay.day, {
                                      accommodation: v,
                                    })
                                  }
                                  placeholder="Accommodation…"
                                  className="meta-input"
                                />
                              </div>
                              <div className="meta-edit-field">
                                <span className="meta-edit-icon">💰 Est.</span>
                                <EditableInput
                                  value={currentDay.estimatedCost ?? 0}
                                  onChange={(v) =>
                                    updateDay(currentDay.day, {
                                      estimatedCost: Number(v),
                                    })
                                  }
                                  type="number"
                                  placeholder="0"
                                  className="meta-input meta-cost-input"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              {currentDay.accommodation && (
                                <span className="meta-pill accommodation-pill">
                                  🏨 {currentDay.accommodation}
                                </span>
                              )}
                              {currentDay.estimatedCost !== undefined && (
                                <span className="meta-pill cost-pill">
                                  💰 Est. {trip.currency}{" "}
                                  {currentDay.estimatedCost}
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        <div className="section-divider" />

                        <div key={activeDay}>
                          {currentDay.activities.length > 0 ? (
                            currentDay.activities.map((act, i) => (
                              <ActivityCard
                                key={`${activeDay}-${i}`}
                                activity={act}
                                index={i}
                                currency={trip.currency}
                                editMode={editMode}
                                onUpdate={(updated) =>
                                  updateActivity(currentDay.day, i, updated)
                                }
                                onDelete={() =>
                                  deleteActivity(currentDay.day, i)
                                }
                              />
                            ))
                          ) : (
                            <div className="empty-state">
                              No activities planned for this day yet.
                            </div>
                          )}
                          {editMode && (
                            <button
                              className="add-activity-btn"
                              onClick={() => addActivity(currentDay.day)}
                            >
                              + Add Activity
                            </button>
                          )}
                        </div>

                        {!editMode && (
                          <div className="nav-row">
                            <button
                              className="nav-btn"
                              onClick={() => setActiveDay((d) => d - 1)}
                              disabled={activeDay <= firstDay}
                            >
                              ← Previous Day
                            </button>
                            <button
                              className="nav-btn"
                              onClick={() => setActiveDay((d) => d + 1)}
                              disabled={activeDay >= lastDay}
                            >
                              Next Day →
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="empty-state">
                        Select a day to view its itinerary.
                      </div>
                    )}
                  </main>
                </div>
              </>
            );
          })()}
      </main>
    </div>
  );
}
