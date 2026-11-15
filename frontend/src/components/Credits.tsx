import { useEffect, useRef } from "react";

const LINKS = [
  { label: "Source on GitHub", href: "https://github.com/MassGethu/Sabut" },
  { label: "Jarvis Jeason Jacob · LinkedIn", href: "https://www.linkedin.com/in/jarvis-jeason-jacob-213124419/" },
  { label: "Aadarsh B · LinkedIn", href: "https://www.linkedin.com/in/aadarsh-b-54811a419/" },
];

/** Header menu linking to the repository and the team's profiles. */
export function Credits() {
  const box = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    // Close the menu on any click outside it or on Escape.
    const close = (e: Event) => {
      const el = box.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details className="credits" ref={box}>
      <summary className="btn btn-xs">Credits</summary>
      <ul className="credits-menu">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label} ↗
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
