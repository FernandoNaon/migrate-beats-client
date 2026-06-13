import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { exchangeCode } = useAuth();
  const hasProcessed = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasProcessed.current) return;

    const code = searchParams.get("code");
    if (code) {
      hasProcessed.current = true;
      exchangeCode(code)
        .then(() => navigate("/dashboard", { replace: true }))
        .catch((e) => {
          setError(e?.message || "Sign-in failed");
          setTimeout(() => navigate("/", { replace: true }), 2500);
        });
    } else {
      hasProcessed.current = true;
      navigate("/", { replace: true });
    }
  }, [searchParams, exchangeCode, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        {error ? (
          <p className="text-red-400 max-w-xs">{error}<br />Redirecting…</p>
        ) : (
          <>
            <div className="w-12 h-12 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Connecting to Spotify...</p>
          </>
        )}
      </div>
    </div>
  );
}
