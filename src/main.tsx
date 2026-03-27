import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// --- ADD THIS REDIRECT BLOCK START ---
// This forces the browser to use 'www' so localStorage doesn't get split 
// between two different domains, which is why your login keeps breaking.
if (
  window.location.hostname !== "localhost" && 
  window.location.hostname === "crewcenterkeva.com"
) {
  window.location.replace(
    "https://www.crewcenterkeva.com" + window.location.pathname + window.location.search
  );
}
// --- ADD THIS REDIRECT BLOCK END ---

createRoot(document.getElementById("root")!).render(<App />);
