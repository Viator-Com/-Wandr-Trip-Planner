import { BrowserRouter, Routes, Route } from "react-router-dom";
import AgentPage from "./pages/AgentPage/AgentPage";
import ChatPage from "./pages/ChatPage/ChatPage";
import LoginPage from "./pages/LoginPage/LoginPage";
import SignupPage from "./pages/SignupPage/SignupPage";
import HomePage from "./pages/HomePage/HomePage";
import ItineraryPage from "./pages/ItineraryPage/ItineraryPage";
import ProfilePage from "./pages/ProfilePage/ProfilePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/" element={<AgentPage />} />
        <Route path="/itinerary/:tripId" element={<ItineraryPage />} />
        <Route path="/chat/:tripId" element={<ChatPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
