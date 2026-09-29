import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { responsiveConfig } from './responsiveConfig.js';

let scene, camera, renderer, model, config;
let camMarkers = {};
let rotationSpeed = 0.05;

// Transition state
let currentSection = null;

// Pre-allocated vectors & math primitives for ZERO GARBAGE COLLECTION pauses in the animation loop
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _currentLookAt = new THREE.Vector3();
const _tempSpherical = new THREE.Spherical();
const _markerWorldPos = new THREE.Vector3();
const _tempOffset = new THREE.Vector3();

// ---- HTML background crossfade ----
let bgAEl, bgBEl;
let activeBg = 'A';
const BACKGROUND_FADE_MS_DEFAULT = 1000;
let firstBackgroundApplied = false;
let currentBackground = null; // "background" value of the active section, as written in sections.json
let currentFadeMs = BACKGROUND_FADE_MS_DEFAULT;
let appliedBgImage = null; // CSS background-image last written to a layer

// Mobile variants ("Name_mobile.jpg") are probed on first use: true = exists, false = missing or still loading
const mobileVariantExists = {};

// Damping coefficient for exponential decay: factor = 1 - exp(-damping * delta)
const CAMERA_DAMPING = 4.5;

export function getDeviceCategory() {
  const w = window.innerWidth;
  if (w >= responsiveConfig.breakpoints.desktop) return 'desktop';
  if (w >= responsiveConfig.breakpoints.tablet) return 'tablet';
  return 'mobile';
}

/**
 * "background" in sections.json is either an image filename in /patterns/ (e.g. "Stars.jpg"),
 * a CSS gradient (e.g. "linear-gradient(180deg, #0b1d3a, #6a8fbf)"), or a CSS color (e.g. "#1a2b3c")
 */
function isImageBackground(value) {
  return /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(value);
}

/**
 * Converts a "background" value into a background-image CSS value.
 * Solid colors become a same-color gradient so every kind lives in background-image
 * and the .bg-layer size/position rules stay intact.
 */
function toBackgroundImage(value) {
  if (isImageBackground(value)) return `url("/patterns/${value}")`;
  if (value.includes('gradient(')) return value;
  return `linear-gradient(${value}, ${value})`;
}

function mobileVariantName(value) {
  return value.replace(/(\.[^.]+)$/, '_mobile$1');
}

/**
 * Tries to load "Name_mobile.ext"; if it exists and its section is still showing, swaps it in
 */
function probeMobileVariant(value) {
  mobileVariantExists[value] = false; // desktop version is used until the probe succeeds
  const img = new Image();
  img.onload = () => {
    mobileVariantExists[value] = true;
    if (currentBackground === value) refreshBackground();
  };
  img.src = `/patterns/${mobileVariantName(value)}`;
}

/**
 * On mobile, swaps an image background for its "_mobile" version when one exists
 */
function resolveBackground(value) {
  if (!isImageBackground(value) || getDeviceCategory() !== 'mobile') return value;
  if (!(value in mobileVariantExists)) probeMobileVariant(value);
  return mobileVariantExists[value] ? mobileVariantName(value) : value;
}

/**
 * Re-applies the active section's background if the resolved version changed
 * (mobile variant finished loading, or the window crossed the mobile breakpoint)
 */
function refreshBackground() {
  if (!currentBackground) return;
  if (toBackgroundImage(resolveBackground(currentBackground)) !== appliedBgImage) {
    setBackgroundLayer(currentBackground, false, currentFadeMs);
  }
}

/**
 * Preload all background images into browser memory to eliminate transition hitches
 */
function preloadBackgrounds(sections) {
  if (!sections) return;
  sections.forEach((s) => {
    if (s.background && isImageBackground(s.background)) {
      const img = new Image();
      img.src = `/patterns/${s.background}`;
      resolveBackground(s.background); // on mobile, starts probing/preloading the "_mobile" version
    }
  });
}

export function initScene(sections) {
  config = sections;
  preloadBackgrounds(sections);

  scene = new THREE.Scene(); // scene.background = null keeps canvas transparent

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );

  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  // Lighting
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(5, 10, 7);
  scene.add(light);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  // Grab or create the two HTML background layers
  bgAEl = document.getElementById('bgA');
  bgBEl = document.getElementById('bgB');
  if (!bgAEl || !bgBEl) {
    bgAEl = document.createElement('div');
    bgBEl = document.createElement('div');
    bgAEl.id = 'bgA';
    bgBEl.id = 'bgB';
    bgAEl.className = 'bg-layer';
    bgBEl.className = 'bg-layer';
    document.body.insertBefore(bgBEl, canvas);
    document.body.insertBefore(bgAEl, bgBEl);
  }

  // Load GLTF Model & Shared Textures
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();

  // Load shared textures ONCE outside the traversal to save GPU memory & CPU cycles
  const pinTexture = textureLoader.load('/3dmodels/Pin.png');
  const sharedSpriteMaterial = new THREE.SpriteMaterial({
    map: pinTexture,
    transparent: true,
    depthTest: true,
    sizeAttenuation: false,
  });

  const mainTexture = textureLoader.load('/3dmodels/MainTexture.jpg');
  mainTexture.flipY = false;
  const sharedMeshMaterial = new THREE.MeshBasicMaterial({ map: mainTexture });

  loader.load('/3dmodels/MountainSceneNew.gltf', (gltf) => {
    model = gltf.scene;
    scene.add(model);

    gltf.scene.traverse((obj) => {
      if (obj.name.startsWith('Marker')) {
        camMarkers[obj.name] = obj;

        const sprite = new THREE.Sprite(sharedSpriteMaterial.clone());
        sprite.scale.set(0.04, 0.06, 1);
        sprite.position.set(0, 10, 0);
        obj.add(sprite);

        camMarkers[obj.name + '_sprite'] = sprite;
      } else if (obj.isMesh) {
        // Reuse shared material instance across all terrain meshes
        obj.material = sharedMeshMaterial;
      }
    });

    // Set initial section instantly without lerp delay
    if (config && config.length > 0) {
      updateConfig(config[0].id, true);
    }
  });

  window.addEventListener('resize', onWindowResize, { passive: true });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  refreshBackground();

  if (!currentSection || !config) return;

  const section = config.find((s) => s.id === currentSection);
  if (!section) return;

  calculateTargetPositions(section);

  // Instantly align camera on resize to prevent jerky recovery
  camera.position.copy(_targetCamPos);
  _currentLookAt.copy(_targetLookAt);
  camera.lookAt(_currentLookAt);
}

/**
 * Recomputes _targetCamPos and _targetLookAt using pre-allocated math objects (Zero Allocations)
 */
function calculateTargetPositions(section) {
  const device = getDeviceCategory();
  const dist = section.defaultDistance * (responsiveConfig.distanceScale[device] || 1);
  const polar = THREE.MathUtils.degToRad(section.polarAngle ?? 45);
  const azimuth = THREE.MathUtils.degToRad(section.azimuthAngle ?? 45);

  _tempSpherical.set(dist, polar, azimuth);

  if (section.cameraTarget && section.cameraTarget !== 'default' && camMarkers[section.cameraTarget]) {
    // Target is a specific marker
    camMarkers[section.cameraTarget].getWorldPosition(_markerWorldPos);
    _tempOffset.setFromSpherical(_tempSpherical);
    _targetCamPos.copy(_markerWorldPos).add(_tempOffset);
    _targetLookAt.copy(_markerWorldPos);
  } else {
    // Default target at origin
    _targetCamPos.setFromSpherical(_tempSpherical);
    _targetLookAt.set(0, 0, 0);
  }

  // Vertical offset: shift both camera and target down along Y so the mountain appears higher on screen
  let vOffset = 0;
  if (typeof section.verticalOffset === 'number') {
    // On mobile portrait, infobox takes up more vertical height, so apply aspect multiplier
    const multiplier = device === 'mobile' ? 1.5 : (device === 'tablet' ? 1.2 : 1.0);
    vOffset = section.verticalOffset * multiplier;
  } else if (section.verticalOffset && typeof section.verticalOffset === 'object') {
    vOffset = section.verticalOffset[device] ?? 0;
  }

  if (vOffset !== 0) {
    _targetCamPos.y -= vOffset;
    _targetLookAt.y -= vOffset;
  }
}

const clock = new THREE.Clock();

export function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1); // Guard against giant delta jumps after tab blur

  // Rotate model (time-based)
  if (model) {
    model.rotation.y += rotationSpeed * delta;
  }

  // Update target positions dynamically if tracking an anchor attached to the rotating model
  if (currentSection && config) {
    const section = config.find((s) => s.id === currentSection);
    if (section) {
      calculateTargetPositions(section);
    }
  }

  // Delta-time exponential camera damping: smooth & monitor-refresh-rate independent
  const factor = 1.0 - Math.exp(-CAMERA_DAMPING * delta);

  camera.position.lerp(_targetCamPos, factor);
  _currentLookAt.lerp(_targetLookAt, factor);
  camera.lookAt(_currentLookAt);

  renderer.render(scene, camera);
}

export function updateConfig(sectionId, instant = false) {
  const section = config.find((s) => s.id === sectionId);
  if (!section || (sectionId === currentSection && !instant)) return;

  currentSection = sectionId;
  rotationSpeed = section.rotationSpeed ?? 0.05;

  calculateTargetPositions(section);

  if (instant) {
    camera.position.copy(_targetCamPos);
    _currentLookAt.copy(_targetLookAt);
    camera.lookAt(_currentLookAt);
  }

  // HTML background crossfade
  const fadeMs = section.backgroundFadeMs ?? BACKGROUND_FADE_MS_DEFAULT;
  setBackgroundLayer(section.background, instant, fadeMs);

  // Marker visibility
  const visibleList = section.visibleMarkers || [];
  Object.keys(camMarkers).forEach((name) => {
    if (name.endsWith('_sprite')) {
      const originalName = name.replace('_sprite', '');
      camMarkers[name].visible = visibleList.includes(originalName);
    }
  });
}

/**
 * Crossfade the two fixed HTML background layers without layout thrashing
 */
function setBackgroundLayer(background, instant = false, fadeMs = BACKGROUND_FADE_MS_DEFAULT) {
  if (!background || !bgAEl || !bgBEl) return;
  currentBackground = background;
  currentFadeMs = fadeMs;
  const bgImage = toBackgroundImage(resolveBackground(background));
  appliedBgImage = bgImage;

  bgAEl.style.transition = `opacity ${fadeMs}ms ease`;
  bgBEl.style.transition = `opacity ${fadeMs}ms ease`;

  if (!firstBackgroundApplied || instant) {
    bgAEl.style.backgroundImage = bgImage;
    bgAEl.style.opacity = '1';
    bgBEl.style.opacity = '0';
    activeBg = 'A';
    firstBackgroundApplied = true;
    return;
  }

  if (activeBg === 'A') {
    bgBEl.style.backgroundImage = bgImage;
    requestAnimationFrame(() => {
      bgBEl.style.opacity = '1';
      bgAEl.style.opacity = '0';
      activeBg = 'B';
    });
  } else {
    bgAEl.style.backgroundImage = bgImage;
    requestAnimationFrame(() => {
      bgAEl.style.opacity = '1';
      bgBEl.style.opacity = '0';
      activeBg = 'A';
    });
  }
}

export { scene };
