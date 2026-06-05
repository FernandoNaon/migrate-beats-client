import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Callback from "./pages/Callback";
import Dashboard from "./pages/Dashboard";
import Migrate from "./pages/Migrate";
import PlaylistManager from "./pages/PlaylistManager";
import Archaeologist from "./pages/Archaeologist";
import LikedSongs from "./pages/LikedSongs";
import Settings from "./pages/Settings";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/callback" element={<Callback />} />
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/migrate" element={<Migrate />} />
              <Route path="/playlists" element={<Navigate to="/migrate" replace />} />
              <Route path="/playlist-manager" element={<PlaylistManager />} />
              <Route path="/archaeologist" element={<Archaeologist />} />
              <Route path="/liked-songs" element={<LikedSongs />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
