const root = document.documentElement;
root.classList.add("js");
const hero = document.querySelector(".hero");
const heroLetters = [...document.querySelectorAll(".hero-name span")];
const pointerX = document.querySelector("#pointer-x");
const pointerY = document.querySelector("#pointer-y");
const signalToggle = document.querySelector("#signal-toggle");
const paletteStatus = document.querySelector("#palette-status");
const localTime = document.querySelector("#local-time");
const year = document.querySelector("#year");
const themeColor = document.querySelector('meta[name="theme-color"]');
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");

const palettes = [
  { name: "brand", label: "Charcoal signal", theme: "#181818" },
  { name: "green", label: "Green signal", theme: "#23ce6b" },
];

let pointerFrame = 0;
let pointer = { x: window.innerWidth * 0.7, y: window.innerHeight * 0.2 };

function padCoordinate(value) {
  return String(Math.max(0, Math.round(value))).padStart(3, "0");
}

function renderPointer() {
  pointerFrame = 0;

  if (!hero || reduceMotion.matches || !finePointer.matches) return;

  const rect = hero.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (pointer.x - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (pointer.y - rect.top) / rect.height));

  root.style.setProperty("--pointer-px", `${(x * 100).toFixed(1)}%`);
  root.style.setProperty("--pointer-py", `${(y * 100).toFixed(1)}%`);

  if (pointerX) pointerX.textContent = padCoordinate(pointer.x);
  if (pointerY) pointerY.textContent = padCoordinate(pointer.y);

  heroLetters.forEach((letter, index) => {
    const letterCenter = (index + 0.5) / heroLetters.length;
    const distance = Math.abs(x - letterCenter);
    const pull = Math.max(0, 1 - distance * 3.2);
    const direction = x < letterCenter ? -1 : 1;
    const stretch = 1 + pull * 0.22;
    const lift = -(1 - y) * pull * 22;
    const tilt = direction * pull * 3.5;

    letter.style.setProperty("--stretch", stretch.toFixed(3));
    letter.style.setProperty("--lift", `${lift.toFixed(1)}px`);
    letter.style.setProperty("--tilt", `${tilt.toFixed(2)}deg`);
  });
}

window.addEventListener("pointermove", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointer);
}, { passive: true });

window.addEventListener("resize", () => {
  if (!pointerFrame) pointerFrame = window.requestAnimationFrame(renderPointer);
}, { passive: true });

document.querySelectorAll("[data-project]").forEach((project) => {
  project.addEventListener("pointermove", (event) => {
    if (reduceMotion.matches || !finePointer.matches) return;
    const rect = project.getBoundingClientRect();
    project.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    project.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, { passive: true });
});

function setPalette(name, announce = false) {
  const palette = palettes.find((candidate) => candidate.name === name) ?? palettes[0];
  root.dataset.palette = palette.name;
  if (themeColor) themeColor.setAttribute("content", palette.theme);
  if (announce && paletteStatus) paletteStatus.textContent = `${palette.label} active.`;
}

signalToggle?.addEventListener("click", () => {
  const currentIndex = palettes.findIndex((palette) => palette.name === root.dataset.palette);
  const next = palettes[(currentIndex + 1) % palettes.length];
  if (next) setPalette(next.name, true);
});

function updateClock() {
  const now = new Date();
  const display = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  if (localTime) {
    localTime.textContent = display;
    localTime.dateTime = now.toISOString();
  }

  if (year) {
    year.textContent = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
    }).format(now);
  }
}

updateClock();
window.setInterval(updateClock, 1000);

const reveals = [...document.querySelectorAll(".reveal")];

if (reduceMotion.matches || !("IntersectionObserver" in window)) {
  reveals.forEach((element) => element.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

  reveals.forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index % 3, 2) * 70}ms`;
    observer.observe(element);
  });
}

renderPointer();
