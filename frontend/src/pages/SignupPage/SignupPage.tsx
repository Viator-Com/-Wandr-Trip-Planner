import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import "./SignupPage.css";

interface SignupForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<SignupForm>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const set = (k: keyof SignupForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined, general: undefined }));
  };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.username.trim()) e.username = "Username is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 8) e.password = "At least 8 characters";
    if (!form.confirmPassword)
      e.confirmPassword = "Please confirm your password";
    else if (form.password !== form.confirmPassword)
      e.confirmPassword = "Passwords don't match";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        "http://localhost:3000/api/auth/signup",
        { username: form.username, email: form.email, password: form.password },
        { withCredentials: true },
      );
      navigate("/");
    } catch (err: any) {
      setErrors({
        general:
          err?.response?.data?.message ||
          "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Password strength
  const getStrength = (): { level: number; label: string } => {
    const p = form.password;
    if (!p) return { level: 0, label: "" };
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { level: 1, label: "Weak" };
    if (score <= 3) return { level: 2, label: "Fair" };
    return { level: 3, label: "Strong" };
  };

  const strength = getStrength();

  return (
    <div className="auth-page">
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">✈</div>
          <span>Wandr</span>
        </div>

        <h1 className="auth-title">Start your journey</h1>
        <p className="auth-subtitle">
          Create an account and plan your first trip today
        </p>

        {errors.general && <div className="auth-alert">{errors.general}</div>}

        {/* Google OAuth */}
        <button
          type="button"
          className="auth-google-btn"
          onClick={() => {
            window.location.href = "http://localhost:3000/api/auth/google";
          }}
        >
          <svg
            className="auth-google-icon"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign up with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div className="auth-field">
            <label className="auth-label">Full Name</label>
            <div
              className={`auth-input-wrap ${errors.username ? "auth-error" : ""}`}
            >
              <span className="auth-input-icon">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Alex"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                autoComplete="username"
              />
            </div>
            {errors.username && (
              <div className="auth-field-error">{errors.username}</div>
            )}
          </div>

          {/* Email */}
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <div
              className={`auth-input-wrap ${errors.email ? "auth-error" : ""}`}
            >
              <span className="auth-input-icon">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </span>
              <input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                autoComplete="email"
              />
            </div>
            {errors.email && (
              <div className="auth-field-error">{errors.email}</div>
            )}
          </div>

          {/* Password */}
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div
              className={`auth-input-wrap ${errors.password ? "auth-error" : ""}`}
            >
              <span className="auth-input-icon">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {/* Strength meter */}
            {form.password && (
              <div className="auth-strength">
                <div className="auth-strength-bars">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className={`auth-strength-bar ${strength.level >= n ? `auth-strength-${strength.level}` : ""}`}
                    />
                  ))}
                </div>
                <span
                  className={`auth-strength-label auth-strength-label-${strength.level}`}
                >
                  {strength.label}
                </span>
              </div>
            )}
            {errors.password && (
              <div className="auth-field-error">{errors.password}</div>
            )}
          </div>

          {/* Confirm Password */}
          <div className="auth-field">
            <label className="auth-label">Confirm Password</label>
            <div
              className={`auth-input-wrap ${errors.confirmPassword ? "auth-error" : ""}`}
            >
              <span className="auth-input-icon">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Repeat your password"
                value={form.confirmPassword}
                onChange={(e) => set("confirmPassword", e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
              >
                {showConfirm ? (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <div className="auth-field-error">{errors.confirmPassword}</div>
            )}
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
