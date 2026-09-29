import './styles/main.css';
import sections from './sections.json';
import { initScene, animate } from './scene.js';
import { setupScrollEvents } from './scroll.js';
import { setupUI } from './ui.js';

// Initialize UI templates & DOM references
setupUI(sections);

// Initialize Three.js scene, camera, lighting, and model
initScene(sections);
animate();

// Initialize unified scroll and progress listeners
setupScrollEvents(sections);