"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("coldash-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme ? savedTheme === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", isDark);
    const frame = window.requestAnimationFrame(() => setDark(isDark));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    document.documentElement.classList.toggle("dark", nextDark);
    window.localStorage.setItem("coldash-theme", nextDark ? "dark" : "light");
    setDark(nextDark);
  }

  return <button type="button" onClick={toggleTheme} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">{dark ? "Light mode" : "Dark mode"}</button>;
}
