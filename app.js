const ITAPERUNA = [-21.1986, -41.8904];
const map = L.map("map", { zoomControl: true }).setView(ITAPERUNA, 14);
let markers = L.layerGroup().addTo(map);
let heatLayer = null;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const $ = (selector) => document.querySelector(selector);
const form = $("#report-form");
const modal = $("#report-modal");
const message = $("#form-message");

function setMessage(text, type = "info") {
  message.textContent = text;
  message.className = "rounded-md px-3 py-2 text-sm";
  message.classList.add(type === "error" ? "bg-red-50" : "bg-emerald-50");
  message.classList.add(type === "error" ? "text-red-700" : "text-emerald-700");
}

function openModal() {
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  message.classList.add("hidden");
}

function setLocation(lat, lng) {
  $("#lat-input").value = Number(lat).toFixed(6);
  $("#lng-input").value = Number(lng).toFixed(6);
}

function renderIncidents(incidents) {
  markers.clearLayers();
  if (heatLayer) {
    map.removeLayer(heatLayer);
  }

  const validIncidents = incidents
    .map((item) => ({
      ...item,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude)
    }))
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  const points = validIncidents.map((item) => [item.latitude, item.longitude, 0.8]);

  if (points.length) {
    heatLayer = L.heatLayer(points, { radius: 28, blur: 18, minOpacity: 0.45 }).addTo(map);
    validIncidents.forEach((item) => {
      L.marker([item.latitude, item.longitude])
        .bindPopup(`<strong>${item.categoria}</strong><br>${item.descricao || "Sem descrição"}<br><small>${item.dataHora || ""}</small>`)
        .addTo(markers);
    });
    map.fitBounds(points.map(([lat, lng]) => [lat, lng]), { padding: [35, 35], maxZoom: 15 });
  }

  $("#status-text").textContent = points.length
    ? `${points.length} relato(s) encontrados no mapa.`
    : "Ainda não há relatos cadastrados.";
}

async function loadData() {
  const [incidentsRes, statsRes] = await Promise.all([
    fetch("/api/incidents"),
    fetch("/api/stats")
  ]);

  if (!incidentsRes.ok || !statsRes.ok) {
    throw new Error("Não foi possível carregar os dados.");
  }

  const incidents = await incidentsRes.json();
  const stats = await statsRes.json();
  renderIncidents(incidents);
  $("#total-incidents").textContent = stats.total;
  $("#total-neighborhoods").textContent = stats.bairrosAtivos;
  $("#top-category").textContent = stats.categoriaMaisComum || "-";
}

async function submitReport(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch("/api/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json();

  if (!response.ok) {
    setMessage(payload.error || "Erro ao enviar relato.", "error");
    return;
  }

  setMessage("Relato enviado com sucesso.");
  form.reset();
  await loadData();
  setTimeout(closeModal, 700);
}

function requestLocation() {
  if (!navigator.geolocation) {
    setMessage("Seu navegador não oferece geolocalização.", "error");
    openModal();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      setLocation(coords.latitude, coords.longitude);
      map.setView([coords.latitude, coords.longitude], 16);
      openModal();
    },
    () => {
      setLocation(...ITAPERUNA);
      openModal();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

$("#open-report").addEventListener("click", () => {
  setLocation(...ITAPERUNA);
  openModal();
});
$("#close-report").addEventListener("click", closeModal);
$("#locate-btn").addEventListener("click", requestLocation);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
form.addEventListener("submit", submitReport);

lucide.createIcons();
loadData().catch((error) => {
  $("#status-text").textContent = error.message;
});
