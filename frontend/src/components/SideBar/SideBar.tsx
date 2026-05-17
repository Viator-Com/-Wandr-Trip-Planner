import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Sidebar.css";

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */

interface Trip {
  _id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  status?: string;
}

interface SidebarProps {
  trips: Trip[];
  activeTrip: Trip | null;
  setActiveTrip: (trip: Trip) => void;
  onNewTrip: () => void;
  onDeleteTrip: (tripId: string) => void; // ← NEW
  sidebarOpen: boolean;
  user?: { name: string; email: string; avatarUrl?: string };
}

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

function formatDateRange(start?: string, end?: string): string {
  if (!start) return "";
  const s = new Date(start).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  if (!end) return s;
  const e = new Date(end).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${s} – ${e}`;
}

/* ─────────────────────────────────────────
   Component
───────────────────────────────────────── */

const Sidebar: React.FC<SidebarProps> = ({
  trips,
  activeTrip,
  setActiveTrip,
  onNewTrip,
  onDeleteTrip, // ← NEW
  sidebarOpen,
  user,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [expandedId, setExpandedId] = useState<string | null>(() => {
    const match = location.pathname.match(/\/(chat|itinerary)\/([^/]+)/);
    return match ? match[2] : null;
  });

  // Tracks which trip is showing the "Confirm delete?" prompt
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleTripClick = (trip: Trip) => {
    setActiveTrip(trip);
    const isExpanding = expandedId !== trip._id;
    setExpandedId(isExpanding ? trip._id : null);
    // Dismiss any pending delete if user taps a different row
    if (pendingDeleteId && pendingDeleteId !== trip._id) {
      setPendingDeleteId(null);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation(); // Don't expand the trip row
    setPendingDeleteId(tripId);
  };

  const handleConfirmDelete = (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation();
    onDeleteTrip(tripId);
    setPendingDeleteId(null);
    // If deleting the currently active/expanded trip, collapse
    if (expandedId === tripId) setExpandedId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(null);
  };

  const isRouteActive = (path: string) => location.pathname === path;

  return (
    <aside className={`tp-sidebar ${sidebarOpen ? "" : "tp-closed"}`}>
      {/* ── Header ── */}
      <div className="tp-sidebar-header">
        <div className="tp-logo">✈ Wandr</div>
      </div>

      {/* ── New Trip ── */}
      <button className="tp-new-trip-btn" onClick={onNewTrip}>
        + New Trip
      </button>

      <div className="tp-trips-label">Your Trips</div>

      {/* ── Trip list ── */}
      <div className="tp-trips-list">
        {trips.map((trip) => {
          const isActive = activeTrip?._id === trip._id;
          const isExpanded = expandedId === trip._id;
          const isPendingDelete = pendingDeleteId === trip._id;
          const chatPath = `/chat/${trip._id}`;
          const itinPath = `/itinerary/${trip._id}`;

          return (
            <div key={trip._id} className="tp-trip-group">
              {/* ── Trip row ── */}
              <div
                className={`tp-trip-item ${isActive ? "tp-active" : ""}`}
                onClick={() => handleTripClick(trip)}
              >
                <div className="tp-trip-row-inner">
                  <div className="tp-trip-info">
                    <div className="tp-trip-name">{trip.title}</div>
                    <div className="tp-trip-meta">
                      {formatDateRange(trip.startDate, trip.endDate)}
                      {trip.budget
                        ? ` · ${trip.currency ?? "$"}${Number(trip.budget).toLocaleString()}`
                        : ""}
                    </div>
                  </div>

                  <div className="tp-trip-actions">
                    {/* Delete button — visible on hover via CSS */}
                    <button
                      className="tp-delete-btn"
                      title="Delete trip"
                      onClick={(e) => handleDeleteClick(e, trip._id)}
                      aria-label={`Delete ${trip.title}`}
                    >
                      🗑
                    </button>

                    {/* Chevron */}
                    <span
                      className={`tp-chevron ${isExpanded ? "tp-chevron--open" : ""}`}
                    >
                      ›
                    </span>
                  </div>
                </div>

                {/* ── Inline confirm bar ── */}
                {isPendingDelete && (
                  <div
                    className="tp-delete-confirm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="tp-delete-confirm-text">Delete trip?</span>
                    <button
                      className="tp-delete-confirm-btn tp-delete-confirm-btn--yes"
                      onClick={(e) => handleConfirmDelete(e, trip._id)}
                    >
                      Delete
                    </button>
                    <button
                      className="tp-delete-confirm-btn tp-delete-confirm-btn--no"
                      onClick={handleCancelDelete}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* ── Sub-nav (chat / itinerary) ── */}
              {isExpanded && (
                <div className="tp-subnav">
                  <button
                    className={`tp-subnav-btn ${isRouteActive(chatPath) ? "tp-subnav-btn--active" : ""}`}
                    onClick={() => navigate(chatPath)}
                  >
                    <span className="tp-subnav-icon">💬</span>
                    Chat
                  </button>
                  <button
                    className={`tp-subnav-btn ${isRouteActive(itinPath) ? "tp-subnav-btn--active" : ""}`}
                    onClick={() => navigate(itinPath)}
                  >
                    <span className="tp-subnav-icon">🗺️</span>
                    Itinerary
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Profile footer ── */}
      <div
        className={`tp-profile-footer ${isRouteActive("/profile") ? "tp-profile-footer--active" : ""}`}
        onClick={() => navigate("/profile")}
      >
        <div className="tp-profile-avatar">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} />
          ) : (
            <span>{user?.name?.[0]?.toUpperCase() ?? "U"}</span>
          )}
        </div>
        <div className="tp-profile-info">
          <div className="tp-profile-name">{user?.name ?? "My Account"}</div>
          <div className="tp-profile-email">
            {user?.email ?? "View profile"}
          </div>
        </div>
        <span className="tp-profile-arrow">›</span>
      </div>
    </aside>
  );
};

export default Sidebar;
