"use client";

/**
 * Cases hero — the landing of `/cases`. Personality: editorial,
 * magazine-style.
 *
 * Heavy serif title with an italic accent + a lede paragraph beside
 * it. The h1 itself uses `--fs-display` and a vertical gradient
 * (defined in CSS) for typographic depth. The eyebrow shows the
 * current edition year as the only piece of meta — the toolbar
 * carries the live count below.
 *
 * No props beyond the standard hero context — the title and lede
 * are intentionally hard-coded copy. They're the section's voice,
 * not data.
 */
export default function CasesHero() {
  return (
    <header className="hero hero--cases">
      <div className="hero-cases-eyebrow">
        <span>Edición {new Date().getFullYear()}</span>
      </div>
      <h1 className="hero-cases-title">
        Razonamiento <em>clínico</em>
        <br />
        en <span className="hero-cases-accent">primera persona</span>.
      </h1>
      <p className="hero-cases-lede">
        Cada caso es una historia completa: presentación, hallazgos clave, decisiones y desenlace.
        Pensado para leerse de principio a fin, no solo hojearse.
      </p>
    </header>
  );
}
