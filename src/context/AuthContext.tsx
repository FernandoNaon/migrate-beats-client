import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  exchangeSpotifyCode,
  getAuthMe,
  logoutSession,
  getSessionToken,
  clearSessionToken,
  type SpotifyUser,
  type AppUser,
} from "../lib/api";

interface AuthState {
  sessionToken: string | null;
  spotifyUser: SpotifyUser | null;
  appUser: AppUser | null; // Database user with usage info
  tidalSessionId: string | null;
  tidalUser: { id: string; name: string } | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  /** Exchange an OAuth code for a session token (called from the callback page). */
  exchangeCode: (code: string) => Promise<void>;
  setTidalSession: (sessionId: string, user: { id: string; name: string }) => void;
  logout: () => void;
  isSpotifyConnected: boolean;
  isTidalConnected: boolean;
  migrationsRemaining: number;
  /** Back-compat alias: holds the session token. Existing call sites pass this to api fns
   *  (which now authenticate via the Bearer header, so the value itself is ignored). */
  spotifyCode: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    sessionToken: getSessionToken(),
    spotifyUser: null,
    appUser: null,
    tidalSessionId: localStorage.getItem("tidal_session_id"),
    tidalUser: null,
    isLoading: true,
  });

  // On mount (or when a session token appears), hydrate the profile.
  useEffect(() => {
    const token = state.sessionToken;
    if (token && !state.spotifyUser) {
      getAuthMe()
        .then(({ spotify_user, app_user }) => {
          setState((prev) => ({
            ...prev,
            spotifyUser: spotify_user,
            appUser: app_user,
            isLoading: false,
          }));
        })
        .catch(() => {
          // Token expired/invalid — fetchApi already cleared it on 401.
          clearSessionToken();
          setState((prev) => ({ ...prev, sessionToken: null, isLoading: false }));
        });
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [state.sessionToken]);

  const exchangeCode = async (code: string) => {
    const { session_token, spotify_user, app_user } = await exchangeSpotifyCode(code);
    setState((prev) => ({
      ...prev,
      sessionToken: session_token,
      spotifyUser: spotify_user,
      appUser: app_user,
      isLoading: false,
    }));
  };

  const setTidalSession = (sessionId: string, user: { id: string; name: string }) => {
    localStorage.setItem("tidal_session_id", sessionId);
    setState((prev) => ({ ...prev, tidalSessionId: sessionId, tidalUser: user }));
  };

  const logout = () => {
    logoutSession().catch(() => {});
    localStorage.removeItem("tidal_session_id");
    setState({
      sessionToken: null,
      spotifyUser: null,
      appUser: null,
      tidalSessionId: null,
      tidalUser: null,
      isLoading: false,
    });
  };

  const migrationsRemaining = state.appUser?.usage
    ? state.appUser.usage.migrations_limit - state.appUser.usage.migrations_today
    : 50;

  return (
    <AuthContext.Provider
      value={{
        ...state,
        spotifyCode: state.sessionToken, // alias for existing call sites
        exchangeCode,
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
