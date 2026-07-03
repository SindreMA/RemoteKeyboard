import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import App from "./App";

/** Which window is this? Prefer an explicit `?view=` (browser preview), else
 *  the Tauri window label, else the main window. */
function detectView(): "popover" | "main" {
  try {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "popover" || v === "main") return v;
  } catch {
    /* ignore */
  }
  try {
    const label = (window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
    }).__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
    if (label === "popover") return "popover";
  } catch {
    /* ignore */
  }
  return "main";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App view={detectView()} />
  </React.StrictMode>,
);
