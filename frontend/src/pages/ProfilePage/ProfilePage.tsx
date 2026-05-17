// ============================================================
//  ProfilePage.tsx  –  Wandr Profile Page
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ProfilePage.css";
import Sidebar from "../../components/SideBar/SideBar";
import {
  deleteAccount,
  fetchProfile,
  logout,
  updateEmail,
  updatePassword,
} from "../../api/user";
import { getTrips, deleteTrip } from "../../api/trips";
import type { ITrip, UserProfile } from "../../api/types";

// ── Toast hook ───────────────────────────────────────────────

type ToastType = "success" | "error";

function useToast() {
  const [toast, setToast] = useState<{
    msg: string;
    type: ToastType;
    show: boolean;
  }>({ msg: "", type: "success", show: false });

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = (msg: string, type: ToastType = "success") => {
    clearTimeout(timerRef.current);
    setToast({ msg, type, show: true });
    timerRef.current = setTimeout(
      () => setToast((t) => ({ ...t, show: false })),
      3000,
    );
  };

  return { toast, showToast };
}

// ── Password strength helper ──────────────────────────────────

type StrengthLevel = "weak" | "medium" | "strong" | "";

function getStrength(val: string): {
  score: number;
  level: StrengthLevel;
  label: string;
} {
  if (!val) return { score: 0, level: "", label: "Enter a password" };
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const level: StrengthLevel =
    score <= 1 ? "weak" : score <= 2 ? "medium" : "strong";
  const label =
    score <= 1 ? "Weak" : score <= 2 ? "Fair" : score <= 3 ? "Good" : "Strong";
  return { score, level, label };
}

// ── PasswordInput ─────────────────────────────────────────────

interface PasswordInputProps {
  id: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

function PasswordInput({
  id,
  placeholder,
  value,
  onChange,
  disabled,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="wp-input-wrapper">
      <input
        id={id}
        className="wp-field-input"
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="new-password"
      />
      <button
        className="wp-toggle-eye"
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{ opacity: visible ? 1 : 0.6 }}
      >
        {visible ? "🙈" : "👁"}
      </button>
    </div>
  );
}

// ── Email Section ─────────────────────────────────────────────

interface EmailSectionProps {
  currentEmail: string;
  showToast: (msg: string, type?: ToastType) => void;
}

function EmailSection({ currentEmail, showToast }: EmailSectionProps) {
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (!newEmail) return "Please enter a new email.";
    if (!/\S+@\S+\.\S+/.test(newEmail)) return "Invalid email format.";
    if (newEmail === currentEmail) return "New email is the same as current.";
    if (newEmail !== confirmEmail) return "Emails do not match.";
    return "";
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await updateEmail({ currentEmail, newEmail });
      if (res.success) {
        showToast(`Verification email sent to ${newEmail}`);
        setNewEmail("");
        setConfirm("");
      } else {
        showToast(res.message, "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wp-section-card">
      <div className="wp-section-header">
        <div className="wp-section-icon">✉</div>
        <div className="wp-section-title">Update Email</div>
      </div>
      <div className="wp-section-body">
        <div className="wp-field-group">
          <label className="wp-field-label">Current Email</label>
          <input
            className="wp-field-input"
            type="email"
            value={currentEmail}
            readOnly
          />
        </div>
        <div className="wp-field-group">
          <label className="wp-field-label">New Email</label>
          <input
            className="wp-field-input"
            type="email"
            placeholder="Enter new email address"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setError("");
            }}
            disabled={loading}
          />
        </div>
        <div className="wp-field-group">
          <label className="wp-field-label">Confirm New Email</label>
          <input
            className="wp-field-input"
            type="email"
            placeholder="Confirm new email address"
            value={confirmEmail}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError("");
            }}
            disabled={loading}
          />
          {error ? (
            <span className="wp-field-error">{error}</span>
          ) : (
            <span className="wp-field-hint">
              A verification link will be sent to your new email.
            </span>
          )}
        </div>
        <div className="wp-btn-row">
          <button
            className="wp-btn wp-btn-ghost"
            onClick={() => {
              setNewEmail("");
              setConfirm("");
              setError("");
            }}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="wp-btn wp-btn-gold"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Sending…" : "Update Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Password Section ──────────────────────────────────────────

interface PasswordSectionProps {
  showToast: (msg: string, type?: ToastType) => void;
}

function PasswordSection({ showToast }: PasswordSectionProps) {
  const [curr, setCurr] = useState("");
  const [newPass, setNewPass] = useState("");
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = getStrength(newPass);

  const validate = () => {
    if (!curr) return "Please enter your current password.";
    if (newPass.length < 8)
      return "New password must be at least 8 characters.";
    if (newPass !== conf) return "New passwords do not match.";
    return "";
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await updatePassword({
        currentPassword: curr,
        newPassword: newPass,
      });
      if (res.success) {
        showToast("Password updated successfully");
        setCurr("");
        setNewPass("");
        setConf("");
      } else {
        showToast(res.message, "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wp-section-card">
      <div className="wp-section-header">
        <div className="wp-section-icon">🔑</div>
        <div className="wp-section-title">Update Password</div>
      </div>
      <div className="wp-section-body">
        <div className="wp-field-group">
          <label className="wp-field-label">Current Password</label>
          <PasswordInput
            id="curr-pass"
            placeholder="Enter current password"
            value={curr}
            onChange={(v) => {
              setCurr(v);
              setError("");
            }}
            disabled={loading}
          />
        </div>
        <div className="wp-input-row">
          <div className="wp-field-group">
            <label className="wp-field-label">New Password</label>
            <PasswordInput
              id="new-pass"
              placeholder="New password"
              value={newPass}
              onChange={(v) => {
                setNewPass(v);
                setError("");
              }}
              disabled={loading}
            />
            <div className="wp-strength-bar">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`wp-strength-seg ${i < strength.score ? strength.level : ""}`}
                />
              ))}
            </div>
            <div className="wp-strength-label">{strength.label}</div>
          </div>
          <div className="wp-field-group">
            <label className="wp-field-label">Confirm Password</label>
            <PasswordInput
              id="conf-pass"
              placeholder="Confirm password"
              value={conf}
              onChange={(v) => {
                setConf(v);
                setError("");
              }}
              disabled={loading}
            />
          </div>
        </div>
        {error ? (
          <span className="wp-field-error">{error}</span>
        ) : (
          <span className="wp-field-hint">
            Min. 8 chars. Mix letters, numbers & symbols for a stronger
            password.
          </span>
        )}
        <div className="wp-btn-row">
          <button
            className="wp-btn wp-btn-ghost"
            onClick={() => {
              setCurr("");
              setNewPass("");
              setConf("");
              setError("");
            }}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="wp-btn wp-btn-gold"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Logout Modal ──────────────────────────────────────────────

interface LogoutModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function LogoutModal({ onConfirm, onCancel, loading }: LogoutModalProps) {
  return (
    <div
      className="wp-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="wp-modal">
        <div className="wp-modal-icon">🚪</div>
        <div className="wp-modal-title">Log out of Wandr?</div>
        <p className="wp-modal-desc">
          You'll need to sign back in to access your trips and itineraries.
        </p>
        <div className="wp-modal-actions">
          <button
            className="wp-btn wp-btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="wp-btn-danger"
            onClick={onConfirm}
            disabled={loading}
            style={{ padding: "10px 20px", borderRadius: 8, fontSize: 13 }}
          >
            {loading ? "Logging out…" : "Yes, log out"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Account Modal ──────────────────────────────────────

interface DeleteModalProps {
  onConfirm: (password: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function DeleteAccountModal({
  onConfirm,
  onCancel,
  loading,
}: DeleteModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (!password) {
      setError("Password is required.");
      return;
    }
    setError("");
    onConfirm(password);
  };

  return (
    <div
      className="wp-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="wp-modal">
        <div className="wp-modal-icon">⚠</div>
        <div className="wp-modal-title">Delete Account?</div>
        <p className="wp-modal-desc">
          This will permanently delete your account and all your trips. This
          cannot be undone. Enter your password to confirm.
        </p>
        <div
          className="wp-field-group"
          style={{ width: "100%", marginBottom: 8 }}
        >
          <PasswordInput
            id="delete-confirm-pass"
            placeholder="Enter your password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError("");
            }}
            disabled={loading}
          />
          {error && <span className="wp-field-error">{error}</span>}
        </div>
        <div className="wp-modal-actions">
          <button
            className="wp-btn wp-btn-ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="wp-btn-danger"
            onClick={handleConfirm}
            disabled={loading}
            style={{ padding: "10px 20px", borderRadius: 8, fontSize: 13 }}
          >
            {loading ? "Deleting…" : "Yes, delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function ProfilePage() {
  const navigate = useNavigate();
  const { toast, showToast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [trips, setTrips] = useState<ITrip[]>([]);
  const [activeTrip, setActiveTrip] = useState<ITrip | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

      setLoadingProfile(false);
    })();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      showToast("Logged out successfully");
      navigate("/login");
    } catch {
      showToast("Logout failed. Please try again.", "error");
    } finally {
      setLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  const handleDeleteAccount = async (password: string) => {
    setDeletingAccount(true);
    try {
      const res = await deleteAccount(password);
      if (res.success) {
        showToast("Account deleted. Redirecting…", "error");
        setTimeout(() => navigate("/"), 1500);
      } else {
        showToast(res.message, "error");
      }
    } catch {
      showToast("Network error. Please try again.", "error");
    } finally {
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  const handleDeleteTrip = async (deletedId: string) => {
    try {
      await deleteTrip(deletedId);
      setTrips((prev) => prev.filter((t) => t._id !== deletedId));
      if (activeTrip?._id === deletedId) setActiveTrip(null);
    } catch {
      showToast("Failed to delete trip. Please try again.", "error");
    }
  };

  // Map ITrip → Sidebar's Trip shape (title vs name field)
  const sidebarTrips = trips.map((t) => ({
    _id: t._id,
    title: t.title,
    startDate: t.startDate ? new Date(t.startDate).toISOString() : undefined,
    endDate: t.endDate ? new Date(t.endDate).toISOString() : undefined,
    budget: t.budget,
    currency: t.currency,
    status: t.status,
  }));

  const sidebarUser = profile
    ? { name: profile.name, email: profile.email }
    : undefined;

  return (
    <div className="wp-layout">
      {/* ── Sidebar ── */}
      <Sidebar
        trips={sidebarTrips}
        activeTrip={
          activeTrip
            ? (sidebarTrips.find((t) => t._id === activeTrip._id) ?? null)
            : null
        }
        setActiveTrip={(t) =>
          setActiveTrip(trips.find((x) => x._id === t._id) ?? null)
        }
        onNewTrip={() => navigate("/")}
        sidebarOpen={true}
        user={sidebarUser}
        onDeleteTrip={handleDeleteTrip}
      />

      {/* ── Main ── */}
      <main className="wp-main">
        <div className="wp-topbar">
          <span className="wp-topbar-star">✦</span>
          <span className="wp-topbar-title">MY PROFILE</span>
        </div>

        <div className="wp-content">
          {/* ── Profile header card ── */}
          <div className="wp-header-card">
            {loadingProfile ? (
              <>
                <div
                  className="wp-skeleton"
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    className="wp-skeleton"
                    style={{ width: "40%", height: 22 }}
                  />
                  <div
                    className="wp-skeleton"
                    style={{ width: "60%", height: 14 }}
                  />
                  <div
                    className="wp-skeleton"
                    style={{ width: 80, height: 20, borderRadius: 20 }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="wp-avatar-lg">{profile?.avatarInitial}</div>
                <div>
                  <div className="wp-header-name">{profile?.name}</div>
                  <div className="wp-header-email">{profile?.email}</div>
                  <div className="wp-header-badge">✦ {profile?.badge}</div>
                </div>
              </>
            )}
          </div>

          {/* ── Email section ── */}
          {!loadingProfile && profile && (
            <EmailSection currentEmail={profile.email} showToast={showToast} />
          )}

          {/* ── Password section ── */}
          {!loadingProfile && <PasswordSection showToast={showToast} />}

          {/* ── Danger zone ── */}
          {!loadingProfile && (
            <div className="wp-danger-zone">
              <div className="wp-danger-header">
                <div className="wp-danger-icon">⚠</div>
                <div className="wp-danger-title">Danger Zone</div>
              </div>
              <div className="wp-danger-body">
                <p className="wp-danger-desc">
                  Permanently delete your account and all associated trips and
                  data. This action cannot be undone.
                </p>
                <button
                  className="wp-btn-danger"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={deletingAccount}
                >
                  {deletingAccount ? "Deleting…" : "Delete Account"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Modals ── */}
      {showLogoutModal && (
        <LogoutModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
          loading={loggingOut}
        />
      )}
      {showDeleteModal && (
        <DeleteAccountModal
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteModal(false)}
          loading={deletingAccount}
        />
      )}

      {/* ── Toast ── */}
      <div
        className={`wp-toast${toast.show ? " show" : ""}`}
        style={{
          borderLeftColor:
            toast.type === "error" ? "var(--danger)" : "var(--success)",
        }}
      >
        <span
          className="wp-toast-icon"
          style={{
            color: toast.type === "error" ? "var(--danger)" : "var(--success)",
          }}
        >
          {toast.type === "error" ? "✕" : "✓"}
        </span>
        {toast.msg}
      </div>
    </div>
  );
}
