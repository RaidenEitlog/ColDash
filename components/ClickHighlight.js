"use client";

import { useEffect, useState } from "react";

export default function ClickHighlight() {
  const [highlights, setHighlights] = useState([]);

  useEffect(() => {
    function showHighlight(event) {
      const highlight = { id: Date.now() + Math.random(), x: event.clientX, y: event.clientY };
      setHighlights((current) => [...current, highlight]);
      window.setTimeout(() => {
        setHighlights((current) => current.filter((item) => item.id !== highlight.id));
      }, 600);
    }

    window.addEventListener("pointerdown", showHighlight);
    return () => window.removeEventListener("pointerdown", showHighlight);
  }, []);

  return <>{highlights.map((highlight) => <span key={highlight.id} className="click-highlight" style={{ left: highlight.x, top: highlight.y }} />)}</>;
}
