const ITAPERUNA = [-21.1986, -41.8904];
const API_URL = "https://backend-render-a8ee.onrender.com";
const CIDADE_PERMITIDA = "ITAPERUNA";

const $ = (selector) => document.querySelector(selector);

const mapEl = $("#map");
const form = $("#report-form");
const modal = $("#report-modal");
const message = $("#form-message");
const statusText = $("#status-text");

let map = null;
let markers = null;
let heatLayer = null;

if (mapEl && window.L) {
  map = L.map("map", { zoomControl: true }).setView(ITAPERUNA, 14);
  markers = L.layerGroup().addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
}

function setMessage(text, type = "info") {
  if (!message) return;

  message.textContent = text;
  message.className = "rounded-md px-3 py-2 text-sm";
  message.classList.remove("hidden");
  message.classList.add(type === "error" ? "bg-red-50" : "bg-emerald-50");
  message.classList.add(type === "error" ? "text-red-700" : "text-emerald-700");
}

function openModal() {
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModal() {
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  if (message) message.classList.add("hidden");
}

function setLocation(lat, lng) {
  const latInput = $("#lat-input");
  const lngInput = $("#lng-input");

  if (latInput) latInput.value = Number(lat).toFixed(6);
  if (lngInput) lngInput.value = Number(lng).toFixed(6);
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function renderIncidents(incidents) {
  if (!map || !markers) return;

  markers.clearLayers();
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }

  const validIncidents = incidents
    .map((item) => ({
      ...item,
      latitude: Number(item.lat),
      longitude: Number(item.lng)
    }))
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

  const points = validIncidents.map((item) => [item.latitude, item.longitude, 0.8]);

  if (points.length && L.heatLayer) {
    heatLayer = L.heatLayer(points, { radius: 28, blur: 18, minOpacity: 0.45 }).addTo(map);
  }

  validIncidents.forEach((item) => {
    L.marker([item.latitude, item.longitude])
      .bindPopup(
        `<strong>${item.categoria || "Ocorrencia"}</strong><br>` +
        `${item.rua || ""} ${item.bairro ? "- " + item.bairro : ""}<br>` +
        `Status: ${item.status || "Pendente"}<br>` +
        `Apoios: ${item.apoios || 1}`
      )
      .addTo(markers);
  });

  if (points.length) {
    map.fitBounds(points.map(([lat, lng]) => [lat, lng]), { padding: [35, 35], maxZoom: 15 });
  }

  if (statusText) {
    statusText.textContent = points.length
      ? `${points.length} relato(s) encontrados no mapa.`
      : "Ainda nao ha relatos cadastrados.";
  }
}

async function loadData() {
  const [incidentsRes, statsRes] = await Promise.all([
    fetch(`${API_URL}/api/pontos-mapa`),
    fetch(`${API_URL}/api/estatisticas`)
  ]);

  if (!incidentsRes.ok || !statsRes.ok) {
    throw new Error("Nao foi possivel carregar os dados.");
  }

  const incidents = await incidentsRes.json();
  const stats = await statsRes.json();

  renderIncidents(incidents);
  setText("#total-incidents", stats.total);
  setText("#total-neighborhoods", stats.bairros);
  setText("#top-category", `${stats.resolvidos} resolvido(s)`);
}

async function buscarCoordenadasPorEnderecoManual(logradouro, bairro) {
  const consulta = `${logradouro}, ${bairro}, ${CIDADE_PERMITIDA}, RJ, Brasil`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(consulta)}`;
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel validar o endereco informado.");
  }

  const results = await response.json();
  const result = results[0];

  if (!result) {
    throw new Error("Endereco nao encontrado em Itaperuna.");
  }

  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon)
  };
}

async function submitReport(event) {
  event.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  let lat = data.lat;
  let lng = data.lng;
  const rua = data.rua || data.logradouro || "";
  const bairro = data.bairroConfirmado || data.bairro || "";

  if ((!lat || !lng) && rua && bairro) {
    try {
      const coordenadas = await buscarCoordenadasPorEnderecoManual(rua, bairro);
      lat = coordenadas.lat;
      lng = coordenadas.lng;
    } catch (error) {
      setMessage(error.message, "error");
      return;
    }
  }

  if (!lat || !lng) {
    setMessage("Informe uma localizacao ou um endereco valido.", "error");
    return;
  }

  const payload = {
    lat,
    lng,
    categoria: data.categoria,
    descricao: data.descricao,
    rua,
    logradouro: rua,
    bairro,
    bairroConfirmado: bairro
  };

  const response = await fetch(`${API_URL}/api/incidentes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    setMessage(result.erro || "Erro ao enviar relato.", "error");
    return;
  }

  setMessage(result.mensagem || "Relato enviado com sucesso.");
  form.reset();
  await loadData();
  setTimeout(closeModal, 700);
}

function requestLocation() {
  if (!navigator.geolocation) {
    setMessage("Seu navegador nao oferece geolocalizacao.", "error");
    openModal();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      setLocation(coords.latitude, coords.longitude);
      if (map) map.setView([coords.latitude, coords.longitude], 16);
      openModal();
    },
    () => {
      setLocation(...ITAPERUNA);
      openModal();
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

const openReportBtn = $("#open-report");
const closeReportBtn = $("#close-report");
const locateBtn = $("#locate-btn");

if (openReportBtn) {
  openReportBtn.addEventListener("click", () => {
    setLocation(...ITAPERUNA);
    openModal();
  });
}

if (closeReportBtn) closeReportBtn.addEventListener("click", closeModal);
if (locateBtn) locateBtn.addEventListener("click", requestLocation);

if (modal) {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
}

if (form) form.addEventListener("submit", submitReport);
if (window.lucide) lucide.createIcons();

loadData().catch((error) => {
  if (statusText) statusText.textContent = error.message;
});
