// Synthetic cine-loop renderer + presentation mode. `cineScenes` holds
// the per-pathology canvas drawing routines; `CineLoop` orchestrates
// frame loop, IntersectionObserver pause, and reduced-motion handling.
export { default as CineLoop } from "./CineLoop";
export { default as PresentationMode } from "./PresentationMode";
export { drawScene, drawChrome } from "./cineScenes";
