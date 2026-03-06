import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./AuthContext";
import { checkTidalAuth, getUserProfile, registerUser } from "../lib/api";

vi.mock("../lib/api", () => ({
  checkTidalAuth: vi.fn(),
  getUserProfile: vi.fn(),
  registerUser: vi.fn(),
}));

function AuthProbe() {
  const { isTidalConnected, tidalUser } = useAuth();

  return (
    <>
      <div data-testid="tidal-status">{isTidalConnected ? "connected" : "disconnected"}</div>
      <div data-testid="tidal-name">{tidalUser?.name ?? "none"}</div>
    </>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getUserProfile).mockReset();
    vi.mocked(registerUser).mockReset();
    vi.mocked(checkTidalAuth).mockReset();
    vi.mocked(registerUser).mockResolvedValue(null as never);
  });

  it("restores a saved Tidal session after reload", async () => {
    localStorage.setItem("tidal_session_id", "session-123");
    localStorage.setItem("tidal_user", JSON.stringify({ id: "1", name: "Cached User" }));
    vi.mocked(checkTidalAuth).mockResolvedValue({
      authenticated: true,
      user: { id: "1", name: "Fresh User" },
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tidal-status")).toHaveTextContent("connected");
    });

    expect(checkTidalAuth).toHaveBeenCalledWith("session-123");
    expect(screen.getByTestId("tidal-name")).toHaveTextContent("Fresh User");
  });
});
