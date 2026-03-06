/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { checkTidalAuth, getUserProfile, registerUser, type SpotifyUser, type AppUser } from "../lib/api";

interface AuthState {
  spotifyCode: string | null;
  spotifyUser: SpotifyUser | null;
  appUser: AppUser | null;  // Database user with usage info
  tidalSessionId: string | null;
  tidalUser: { id: string; name: string } | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  setSpotifyCode: (code: string) => void;
  setTidalSession: (sessionId: string, user: { id: string; name: string }) => void;
  logout: () => void;
  isSpotifyConnected: boolean;
  isTidalConnected: boolean;
  migrationsRemaining: number;
}

const AuthContext = createContext<AuthContextType | null>(null);

function parseStoredTidalUser(value: string | null): { id: string; name: string } | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as { id: string; name: string };
  } catch {
    localStorage.removeItem("tidal_user");
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    spotifyCode: localStorage.getItem("spotify_code"),
    spotifyUser: null,
    appUser: null,
    tidalSessionId: localStorage.getItem("tidal_session_id"),
    tidalUser: parseStoredTidalUser(localStorage.getItem("tidal_user")),
    isLoading: true,
  });

  useEffect(() => {
    const code = state.spotifyCode;
    if (code && !state.spotifyUser) {
      // Fetch Spotify profile and register user in database
      Promise.all([
        getUserProfile(code),
        registerUser(code).catch(() => null), // Don't fail if DB registration fails
      ])
        .then(([spotifyUser, appUser]) => {
          setState((prev) => ({
            ...prev,
            spotifyUser,
            appUser,
            isLoading: false,
          }));
        })
        .catch(() => {
          // Token expired or invalid
          localStorage.removeItem("spotify_code");
          setState((prev) => ({ ...prev, spotifyCode: null, isLoading: false }));
        });
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [state.spotifyCode, state.spotifyUser]);

  useEffect(() => {
    const sessionId = state.tidalSessionId;
    if (!sessionId) return;

    checkTidalAuth(sessionId)
      .then((status) => {
        if (status.authenticated && status.user) {
          localStorage.setItem("tidal_user", JSON.stringify(status.user));
          setState((prev) => ({ ...prev, tidalUser: status.user ?? null }));
          return;
        }

        localStorage.removeItem("tidal_session_id");
        localStorage.removeItem("tidal_user");
        setState((prev) => ({ ...prev, tidalSessionId: null, tidalUser: null }));
      })
      .catch(() => {
        localStorage.removeItem("tidal_session_id");
        localStorage.removeItem("tidal_user");
        setState((prev) => ({ ...prev, tidalSessionId: null, tidalUser: null }));
      });
  }, [state.tidalSessionId]);

  const setSpotifyCode = (code: string) => {
    localStorage.setItem("spotify_code", code);
    setState((prev) => ({ ...prev, spotifyCode: code }));
  };

  const setTidalSession = (sessionId: string, user: { id: string; name: string }) => {
    localStorage.setItem("tidal_session_id", sessionId);
    localStorage.setItem("tidal_user", JSON.stringify(user));
    setState((prev) => ({ ...prev, tidalSessionId: sessionId, tidalUser: user }));
  };

  const logout = () => {
    localStorage.removeItem("spotify_code");
    localStorage.removeItem("tidal_session_id");
    localStorage.removeItem("tidal_user");
    setState({
      spotifyCode: null,
      spotifyUser: null,
      appUser: null,
      tidalSessionId: null,
      tidalUser: null,
      isLoading: false,
    });
  };

  // Calculate remaining migrations
  const migrationsRemaining = state.appUser?.usage
    ? state.appUser.usage.migrations_limit - state.appUser.usage.migrations_today
    : 50; // Default limit

  return (
    <AuthContext.Provider
      value={{
        ...state,
        setSpotifyCode,
        setTidalSession,
        logout,
        isSpotifyConnected: !!state.spotifyUser,
        isTidalConnected: !!state.tidalUser,
        migrationsRemaining,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
