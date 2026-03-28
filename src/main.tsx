import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Redirect non-www to www so localStorage is ALWAYS on the same origin.
// This must happen BEFORE React mounts — otherwise session is split across
// two different origins and login breaks until cache is cleared.
if (
  typeof window !== "undefined" &&
  window.location.hostname === "crewcenterkeva.com" // no www
) {
  window.location.replace(
    "https://www.crewcenterkeva.com" +
      window.location.pathname +
      window.location.search +
      window.location.hash
  );
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
