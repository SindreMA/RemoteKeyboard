import { useEffect, useState } from "react";
import { useSnapshot } from "./lib/api";
import { Popover } from "./views/Popover";
import { MainWindow } from "./views/Main";

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return !!dark;
}

export default function App({ view }: { view: "popover" | "main" }) {
  const snap = useSnapshot();
  const theme = usePrefersDark() ? "dark" : "light";
  const platform = snap?.platform ?? "macos";

  return (
    <div className="rk-root" data-platform={platform} data-theme={theme}>
      {snap && (view === "popover" ? <Popover snap={snap} /> : <MainWindow snap={snap} />)}
    </div>
  );
}
