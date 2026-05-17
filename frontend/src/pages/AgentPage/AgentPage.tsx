import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/SideBar/SideBar";
import NewTripModal from "../../components/newTripModel/newTripModel";
import { getTrips, createTrip, deleteTrip } from "../../api/trips";
import { fetchProfile } from "../../api/user";
import "./AgentPage.css";

import type { UserProfile } from "../../api/types";

interface Trip {
  _id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  status?: string;
}

interface TripForm {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: number;
}

const TripPlannerPage: React.FC = () => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchTrips = async () => {
      const data = await getTrips();
      setTrips(data.map((t: any) => ({ ...t, _id: String(t._id) })));
    };
    fetchTrips();
  }, []);

  useEffect(() => {
    (async () => {
      const [profileRes] = await Promise.allSettled([
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
    })();
  }, []);

  const handleNewTrip = () => setShowModal(true);

  const handleCreateTrip = async (form: TripForm) => {
    try {
      const trip = await createTrip(form);
      const normalised = { ...trip, _id: String(trip._id) } as unknown as Trip;
      setTrips((prev) => [normalised, ...prev]);
      navigate(`/chat/${normalised._id}`);
    } catch (err) {
      console.error("Trip creation failed", err);
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
    try {
      await deleteTrip(tripId);

      setTrips((prev) => prev.filter((t) => t._id !== tripId));

      if (activeTrip?._id === tripId) {
        setActiveTrip(null);
        navigate("/");
      }
    } catch (err) {
      console.error("Trip deletion failed", err);
    }
  };

  const sidebarUser = profile
    ? { name: profile.name, email: profile.email }
    : undefined;

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
        setActiveTrip={setActiveTrip}
        onNewTrip={handleNewTrip}
        onDeleteTrip={handleDeleteTrip}
        sidebarOpen={sidebarOpen}
        user={sidebarUser}
      />

      <main className="tp-main">
        <div className="tp-topbar">
          <button
            className="tp-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
          <h2>{activeTrip ? activeTrip.title : "Plan your next adventure"}</h2>
        </div>

        <div className="tp-content">
          {!activeTrip && (
            <div className="tp-empty-state">Select a trip from the sidebar</div>
          )}
          {activeTrip && (
            <div className="tp-trip-view">
              <h3>{activeTrip.title}</h3>
              <p>
                {activeTrip.startDate} → {activeTrip.endDate}
              </p>
              <p>Budget: ${activeTrip.budget}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default TripPlannerPage;
