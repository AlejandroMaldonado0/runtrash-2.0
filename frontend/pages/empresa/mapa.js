/**
 * @file Mapa Leaflet del panel de empresa.
 *
 * Inicializa el mapa, agrupa reportes por localidad y dibuja
 * marcadores, zonas, calor y la lista lateral.
 *
 * @module frontend/pages/empresa/mapa
 */

/**
 * Filtra los reportes que debe mostrar el mapa según el estado elegido.
 *
 * @returns {Array<object>} Reportes visibles en el mapa.
 */
function reportesParaMapa() {
    return mapaFiltro === "all"
        ? reportes
        : reportes.filter((report) => report.estado === mapaFiltro);
}

/**
 * Devuelve el símbolo que representa un estado en el mapa.
 *
 * @param {string} estado - Estado del reporte.
 * @returns {'✓'|'↻'|'!'} Símbolo.
 */
function estadoIconoMapa(estado) {
    return estado === "completado" ? "✓" : estado === "en proceso" ? "↻" : "!";
}

/**
 * Actualiza el número de reportes filtrados y de puntos con coordenadas.
 *
 * @returns {void}
 */
function actualizarContadoresMapa() {
    const filtrados = reportesParaMapa();
    const located = filtrados.filter((report) => report.latitud && report.longitud);
    document.getElementById("mapReportCount").textContent = `${filtrados.length} reporte${filtrados.length === 1 ? "" : "s"}`;
    document.getElementById("mapVisibleCount").textContent = located.length;
}

/**
 * Crea el mapa Leaflet, sus capas base y las capas de marcadores, zonas
 * y calor. Si Leaflet no cargó, ofrece abrir Google Maps.
 *
 * @returns {void}
 */
function inicializarMapa() {
    const loading = document.getElementById("companyMapLoading");

    if (!window.L) {
        loading.hidden = false;
        loading.innerHTML = '<div style="text-align:center"><strong>No se pudo cargar el mapa.</strong><br><button class="toolbar-button" style="margin-top:10px" data-accion="abrirMapaCompleto">Abrir en Google Maps</button></div>';
        renderListaMapa(reportesParaMapa().filter((report) => report.latitud && report.longitud));
        return;
    }

    loading.hidden = false;
    /* Vista inicial de Bogotá; se reencuadra al llegar los reportes. */
    mapaPrincipal = L.map("companyMap", {
        zoomControl: false,
        attributionControl: true
    }).setView([4.7110, -74.0721], 11);

    L.control.zoom({ position: "bottomright" }).addTo(mapaPrincipal);

    /* Capa base clara + capa de referencias (nombres de calles). */
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Mapa &copy; Esri"
    }).addTo(mapaPrincipal);

    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: ""
    }).addTo(mapaPrincipal);

    capaMarcadores = L.layerGroup().addTo(mapaPrincipal);
    capaZonas = L.layerGroup().addTo(mapaPrincipal);

    /* El mapa de calor es opcional: solo existe si cargó el plugin. */
    if (typeof L.heatLayer === "function") {
        capaCalor = L.heatLayer([], {
            radius: 34,
            blur: 24,
            minOpacity: 0.22,
            maxZoom: 16,
            gradient: {
                0.2: "#2fa85f",
                0.55: "#f28c28",
                1: "#e5484d"
            }
        }).addTo(mapaPrincipal);
    }

    loading.hidden = true;
    renderizarCapasMapa(true);
}

/**
 * Refresca contadores y capas del mapa, inicializándolo si hace falta.
 *
 * @param {boolean} [ajustarVista=false] - Reencuadrar el mapa a los puntos.
 * @returns {void}
 */
function actualizarMapa(ajustarVista = false) {
    actualizarContadoresMapa();
    if (!mapaPrincipal) {
        inicializarMapa();
        return;
    }
    renderizarCapasMapa(ajustarVista);
}

/**
 * Obtiene la localidad de un reporte; si falta, la estima por latitud.
 *
 * @param {object} report - Reporte con `localidad` y/o coordenadas.
 * @returns {string} Nombre de localidad o zona estimada.
 */
function localidadParaMapa(report) {
    const declarada = String(report.localidad || "").trim();
    if (declarada && declarada !== "Por geolocalizar") return declarada;

    const latitude = Number(report.latitud);
    if (latitude >= 4.68) return "Zona norte";
    if (latitude >= 4.62) return "Zona centro";
    return "Zona sur";
}

/**
 * Agrupa reportes geolocalizados por localidad y calcula su centro.
 *
 * @param {Array<object>} lista - Reportes a agrupar.
 * @returns {Array<{localidad: string, reports: Array<object>, total: number, latitude: number, longitude: number}>} Grupos ordenados por total.
 */
function gruposPorLocalidad(lista) {
    const grupos = new Map();

    lista.filter((report) => report.latitud && report.longitud).forEach((report) => {
        const localidad = localidadParaMapa(report);
        if (!grupos.has(localidad)) grupos.set(localidad, []);
        grupos.get(localidad).push(report);
    });

    return [...grupos.entries()]
        .map(([localidad, reports]) => ({
            localidad,
            reports,
            total: reports.length,
            latitude: reports.reduce((sum, report) => sum + Number(report.latitud), 0) / reports.length,
            longitude: reports.reduce((sum, report) => sum + Number(report.longitud), 0) / reports.length
        }))
        .sort((a, b) => b.total - a.total || a.localidad.localeCompare(b.localidad, "es"));
}

/**
 * Asigna un nivel de prioridad (`high`, `medium`, `low`) a cada localidad
 * según su volumen de reportes.
 *
 * @returns {Map<string, 'high'|'medium'|'low'>} Prioridad por localidad.
 */
function coloresPorLocalidad() {
    const grupos = gruposPorLocalidad(reportes);
    return new Map(grupos.map((group, index) => {
        const rank = grupos.length === 1
            ? "high"
            : grupos.length === 2
                ? (index === 0 ? "high" : "low")
                : index === 0 ? "high" : index === 1 ? "medium" : "low";
        return [group.localidad, rank];
    }));
}

/**
 * Dibuja un círculo y una etiqueta por localidad con su prioridad.
 *
 * @param {Array<object>} located - Reportes con coordenadas.
 * @returns {void}
 */
function renderZonasMapa(located) {
    if (!capaZonas) return;
    capaZonas.clearLayers();
    const colorMap = coloresPorLocalidad();
    const palette = {
        high: "#e5484d",
        medium: "#f28c28",
        low: "#2fa85f"
    };

    gruposPorLocalidad(located).forEach((group) => {
        const rank = colorMap.get(group.localidad) || "low";
        const color = palette[rank];
        const radius = Math.min(1800, 350 + group.total * 220);
        const zone = L.circle([group.latitude, group.longitude], {
            radius,
            color,
            weight: 2,
            opacity: 0.72,
            fillColor: color,
            fillOpacity: 0.13,
            dashArray: rank === "high" ? undefined : "6 7"
        });
        zone.bindTooltip(`${group.localidad}: ${group.total} reporte${group.total === 1 ? "" : "s"}`, {
            permanent: true,
            direction: "top",
            className: "zone-tooltip",
            opacity: 0.95
        });
        zone.addTo(capaZonas);

        const label = L.marker([group.latitude, group.longitude], {
            zIndexOffset: 450,
            icon: L.divIcon({
                className: "",
                html: `<div class="locality-zone-marker zone-${rank}"><strong>${group.total}</strong><small>${features.escapeHTML(group.localidad)}</small></div>`,
                iconSize: [84, 40],
                iconAnchor: [42, 20]
            })
        });
        label.addTo(capaZonas);
    });
}

/**
 * Redibuja marcadores, zonas y mapa de calor y ajusta la vista.
 *
 * @param {boolean} ajustarVista - Reencuadrar a los puntos visibles.
 * @returns {void}
 */
function renderizarCapasMapa(ajustarVista) {
    const filtrados = reportesParaMapa();
    const located = filtrados.filter((report) => report.latitud && report.longitud);
    const bounds = [];

    capaMarcadores.clearLayers();
    renderZonasMapa(located);
    if (capaCalor) capaCalor.setLatLngs([]);

    located.forEach((report) => {
        const latitude = Number(report.latitud);
        const longitude = Number(report.longitud);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        bounds.push([latitude, longitude]);
        const marker = L.marker([latitude, longitude], {
            icon: L.divIcon({
                className: "",
                html: `<div class="report-map-marker ${claseEstado(report.estado)}"><span>${estadoIconoMapa(report.estado)}</span></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                popupAnchor: [0, -14]
            })
        });

        marker.bindPopup(`
            <div class="map-popup">
                <strong>${features.escapeHTML(report.tipo)}</strong>
                <span>📍 ${features.escapeHTML(localidadParaMapa(report))}</span>
                <small>${features.escapeHTML(textoEstado(report.estado))} · ${features.relativeTime(report.fecha)}</small>
                <button type="button" data-accion="abrirReporteMapa" data-args='[${Number(report.id)}]'>Ver reporte</button>
            </div>
        `);
        marker.addTo(capaMarcadores);
    });

    if (capaCalor) {
        /*
        Peso del calor según la urgencia: un reporte pendiente pesa más
        que uno en proceso y mucho más que uno completado.
        */
        capaCalor.setLatLngs(located.map((report) => [
            Number(report.latitud),
            Number(report.longitud),
            report.estado === "pendiente" ? 1 : report.estado === "en proceso" ? 0.72 : 0.38
        ]));
    }

    /*
    La primera vez, o cuando el usuario filtra, se reencuadra el mapa.
    Después se respeta el zoom que haya elegido la persona.
    */
    if (bounds.length && (ajustarVista || !mapaPrincipal._runTrashMapFitted)) {
        mapaPrincipal.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
        mapaPrincipal._runTrashMapFitted = true;
    } else if (!bounds.length) {
        mapaPrincipal.setView([4.7110, -74.0721], 11);
    }

    renderListaMapa(located);
    renderHotspotMapa();
    window.setTimeout(() => mapaPrincipal?.invalidateSize(), 100);
}

/**
 * Pinta la lista lateral de reportes ubicados en el mapa.
 *
 * @param {Array<object>} located - Reportes con coordenadas.
 * @returns {void}
 */
function renderListaMapa(located) {
    const container = document.getElementById("mapReportList");
    if (!located.length) {
        container.innerHTML = '<div class="empty-state compact-empty"><span class="empty-state-icon">🗺️</span><strong>Sin puntos para mostrar</strong><p>Los reportes con coordenadas aparecerán aquí.</p></div>';
        return;
    }

    container.innerHTML = located.slice(0, 30).map((report) => `
        <button class="map-panel-item" type="button" data-accion="abrirReporteMapa" data-args='[${Number(report.id)}]'>
            <span>${estadoIconoMapa(report.estado)}</span>
            <div><strong>${features.escapeHTML(report.tipo)}</strong><small>${features.escapeHTML(localidadParaMapa(report))}<br>${features.relativeTime(report.fecha)}</small></div>
            <span class="status ${claseEstado(report.estado)}">${features.escapeHTML(textoEstado(report.estado))}</span>
        </button>`).join("");
}

/**
 * Destaca la localidad con más reportes y recomienda operarios.
 *
 * @returns {void}
 */
function renderHotspotMapa() {
    const hotspots = gruposPorLocalidad(reportesParaMapa());
    const hotspot = hotspots[0];
    const card = document.getElementById("mapHotspotCard");

    if (!hotspot) {
        card.hidden = true;
        return;
    }

    const recommended = operarios.filter((operator) => operator.zona_asignada === hotspot.localidad).length;
    card.hidden = false;
    document.getElementById("mapHotspotSector").textContent = hotspot.localidad;
    document.getElementById("mapHotspotText").textContent = recommended
        ? `${hotspot.total} reportes. Se recomiendan ${recommended} operario${recommended === 1 ? "" : "s"} para la zona.`
        : `${hotspot.total} reportes. No hay operarios asignados a esta localidad.`;
}

/**
 * Cambia el filtro del mapa y marca el botón activo.
 *
 * @param {HTMLElement} button - Botón de filtro pulsado.
 * @param {string} filter - Estado a mostrar o `all`.
 * @returns {void}
 */
function filtrarMapa(button, filter) {
    mapaFiltro = filter;
    document.querySelectorAll(".map-filter").forEach((item) => item.classList.remove("active"));
    button?.classList.add("active");
    actualizarMapa(true);
}

/**
 * Fuerza el redibujado del mapa.
 *
 * @returns {void}
 */
function refrescarMapa() {
    if (!mapaPrincipal) inicializarMapa();
    else renderizarCapasMapa(true);
}

/**
 * Abre el detalle de un reporte desde su marcador o de la lista.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {void}
 */
function abrirReporteMapa(id) {
    verReporte(id);
}

/**
 * Abre en Google Maps todos los reportes filtrados con coordenadas.
 *
 * @returns {void}
 */
function abrirMapaCompleto() {
    const located = reportesParaMapa().filter((report) => report.latitud && report.longitud);
    if (!located.length) return mostrarToast("No hay reportes con coordenadas.");
    window.open(features.buildMapURL(located), "_blank", "noopener");
}
