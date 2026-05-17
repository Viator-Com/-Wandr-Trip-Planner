// src/api/user.ts
import axios from "axios";

const API = "http://localhost:3000/api";
const cfg = { withCredentials: true };

import type { UserProfile, ApiResponse } from "./types";

// ── Helpers ───────────────────────────────────────────────────

function initial(name: string): string {
  return name?.trim()?.[0]?.toUpperCase() ?? "U";
}

function badge(trips: unknown[]): string {
  const n = trips?.length ?? 0;
  if (n === 0) return "Wanderer";
  if (n < 3) return "Explorer";
  if (n < 10) return "Adventurer";
  return "Globetrotter";
}

// ── API calls ─────────────────────────────────────────────────

export async function fetchProfile(): Promise<ApiResponse<UserProfile>> {
  try {
    const res = await axios.get(`${API}/auth/Me`, cfg);
    console.log("RES ->", res);
    const u = res.data;
    return {
      success: true,
      message: "OK",
      data: {
        id: String(u._id),
        name: u.username,
        email: u.email,
        badge: badge(u.trips ?? []),
        avatarInitial: initial(u.username),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.response?.data?.message ?? "Failed to fetch profile",
    };
  }
}

export async function updateEmail(payload: {
  currentEmail: string;
  newEmail: string;
}): Promise<ApiResponse> {
  try {
    const res = await axios.patch(`${API}/auth/email`, payload, cfg);
    return { success: true, message: res.data.message ?? "Email updated" };
  } catch (err: any) {
    return {
      success: false,
      message: err?.response?.data?.message ?? "Failed to update email",
    };
  }
}

export async function updatePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<ApiResponse> {
  try {
    const res = await axios.patch(`${API}/auth/password`, payload, cfg);
    return { success: true, message: res.data.message ?? "Password updated" };
  } catch (err: any) {
    return {
      success: false,
      message: err?.response?.data?.message ?? "Failed to update password",
    };
  }
}

export async function deleteAccount(password: string): Promise<ApiResponse> {
  try {
    const res = await axios.delete(`${API}/auth`, {
      ...cfg,
      data: { password },
    });
    return { success: true, message: res.data.message ?? "Account deleted" };
  } catch (err: any) {
    return {
      success: false,
      message: err?.response?.data?.message ?? "Failed to delete account",
    };
  }
}

export async function logout(): Promise<ApiResponse> {
  try {
    const res = await axios.post(`${API}/auth/logout`, {}, cfg);
    return { success: true, message: res.data.message ?? "Logged out" };
  } catch (err: any) {
    return {
      success: false,
      message: err?.response?.data?.message ?? "Logout failed",
    };
  }
}
