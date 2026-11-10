(function () {
  function decodePolyline(encoded) {
    let index = 0, lat = 0, lon = 0;
    const points = [];
    while (index < encoded.length) {
      const deltas = [];
      for (let axis = 0; axis < 2; axis++) {
        let value = 0, shift = 0, byte;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          value |= (byte & 31) << shift;
          shift += 5;
        } while (byte >= 32);
        deltas.push(value & 1 ? ~(value >> 1) : value >> 1);
      }
      lat += deltas[0];
      lon += deltas[1];
      points.push([lat / 1e5, lon / 1e5]);
    }
    return points;
  }

  // Base map with Chinese place names. OpenFreeMap vector tiles carry name:zh in the data;
  // we rewrite the style's label expressions to prefer Chinese, then English, and never show
  // Korean-only labels. Anything going wrong falls back to the plain raster tiles below.
  const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  const MAPLIBRE_LEAFLET_JS = 'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js';
  const CHINESE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const CHINESE_NAME = ['coalesce', ['get', 'name:zh-Hans'], ['get', 'name:zh'], ['get', 'name:zh-Hant'], ['get', 'name_en']];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('script failed: ' + src));
      document.head.append(script);
    });
  }
  function loadStyles(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
  async function createChineseVectorLayer() {
    loadStyles(MAPLIBRE_CSS);
    await loadScript(MAPLIBRE_JS);
    await loadScript(MAPLIBRE_LEAFLET_JS);
    if (!window.maplibregl || !L.maplibreGL) throw new Error('maplibre unavailable');
    const response = await fetch(CHINESE_STYLE);
    if (!response.ok) throw new Error('style http ' + response.status);
    const style = await response.json();
    style.layers = style.layers.filter(layer => layer.id !== 'building-3d');
    style.layers.forEach(layer => {
      const field = layer.layout && layer.layout['text-field'];
      if (field && JSON.stringify(field).includes('name')) layer.layout['text-field'] = CHINESE_NAME;
    });
    return L.maplibreGL({
      style,
      attribution: '© <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
    });
  }

  window.createTripMap = function (config) {
    const {home, spots, driving, walking, typeName, typeOrder} = config;
    const all = [home, ...spots];
    const byId = new Map(all.map(p => [p.id, p]));
    const $ = id => document.getElementById(id);
    let filter = 'all', query = '', selected = home, map, routeLayer;
    const markers = new Map();

    function walkingRoute(p) {
      const route = walking[p.id];
      return route?.[0] <= 1000 ? route : null;
    }
    function routeData(p) { return walkingRoute(p) || driving[p.id]; }
    function modeText(p) { return walkingRoute(p) ? '步行' : '驾车'; }
    function distanceText(p) {
      const meters = routeData(p)?.[0];
      if (meters == null) return config.missingDistanceText;
      if (config.closeDistanceLabel && meters < 50) return config.closeDistanceLabel;
      return meters < 1000 ? `${Math.round(meters / 50) * 50} 米` : `${(meters / 1000).toFixed(1)} 公里`;
    }
    function durationText(p) {
      const seconds = routeData(p)?.[1];
      if (seconds == null) return '';
      if (seconds === 0 && config.zeroDurationLabel) return config.zeroDurationLabel;
      if (p.id === 'airport') return config.airportDuration;
      return config.formatDuration(seconds / 60, Boolean(walkingRoute(p)));
    }
    function matching(p) {
      return (filter === 'all' || p.type === filter) &&
        (!query || `${p.name} ${p.area} ${p.tag || ''}`.toLowerCase().includes(query));
    }
    function renderList() {
      const visible = spots.filter(matching).sort((a, b) =>
        typeOrder[a.type] - typeOrder[b.type] ||
        (routeData(a)?.[0] ?? Infinity) - (routeData(b)?.[0] ?? Infinity));
      $('count').textContent = `${visible.length} 个地点 · 按类别及路线距离排列`;
      $('places').replaceChildren();
      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '没有找到相符的地点。试试其他关键字或切换类别。';
        $('places').append(empty);
      }
      visible.forEach(p => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `place${selected.id === p.id ? ' selected' : ''}`;
        button.dataset.type = p.type;
        button.innerHTML = `<span class="placeicon" aria-hidden="true">${p.icon}</span><span><strong>${p.name}</strong><small>${p.area} · ${p.tag || typeName[p.type]}</small></span><span class="distance">${modeText(p)} ${distanceText(p)}<br>${durationText(p)} ↗</span>`;
        button.addEventListener('click', () => select(p, true));
        $('places').append(button);
      });
    }
    function renderDetail() {
      const p = selected, isHome = p.id === 'home';
      $('detail').innerHTML = `<div class="detail-kind">${typeName[p.type]} · ${p.area}</div><h2>${p.icon} ${p.name}</h2><p>${p.blurb}</p><div class="detail-meta"><span>${isHome ? config.homeMeta : `距住处：${modeText(p)} ${distanceText(p)} · ${durationText(p)}`}</span><span>${isHome ? config.homeDates : p.tag}</span></div><div class="detail-actions"><a href="${config.navigationUrl(p)}" target="_blank" rel="noopener noreferrer">${config.navigationLabel} ↗</a><a class="secondary" href="${p.source}" target="_blank" rel="noopener noreferrer">${config.sourceLabel(isHome)} ↗</a></div>`;
    }
    function makeIcon(p, active = false) {
      return L.divIcon({className: '', html: `<span class="pin ${p.type === 'home' ? 'homepin' : p.type}${active ? ' selected' : ''}" aria-hidden="true">${p.icon}</span>`, iconSize: [32, 32], iconAnchor: [16, 16]});
    }
    function updateMarkers() {
      if (!map) return;
      spots.forEach(p => {
        const marker = markers.get(p.id);
        if (matching(p)) marker.addTo(map);
        else map.removeLayer(marker);
      });
    }
    function select(p, move) {
      if (!p) return;
      selected = p;
      renderList();
      renderDetail();
      if (!map) return;
      updateMarkers();
      const selectedMarker = markers.get(p.id);
      if (selectedMarker && !map.hasLayer(selectedMarker)) selectedMarker.addTo(map);
      markers.forEach((marker, id) => {
        const active = id === p.id;
        marker.setIcon(makeIcon(byId.get(id), active));
        marker.setZIndexOffset(active ? 1000 : 0);
        if (active) marker.openTooltip();
        else marker.closeTooltip();
      });
      if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = undefined;
      }
      const route = routeData(p);
      if (p.id !== 'home' && route?.[2]) {
        const points = decodePolyline(route[2]);
        routeLayer = L.layerGroup([
          L.polyline(points, {color: '#fff', weight: 9, opacity: .95, interactive: false}),
          L.polyline(points, {color: '#16a9f5', weight: 5, opacity: 1, interactive: false})
        ]).addTo(map);
      }
      if (p.id !== 'home') {
        const bottomPadding = Math.min($('detail').offsetHeight + 36, Math.floor(map.getSize().y * .62));
        map.fitBounds(L.latLngBounds([[home.lat, home.lon], [p.lat, p.lon]]), {
          paddingTopLeft: [28, 28], paddingBottomRight: [28, bottomPadding], maxZoom: 16
        });
      } else if (move) {
        map.flyTo([p.lat, p.lon], 15, {duration: .7});
      }
    }
    function fitAll() {
      if (!map) return;
      const shown = [home, ...spots.filter(matching)];
      map.fitBounds(L.latLngBounds(shown.map(p => [p.lat, p.lon])).pad(config.overviewPadding), {
        padding: [24, 24], maxZoom: config.overviewMaxZoom
      });
    }

    $('search').addEventListener('input', event => {
      query = event.target.value.trim().toLowerCase();
      renderList();
      updateMarkers();
    });
    $('filters').addEventListener('click', event => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      filter = button.dataset.filter;
      document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button));
      renderList();
      updateMarkers();
    });
    $('nearby').addEventListener('click', () => { if (map) map.flyTo([home.lat, home.lon], config.nearbyZoom, {duration: .7}); });
    $('overview').addEventListener('click', fitAll);
    Object.entries(config.quickLinks).forEach(([buttonId, spotId]) => {
      $(buttonId).addEventListener('click', () => select(byId.get(spotId), true));
    });
    document.querySelector('.days').addEventListener('click', event => {
      const button = event.target.closest('.spot-link[data-spot]');
      if (!button) return;
      const spot = byId.get(button.dataset.spot);
      if (!spot) return;
      select(spot, true);
      if (window.matchMedia('(max-width:950px)').matches)
        document.querySelector('.mapwrap').scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    renderList();
    renderDetail();

    if (window.L) {
      map = L.map('map', {zoomControl: false, scrollWheelZoom: true}).setView([home.lat, home.lon], config.initialZoom);
      const osm = {url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts: {maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}};
      const topo = {url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', opts: {subdomains: 'abc', maxZoom: 17, attribution: 'Map © <a href="https://opentopomap.org/" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC BY-SA); data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}};
      const noReferrer = self.origin === 'null' || location.protocol === 'file:';
      let tiles, failures = 0, usingTopo = noReferrer, vectorLayer, vectorFailed = false, rasterTimer;
      function useTiles(source) {
        if (tiles) map.removeLayer(tiles);
        failures = 0;
        tiles = L.tileLayer(source.url, source.opts).addTo(map);
        tiles.on('tileerror', () => {
          if (++failures < 3) return;
          if (!usingTopo) {
            usingTopo = true;
            useTiles(topo);
          } else $('fallback').style.display = 'block';
        });
      }
      function startRaster() {
        clearTimeout(rasterTimer);
        if (!tiles && !vectorLayer) useTiles(noReferrer ? topo : osm);
      }
      // Show plain raster tiles if the Chinese-labelled vector map is not ready within 4 s.
      rasterTimer = setTimeout(startRaster, 4000);
      createChineseVectorLayer().then(layer => {
        if (vectorFailed) return;
        clearTimeout(rasterTimer);
        try {
          layer.addTo(map);
        } catch (error) {
          vectorFailed = true;
          try { map.removeLayer(layer); } catch (_) {}
          startRaster();
          return;
        }
        vectorLayer = layer;
        if (tiles) { map.removeLayer(tiles); tiles = undefined; }
        map.setMaxZoom(19);
        let loaded = false;
        const glMap = layer.getMaplibreMap();
        glMap.on('load', () => { loaded = true; });
        glMap.on('error', () => {
          if (loaded || vectorFailed) return;
          vectorFailed = true;
          map.removeLayer(layer);
          vectorLayer = undefined;
          startRaster();
        });
      }).catch(() => {
        vectorFailed = true;
        startRaster();
      });
      L.control.zoom({position: 'bottomright'}).addTo(map);
      all.forEach(p => {
        const marker = L.marker([p.lat, p.lon], {icon: makeIcon(p, p.id === 'home')}).addTo(map);
        marker.bindTooltip(p.name, {direction: 'top', offset: [0, -14]});
        marker.on('click', () => select(p, false));
        markers.set(p.id, marker);
      });
      if (config.initialView === 'all') fitAll();
    } else $('fallback').style.display = 'block';
  };
})();
