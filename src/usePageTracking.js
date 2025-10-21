import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Lightweight page tracking hook:
 * - Sends page views to Google Analytics if gtag() is present
 * - Sends page views to Vercel Analytics if window.va is present (optional)
 */
export default function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;

    // Google Analytics (gtag)
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: path,
        page_location: window.location.href,
      });
    }

    // Vercel (optional: track pageview manually)
    if (typeof window !== "undefined" && typeof window.va === "function") {
      // window.va("event", "page_view"); // or leave it; Analytics component already tracks route changes
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
}
