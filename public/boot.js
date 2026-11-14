// Runs before first paint: claim the stage only when the live version can run.
// If app.js never confirms, hand the page back to the plain version.
(function () {
  var root = document.documentElement;
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.WebGL2RenderingContext) return;
    root.className = "live";
    setTimeout(function () {
      if (!root.dataset.view) root.className = "";
    }, 5000);
  } catch (error) {
    root.className = "";
  }
})();
