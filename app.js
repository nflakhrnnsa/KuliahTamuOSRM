const map = L.map("map").setView([-6.2, 106.8], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const osrmBaseUrl = "https://router.project-osrm.org";

let waypoints = [];  
let tripLayer = null;
/*null itu artinya kosong, nanti dipake buat nampung garis trip*/

const profileSelect = document.getElementById("profile");
const clearBtn = document.getElementById("clear");
const matrixBtn = document.getElementById("btn-matrix");
const tripBtn = document.getElementById("btn-trip");
const stopsList = document.getElementById("stops-list");
const matrixContainer = document.getElementById("matrix-container");
const tripOrderList = document.getElementById("trip-order");
const infoDiv = document.getElementById("info");

// Add waypoint on map click
map.on("click", (e) => {
  addWaypoint(e.latlng);
});
/*fungsi buat nambah waypoint pas di klik peta*/

function addWaypoint(latlng) {
  const index = waypoints.length;
  const marker = L.marker(latlng, { draggable: true }) 
    .addTo(map)
    .bindPopup(`Stop ${index + 1}`)
    .openPopup();

  marker.on("dragend", () => { // event pas marker selesai di drag
    const pos = marker.getLatLng();
    waypoints[index].lat = pos.lat;
    waypoints[index].lng = pos.lng;
    renderStopsList();
  });

  waypoints.push({
    lat: latlng.lat,
    lng: latlng.lng,
    marker
  });

  renderStopsList();
}

function clearAll() { // fungsi buat ngebersihin semua data
  waypoints.forEach((w) => map.removeLayer(w.marker)); // hapus marker dari peta
  waypoints = []; // reset waypoints
  if (tripLayer) { // jika ada trip layer
    map.removeLayer(tripLayer); // hapus dari peta
    tripLayer = null; // reset trip layer
  }
  matrixContainer.innerHTML = ""; // kosongin matrix
  stopsList.innerHTML = ""; // kosongin list stops
  tripOrderList.innerHTML = ""; // kosongin urutan trip
  infoDiv.innerHTML = ""; // kosongin info
}

clearBtn.addEventListener("click", clearAll); // tombol clear dipencet

function renderStopsList() { // fungsi buat nampilin list stops
  stopsList.innerHTML = ""; // kosongin list dulu
  waypoints.forEach((wp, idx) => { // loop tiap waypoint
    const li = document.createElement("li"); // buat elemen list item
    li.textContent = `Stop ${idx + 1}: (${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)})`; // nampilin lat lng
    stopsList.appendChild(li); // masukin ke list
    // update popup
    wp.marker.setPopupContent(`Stop ${idx + 1}`); // update popup marker
  });
}

// Helper: format
function formatDurationMinutes(seconds) {
  return (seconds / 60).toFixed(1);
}
function formatDistanceKm(meters) {
  return (meters / 1000).toFixed(2);
}

// Compute OD Matrix
matrixBtn.addEventListener("click", async () => { // tombol matrix dipencet // async itu biar bisa pake await di dalamnya, await itu buat nunggu hasil dari operasi asynchronous kaya fetch, jadi gak blocking, jadi kode lain tetep jalan, misal nunggu data dari server, tapi UI tetep responsif, gak ngehang
  if (waypoints.length < 2) { // kalo titik kurang dari 2
    infoDiv.innerHTML = "Tambah minimal 2 titik untuk matrix."; // kasih info
    return; // keluar fungsi
  }
  infoDiv.innerHTML = "Computing OD matrix...";
  matrixContainer.innerHTML = "";
  tripOrderList.innerHTML = "";
  if (tripLayer) {
    map.removeLayer(tripLayer);
    tripLayer = null;
  }

  const profile = profileSelect.value;
  const coords = waypoints
    .map((wp) => `${wp.lng},${wp.lat}`)
    .join(";");

  const url = `${osrmBaseUrl}/table/v1/${profile}/${coords}?annotations=duration`; // bikin url buat request table (ini yang bikin dinamis)

  try { // coba fetch data
    const res = await fetch(url); // fetch data dari OSRM
    const data = await res.json(); // parse ke json

    if (data.code !== "Ok") { // kalo ada error
      infoDiv.innerHTML = `Error from OSRM: ${data.message || data.code}`; // kasih info error
      return;
    }

    const durations = data.durations; // ambil matrix durasi
    renderMatrix(durations); // render matrix ke HTML
    infoDiv.innerHTML = "OD matrix computed."; // kasih info sukses
  } catch (err) { // kalo gagal fetch
    console.error(err); // log error
    infoDiv.innerHTML = "Failed to fetch table."; // kasih info gagal
  }
});

function renderMatrix(durations) { // fungsi buat nampilin matrix di HTML
  const n = durations.length; // jumlah waypoint
  let html = "<table><tr><th></th>"; // mulai bikin tabel
  for (let j = 0; j < n; j++) { // header kolom, loop tiap waypoint
    html += `<th>${j + 1}</th>`; // nampilin nomor stop, dimulai dari 1, bukan 0, makanya +1, karena array mulai dari 0
  }
  html += "</tr>";
  for (let i = 0; i < n; i++) {
    html += `<tr><th>${i + 1}</th>`;
    for (let j = 0; j < n; j++) {
      const val = durations[i][j];
      html += `<td>${val == null ? "-" : formatDurationMinutes(val)}</td>`;
    }
    html += "</tr>";
  }
  html += "</table>";
  matrixContainer.innerHTML = html;
}

// Optimize Trip (TSP-like)
tripBtn.addEventListener("click", async () => { // tombol trip dipencet, fungsi mirip kayak matrix, tapi ini buat trip
  if (waypoints.length < 3) { // kalo titik kurang dari 3
    infoDiv.innerHTML = "Minimal 3 titik untuk trip."; // kasih info
    return;
  }
  infoDiv.innerHTML = "Optimizing trip (TSP heuristic)..."; // kasih info lagi
  matrixContainer.innerHTML = "";
  tripOrderList.innerHTML = "";
  if (tripLayer) {
    map.removeLayer(tripLayer);
    tripLayer = null;
  }

  const profile = profileSelect.value; // ambil profile dari select
  const coords = waypoints
    .map((wp) => `${wp.lng},${wp.lat}`)
    .join(";");

  // first point as start & end (roundtrip)
  const url = `${osrmBaseUrl}/trip/v1/${profile}/${coords}?roundtrip=true&source=first&destination=last&geometries=geojson`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== "Ok") {
      infoDiv.innerHTML = `Error from OSRM: ${data.message || data.code}`;
      return;
    }
// Get the first trip from response
    const trip = data.trips[0];
    if (!trip) {
      infoDiv.innerHTML = "No trip found.";
      return;
    }
// Render trip on map
    const coordsTrip = trip.geometry.coordinates.map((c) => [c[1], c[0]]);
    tripLayer = L.polyline(coordsTrip, {
      color: "#1976d2",
      weight: 5,
      opacity: 0.9
    }).addTo(map);
    map.fitBounds(tripLayer.getBounds(), { padding: [40, 40] });

    infoDiv.innerHTML = `
      <b>Trip found!</b><br/>
      Total distance: ${formatDistanceKm(trip.distance)} km<br/>
      Total duration: ${(trip.duration / 3600).toFixed(2)} hours
    `;

    renderTripOrder(data.waypoints); // panggil fungsi buat nampilin urutan trip
  } catch (err) {
    console.error(err);
    infoDiv.innerHTML = "Failed to fetch trip.";
  }
});

// Render urutan kunjungan dari waypoints trip
function renderTripOrder(waypointsTrip) {
  tripOrderList.innerHTML = "";
  // waypointsTrip mengandung info "waypoint_index" = urutan di trip
  const sorted = [...waypointsTrip].sort(
    (a, b) => a.waypoint_index - b.waypoint_index
  );

  sorted.forEach((wp, idx) => { // loop tiap waypoint di trip yang sudah diurutkan
    const li = document.createElement("li");
    const originalIndex = wp.waypoint_index;
    li.textContent = `Visit Stop ${originalIndex + 1} at (${wp.location[1].toFixed(
      5
    )}, ${wp.location[0].toFixed(5)})`;
    tripOrderList.appendChild(li);
  });
}