// Section-specific heros + the compact fallback. Each one owns its
// own personality (atlas / ecg / cases / info); the SectionHero
// dispatcher in components/SectionHero.tsx picks one based on the
// current view.
export { default as AtlasHero } from "./AtlasHero";
export { default as EcgHero } from "./EcgHero";
export { default as CasesHero } from "./CasesHero";
export { default as InfoHero } from "./InfoHero";
export { default as CompactHead } from "./CompactHead";
