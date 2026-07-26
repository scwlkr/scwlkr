const occupancy = document.querySelector("#occupancy");
const enter = document.querySelector("#enter");

async function refreshOccupancy() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return;
    const data = await response.json();
    occupancy.textContent = String(data.occupancy ?? 0);
  } catch {
    occupancy.textContent = "?";
  }
}

enter.addEventListener("click", () => {
  document.body.dataset.entered = "true";
});

void refreshOccupancy();
