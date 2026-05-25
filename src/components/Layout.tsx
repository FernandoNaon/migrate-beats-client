import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ArrowRightLeft, Heart, Settings, LogOut, Disc3, LayoutGrid } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/migrate", icon: ArrowRightLeft, label: "Migrate" },
  { to: "/playlist-manager", icon: LayoutGrid, label: "Manager" },
  { to: "/liked-songs", icon: Heart, label: "Liked Songs" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Layout() {
  const { spotifyUser, logout, isSpotifyConnected } = useAuth();

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-cream)' }}>
      {/* Sidebar */}
      <aside
        className="w-64 flex flex-col"
        style={{
          background: 'var(--bg-warm)',
          borderRight: '1px solid var(--border-light)'
        }}
      >
        {/* Logo & Theme Toggle */}
        <div
          className="p-4"
          style={{ borderBottom: '1px solid var(--border-light)' }}
        >
          {/* Theme Toggle */}
          <div className="mb-4">
            <ThemeToggle />
          </div>

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--green-primary)' }}
            >
              <Disc3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-lg" style={{ color: 'var(--text-dark)' }}>
                Migrate Beats
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-medium)' }}>
                Move your music
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                      isActive ? "nav-active" : "nav-inactive"
                    }`
                  }
                  style={({ isActive }) => ({
                    background: isActive ? 'var(--green-pale)' : 'transparent',
                    color: isActive ? 'var(--green-primary)' : 'var(--text-medium)',
                  })}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User section */}
        {isSpotifyConnected && spotifyUser && (
          <div
            className="p-4"
            style={{ borderTop: '1px solid var(--border-light)' }}
          >
            <div className="flex items-center gap-3 mb-3">
              {spotifyUser.image ? (
                <img
                  src={spotifyUser.image}
                  alt={spotifyUser.display_name}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--green-pale)' }}
                >
                  <span className="font-medium" style={{ color: 'var(--green-primary)' }}>
                    {spotifyUser.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" style={{ color: 'var(--text-dark)' }}>
                  {spotifyUser.display_name}
                </p>
                <p className="text-xs capitalize" style={{ color: 'var(--text-medium)' }}>
                  {spotifyUser.product || "Free"}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 w-full px-4 py-2 rounded-xl transition-colors"
              style={{ color: 'var(--coral)' }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'var(--peach)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
