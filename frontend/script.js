let viewer;
let points = [];
let map;
let georefLayer;

const API_BASE_URL = 'http://127.0.0.1:8000';

document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
document.getElementById('georeference').addEventListener('click', startGeoreferencing);
document.getElementById('download').addEventListener('click', downloadGeoTIFF);

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            initializeViewer(e.target.result);
            uploadImage(file);
        }
        reader.readAsDataURL(file);
    }
}

function initializeViewer(imageSrc) {
    if (viewer) {
        viewer.destroy();
    }
    viewer = OpenSeadragon({
        id: "imageViewer",
        prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
        tileSources: {
            type: 'image',
            url: imageSrc
        },
        showNavigationControl: true,
        navigatorPosition: "TOP_RIGHT",
        defaultZoomLevel: 1,
        minZoomLevel: 0.1,
        maxZoomLevel: 150
    });

    viewer.addHandler('canvas-click', function(event) {
        if (!event.quick) return;
        const viewportPoint = viewer.viewport.pointFromPixel(event.position);
        const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);
        var element = document.createElement('div');
        element.className = 'my-icon';
        viewer.addOverlay({
          element: element,
          location: viewportPoint
        });
        addPoint(imagePoint.x, imagePoint.y);
    });   
}

function addPoint(x, y) {
    const point = { x, y, lon: '', lat: '' };
    points.push(point);
    updateTable();
    updateGeoreferenceButton();
}

function updateTable() {
    const tbody = document.querySelector('#coordsTable tbody');
    tbody.innerHTML = '';
    points.forEach((point, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${point.x.toFixed(2)}</td>
            <td>${point.y.toFixed(2)}</td>
            <td><input type="number" step="any" value="${point.lon}" onchange="updateCoordinate(${index}, 'lon', this.value)"></td>
            <td><input type="number" step="any" value="${point.lat}" onchange="updateCoordinate(${index}, 'lat', this.value)"></td>
            <td><button onclick="deletePoint(${index})">Delete</button></td>
        `;
    });
}

function updateCoordinate(index, coord, value) {
    points[index][coord] = parseFloat(value);
    updateGeoreferenceButton();
}

function deletePoint(index) {
    points.splice(index, 1);
    updateTable();
    updateGeoreferenceButton();
}

function updateGeoreferenceButton() {
    const button = document.getElementById('georeference');
    button.disabled = points.length < 3 || points.some(p => p.lon === '' || p.lat === '');
}

async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE_URL}/upload-image/`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Image uploaded:', data);
    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image. Please try again.');
    }
}

async function startGeoreferencing() {
    for (const point of points) {
        await addGCP(point);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/georeference/`, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Georeferencing complete:', data);
        initializeMap();
    } catch (error) {
        console.error('Error georeferencing:', error);
        alert('Failed to georeference image. Please try again.');
    }
}

async function addGCP(point) {
    const formData = new FormData();
    formData.append('x', point.x);
    formData.append('y', point.y);
    formData.append('lon', point.lon);
    formData.append('lat', point.lat);

    try {
        const response = await fetch(`${API_BASE_URL}/add-gcp/`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('GCP added:', data);
    } catch (error) {
        console.error('Error adding GCP:', error);
        alert('Failed to add ground control point. Please try again.');
    }
}

function initializeMap() {
    if (!map) {
        map = L.map('map').setView([0, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    }

    if (georefLayer) {
        map.removeLayer(georefLayer);
    }

    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
    console.log('Calculated bounds:', bounds);

    georefLayer = L.imageOverlay(`${API_BASE_URL}/download-georeferenced-image/`, bounds, { opacity: 1 })
        .on('load', () => {
            console.log('Georeferenced image overlay loaded successfully.');
            map.fitBounds(bounds);
        })
        .on('error', (err) => {
            console.error('Error loading georeferenced image overlay:', err);
        })
        .addTo(map);

    document.getElementById('download').disabled = false;
}

function downloadGeoTIFF() {
    window.location.href = `${API_BASE_URL}/download-georeferenced-image/`;
}
