// Cache for asynchronously loaded infobox HTML templates
const htmlCache = {};
let currentActiveSectionId = null;

let subheadingDisplay, subheadingText, subheadingNote;
let activeInfobox, infoboxContent, heroTitle;
let fullcoverDisplay, fullcoverContent;

/**
 * Helper to determine uiType with full backward compatibility
 */
export function getSectionUIType(section) {
  if (!section) return 'none';
  if (section.uiType === 'fullcover' || section.uiType === 'fullscreen-editorial') return 'fullcover';
  if (section.uiType) return section.uiType;
  if (section.subheading) return 'subheading';
  if (section.infoboxHtml) return 'infobox';
  return 'none';
}

/**
 * Helper to determine infobox theme ('theme-light' or 'theme-dark') with backward compatibility
 */
export function getSectionTheme(section) {
  if (!section) return 'theme-light';
  if (section.infoboxTheme === 'dark') return 'theme-dark';
  if (section.infoboxTheme === 'light') return 'theme-light';

  // Backward compatibility with previous infoboxStyle tags
  const style = (section.infoboxStyle || '').toLowerCase();
  if (style === 'dark' || style === 'mundhumnarrator' || style === 'livedexperience') {
    return 'theme-dark';
  }
  return 'theme-light';
}

/**
 * Initialize UI elements and pre-load all HTML files (for both infoboxes and fullcover)
 */
export function setupUI(sections) {
  subheadingDisplay = document.getElementById('subheading-display');
  subheadingText = document.getElementById('subheading-text');
  subheadingNote = document.getElementById('subheading-note');

  activeInfobox = document.getElementById('active-infobox');
  infoboxContent = document.getElementById('infobox-content');
  heroTitle = document.querySelector('.hero-title');

  fullcoverDisplay = document.getElementById('fullcover-display');
  fullcoverContent = document.getElementById('fullcover-content');

  // Pre-fetch all HTML files into memory
  sections.forEach((section) => {
    const htmlFile = section.infoboxHtml || section.contentHtml || section.html;
    if (htmlFile) {
      const url = `${import.meta.env.BASE_URL}infoboxes/${htmlFile}`;
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((html) => {
          htmlCache[section.id] = html;
        })
        .catch((err) => console.warn(`Could not load HTML for ${section.id}:`, err));
    }
  });
}

/**
 * Updates UI opacity and vertical motion based on section scroll progress
 * Handles:
 * - Full-screen solid coverage sections (HTML content rendered cleanly over off-white veil)
 * - Centered subheadings (glides vertically across screen center)
 * - Light and dark bottom-docked infoboxes (glides 66vh upwards across screen center)
 */
export function updateUIProgress(activeSection, progress, scrollY) {
  // 1. Hero Title parallax fade out
  if (heroTitle) {
    const fadeDistance = window.innerHeight * 0.75;
    const heroProgress = Math.min(Math.max(scrollY / fadeDistance, 0), 1);
    const heroOpacity = 1 - heroProgress;
    const heroTranslate = heroProgress * -40;
    heroTitle.style.opacity = heroOpacity.toFixed(3);
    heroTitle.style.transform = `translateY(${heroTranslate.toFixed(1)}px)`;
  }

  // If before first section or no active section, hide overlay elements
  if (!activeSection) {
    if (subheadingDisplay) subheadingDisplay.style.opacity = '0';
    if (activeInfobox) {
      activeInfobox.style.opacity = '0';
      activeInfobox.style.pointerEvents = 'none';
    }
    if (fullcoverDisplay) {
      fullcoverDisplay.style.opacity = '0';
      fullcoverDisplay.style.pointerEvents = 'none';
    }
    currentActiveSectionId = null;
    return;
  }

  const uiType = getSectionUIType(activeSection);

  // 2. Full-Screen Solid Coverage Section (hides 3D mountain completely, renders HTML content)
  if (uiType === 'fullcover') {
    // Hide subheading and infobox
    if (subheadingDisplay) subheadingDisplay.style.opacity = '0';
    if (activeInfobox) {
      activeInfobox.style.opacity = '0';
      activeInfobox.style.pointerEvents = 'none';
    }

    if (currentActiveSectionId !== activeSection.id) {
      currentActiveSectionId = activeSection.id;

      if (fullcoverDisplay) {
        fullcoverDisplay.style.backgroundColor = activeSection.backgroundColor || '#F6F4EE';
      }

      const htmlFile = activeSection.infoboxHtml || activeSection.contentHtml || activeSection.html;
      if (htmlFile && fullcoverContent) {
        const cachedHtml = htmlCache[activeSection.id];
        if (cachedHtml) {
          fullcoverContent.innerHTML = cachedHtml;
        } else {
          fetch(`${import.meta.env.BASE_URL}infoboxes/${htmlFile}`)
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.text();
            })
            .then((html) => {
              htmlCache[activeSection.id] = html;
              fullcoverContent.innerHTML = html;
            })
            .catch((err) => console.warn(`Could not load fullcover HTML:`, err));
        }
      }
    }

    // Fullcover transition: fades in smoothly (0-0.20), stays solid (0.20-0.80), fades out (0.80-1.0)
    let opacity = 0;
    let offsetY = 0;
    if (progress < 0.20) {
      const pIn = progress / 0.20;
      opacity = pIn;
      offsetY = (1 - pIn) * 20;
    } else if (progress <= 0.80) {
      opacity = 1.0;
      const drift = ((progress - 0.20) / 0.60) * 15;
      offsetY = -drift;
    } else {
      const pOut = (progress - 0.80) / 0.20;
      opacity = 1.0 - pOut;
      offsetY = -15 - (pOut * 25);
    }

    if (fullcoverDisplay) {
      fullcoverDisplay.style.opacity = opacity.toFixed(3);
      fullcoverDisplay.style.transform = `translateY(${offsetY.toFixed(1)}px)`;
      fullcoverDisplay.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
    }
    return;
  }

  // Not in a fullcover section: hide fullcover display
  if (fullcoverDisplay) {
    fullcoverDisplay.style.opacity = '0';
    fullcoverDisplay.style.pointerEvents = 'none';
  }

  // 3. Centered Subheading Lifecycle:
  // Starts lower (+26vh), crosses center (0vh) around progress=0.48, ends upper (-28vh)
  if (uiType === 'subheading') {
    // Hide infobox
    if (activeInfobox) {
      activeInfobox.style.opacity = '0';
      activeInfobox.style.pointerEvents = 'none';
    }

    if (currentActiveSectionId !== activeSection.id) {
      currentActiveSectionId = activeSection.id;
      if (subheadingText) subheadingText.textContent = activeSection.subheading || '';
      if (subheadingNote) {
        subheadingNote.textContent = activeSection.subheadingNote || '';
        subheadingNote.style.display = activeSection.subheadingNote ? 'block' : 'none';
      }
    }

    // Vertical travel: +26vh to -28vh (crosses exact center of screen)
    const currentY = 26 - (progress * 54);

    // Opacity: fades in (0-0.18), solid crossing center (0.18-0.72), fades out before top (0.72-0.96)
    let opacity = 0;
    if (progress < 0.18) {
      opacity = progress / 0.18;
    } else if (progress <= 0.72) {
      opacity = 1.0;
    } else {
      opacity = Math.max(0, 1.0 - (progress - 0.72) / 0.24);
    }

    if (subheadingDisplay) {
      subheadingDisplay.style.opacity = opacity.toFixed(3);
      subheadingDisplay.style.transform = `translate(-50%, calc(-50% + ${currentY.toFixed(1)}vh))`;
    }
    return;
  }

  // 4. Infobox Lifecycle (Light or Dark theme)
  // Starts lower (+34vh), crosses middle of screen (0vh) around progress=0.51, reaches upper (-32vh)
  // Total vertical travel = 66vh, fading out completely before reaching top edge
  if (uiType === 'infobox') {
    // Hide subheading
    if (subheadingDisplay) subheadingDisplay.style.opacity = '0';

    if (currentActiveSectionId !== activeSection.id) {
      currentActiveSectionId = activeSection.id;

      // Apply theme (theme-light or theme-dark)
      const themeClass = getSectionTheme(activeSection);
      activeInfobox.className = `infobox ${themeClass}`;

      // Insert preloaded content or fallback
      const cachedHtml = htmlCache[activeSection.id];
      if (cachedHtml) {
        infoboxContent.innerHTML = cachedHtml;
      } else if (activeSection.infoboxHtml) {
        fetch(`${import.meta.env.BASE_URL}infoboxes/${activeSection.infoboxHtml}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
          })
          .then((html) => {
            htmlCache[activeSection.id] = html;
            infoboxContent.innerHTML = html;
          })
          .catch((err) => console.warn(`Could not load infobox HTML:`, err));
      }
    }

    // Vertical travel: +34vh -> -32vh (travels 66vh upwards across the viewport)
    const currentY = 34 - (progress * 66);

    // Opacity:
    // 0.0 -> 0.18: Fade into view
    // 0.18 -> 0.72: Fully visible while crossing screen center
    // 0.72 -> 0.96: Fades away before reaching the top of the screen
    let opacity = 0;
    if (progress < 0.18) {
      opacity = progress / 0.18;
    } else if (progress <= 0.72) {
      opacity = 1.0;
    } else {
      opacity = Math.max(0, 1.0 - (progress - 0.72) / 0.24);
    }

    if (activeInfobox) {
      activeInfobox.style.opacity = opacity.toFixed(3);
      activeInfobox.style.transform = `translateY(${currentY.toFixed(1)}vh)`;
      activeInfobox.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
    }
    return;
  }

  // If uiType is 'none' or unspecified, hide all
  if (subheadingDisplay) subheadingDisplay.style.opacity = '0';
  if (activeInfobox) {
    activeInfobox.style.opacity = '0';
    activeInfobox.style.pointerEvents = 'none';
  }
  if (fullcoverDisplay) {
    fullcoverDisplay.style.opacity = '0';
    fullcoverDisplay.style.pointerEvents = 'none';
  }
}

