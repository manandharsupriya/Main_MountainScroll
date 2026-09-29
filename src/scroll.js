import { updateConfig } from './scene.js';
import { updateUIProgress } from './ui.js';

let sectionBounds = [];
let lastSectionId = null;
let progressBarEl = null;

export function setupScrollEvents(sections) {
  progressBarEl = document.getElementById('progress-bar');

  // Apply heights from JSON to section elements
  sections.forEach((section) => {
    const el = document.getElementById(section.id);
    if (el && section.height) {
      el.style.height = section.height;
    }
  });

  const computeBounds = () => {
    sectionBounds = sections.map((s) => {
      const el = document.getElementById(s.id);
      if (!el) return { id: s.id, top: 0, height: 0, config: s };
      return {
        id: s.id,
        top: el.offsetTop,
        height: el.offsetHeight,
        config: s,
      };
    });
  };

  // Initial calculation
  computeBounds();

  let ticking = false;

  const onScrollTick = () => {
    const scrollY = window.scrollY;

    // 1. Hardware-accelerated overall page progress bar (GPU scaleX)
    if (progressBarEl) {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = docHeight > 0 ? Math.min(Math.max(scrollY / docHeight, 0), 1) : 0;
      progressBarEl.style.transform = `scaleX(${scrollPercent.toFixed(4)})`;
    }

    // 2. Identify active section and compute its normalized scroll progress (0.0 to 1.0)
    let activeSection = null;
    let sectionProgress = 0;

    for (let i = 0; i < sectionBounds.length; i++) {
      const b = sectionBounds[i];
      const sectionStart = b.top;
      const sectionEnd = b.top + b.height;

      // Section is active if current scroll position lies within its height
      if (scrollY >= sectionStart && scrollY < sectionEnd) {
        activeSection = b.config;
        sectionProgress = b.height > 0 ? (scrollY - sectionStart) / b.height : 0;
        break;
      }
    }

    // Handle overshoot at the bottom
    if (!activeSection && sectionBounds.length > 0) {
      const last = sectionBounds[sectionBounds.length - 1];
      if (scrollY >= last.top + last.height) {
        activeSection = last.config;
        sectionProgress = 1.0;
      }
    }

    // 3. Trigger 3D Camera / Scene update on section change
    const currentId = activeSection ? activeSection.id : null;
    if (currentId && currentId !== lastSectionId) {
      lastSectionId = currentId;
      updateConfig(currentId);
    }

    // 4. Update UI elements (Hero title, Subheadings, Bottom infoboxes)
    updateUIProgress(activeSection, sectionProgress, scrollY);

    ticking = false;
  };

  // Scroll listener throttled to browser refresh rate via requestAnimationFrame
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(onScrollTick);
        ticking = true;
      }
    },
    { passive: true }
  );

  // Recalculate on window resize
  window.addEventListener(
    'resize',
    () => {
      computeBounds();
      onScrollTick();
    },
    { passive: true }
  );

  // Initial tick to set correct state
  onScrollTick();
}
