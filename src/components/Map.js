import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { createPinSvg, getFeatureIconName } from '../utils/markerIcons';

const Map = ({
  mapboxToken,
  center,
  zoom,
  style,
  layers,
  visibleLayers,
  visibleSubLayers,
  sliderRanges,
  onFeatureClick,
  onFeatureMove,
  onFeatureDelete,
  onFeatureArchive,
  visibleArchivedLayers,
  readOnly,
  currentUser,
  addMarkerMode,
  onMapClick,
  drawPolygonMode,
  onPolygonDrawn,
  onDrawPolygonForFeature,
  searchTarget,
  onUndo,
  canUndo,
}) => {
  console.log('=== MAP COMPONENT RENDER ===');
  console.log('Token received:', mapboxToken ? 'YES' : 'NO');
  console.log('Center:', center);
  console.log('Zoom:', zoom);
  console.log('Layers count:', layers?.length);
  
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const markers = useRef([]);
  const activePopup = useRef(null);
  const draw = useRef(null);
  const polygonLayerIds = useRef([]);
  const polygonSourceIds = useRef([]);
  const polygonEventHandlers = useRef([]);
  const attachedPolyLayerIds = useRef([]);
  const attachedPolySourceIds = useRef([]);
  const searchMarker = useRef(null);

  // Initialize map
  useEffect(() => {
    console.log('=== MAP INIT useEffect ===');
    console.log('map.current exists?', !!map.current);
    console.log('mapboxToken:', mapboxToken);
    
    if (map.current) return; // Initialize only once

    mapboxgl.accessToken = mapboxToken;

    // Restore view from URL hash if present: #zoom/lat/lng
    let initialCenter = center;
    let initialZoom = zoom;
    const hash = window.location.hash.slice(1);
    if (hash) {
      const parts = hash.split('/');
      if (parts.length === 3) {
        const z = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        if (!isNaN(z) && !isNaN(lat) && !isNaN(lng)) {
          initialZoom = z;
          initialCenter = [lng, lat];
        }
      }
    }

    console.log('Creating new map...');

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: style,
      center: initialCenter,
      zoom: initialZoom
    });

    console.log('Map created:', !!map.current);

    map.current.on('load', () => {
      console.log('MAP LOADED!');
      // Initialize Mapbox Draw (hidden controls — we drive it programmatically)
      draw.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: {}
      });
      map.current.addControl(draw.current);
      setMapLoaded(true);
    });

    // Persist view to URL hash on every move
    map.current.on('moveend', () => {
      const c = map.current.getCenter();
      const z = map.current.getZoom().toFixed(2);
      const lat = c.lat.toFixed(5);
      const lng = c.lng.toFixed(5);
      window.history.replaceState(null, '', `#${z}/${lat}/${lng}`);
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxToken, center, zoom, style]);

  // Handle add-marker mode: crosshair cursor + click to place
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const canvas = map.current.getCanvas();

    const handleClick = (e) => {
      if (onMapClick) {
        onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    };

    if (addMarkerMode) {
      map.current.on('click', handleClick);
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }

    return () => {
      if (map.current) {
        map.current.off('click', handleClick);
        map.current.getCanvas().style.cursor = '';
      }
    };
  }, [mapLoaded, addMarkerMode, onMapClick]);

  // Wire up draw.create event to capture finished polygons
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const handleDrawCreate = (e) => {
      const feature = e.features[0];
      if (feature && feature.geometry.type === 'Polygon') {
        draw.current.deleteAll();
        if (onPolygonDrawn) onPolygonDrawn(feature.geometry.coordinates);
      }
    };

    map.current.on('draw.create', handleDrawCreate);
    return () => {
      if (map.current) map.current.off('draw.create', handleDrawCreate);
    };
  }, [mapLoaded, onPolygonDrawn]);

  // Enter/exit polygon draw mode
  useEffect(() => {
    if (!mapLoaded || !draw.current) return;
    try {
      if (drawPolygonMode) {
        draw.current.changeMode('draw_polygon');
      } else {
        draw.current.changeMode('simple_select');
      }
    } catch (e) {
      // changeMode can throw if draw control isn't ready yet
    }
  }, [mapLoaded, drawPolygonMode]);

  // Handle search target: fly to feature/place and open popup or drop temp pin
  useEffect(() => {
    if (!mapLoaded || !map.current || !searchTarget) return;

    // Remove any previous temp search pin
    if (searchMarker.current) {
      searchMarker.current.remove();
      searchMarker.current = null;
    }

    if (searchTarget.type === 'feature') {
      const { layer, feature, featureIndex } = searchTarget;
      const { lat, lng } = feature.coordinates;

      map.current.flyTo({ center: [lng, lat], zoom: Math.max(map.current.getZoom(), 14), speed: 1.4 });

      if (activePopup.current) activePopup.current.remove();
      const isReadOnly = readOnly || !layer.config.editable;
      const popup = new mapboxgl.Popup({ offset: 25, closeButton: true, closeOnClick: false, maxWidth: '420px' })
        .setLngLat([lng, lat])
        .setHTML(createPopupContent(feature, layer, featureIndex, isReadOnly));

      setupPopupSaveHandler(popup, feature, layer, featureIndex);
      popup.addTo(map.current);
      activePopup.current = popup;
      popup.on('close', () => { if (activePopup.current === popup) activePopup.current = null; });

    } else if (searchTarget.type === 'place') {
      const { lat, lng, label } = searchTarget;
      map.current.flyTo({ center: [lng, lat], zoom: 15, speed: 1.4 });

      // Drop a temporary pin with the place name
      const el = document.createElement('div');
      el.style.cssText = `
        width: 14px; height: 14px;
        background: #B84B48; border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      `;

      const popup = new mapboxgl.Popup({ offset: 20, closeButton: true, closeOnClick: false })
        .setHTML(`<div style="padding:8px 10px; font-family:sans-serif; font-size:13px;">${label}</div>`);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map.current);

      popup.addTo(map.current);
      searchMarker.current = marker;

      popup.on('close', () => {
        marker.remove();
        searchMarker.current = null;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, searchTarget]);

  // Render polygon layers as GL fill+line layers
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Remove previous polygon event handlers
    polygonEventHandlers.current.forEach(({ event, layerId, handler }) => {
      if (map.current) map.current.off(event, layerId, handler);
    });
    polygonEventHandlers.current = [];

    // Remove previous polygon GL layers (must happen before sources)
    polygonLayerIds.current.forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    polygonLayerIds.current = [];

    // Remove previous polygon sources
    polygonSourceIds.current.forEach(id => {
      if (map.current.getSource(id)) map.current.removeSource(id);
    });
    polygonSourceIds.current = [];

    const polygonLayers = layers.filter(l => l.config.featureType === 'polygon');

    polygonLayers.forEach(layer => {
      if (!visibleLayers.includes(layer.name)) return;

      const visibleFeatures = (layer.features || []).filter(f => {
        if (!f.geometry) return false;
        if (layer.config.archivedColumn) {
          const isArchived = !!f.data[layer.config.archivedColumn];
          if (isArchived && !visibleArchivedLayers?.includes(layer.name)) return false;
        }
        return true;
      });

      const geojson = {
        type: 'FeatureCollection',
        features: visibleFeatures.map((f, i) => ({
          type: 'Feature',
          id: i,
          geometry: { type: 'Polygon', coordinates: f.geometry },
          properties: { ...f.data, _featureIndex: (layer.features || []).indexOf(f) }
        }))
      };

      const sourceId = `polygon-source-${layer.name}`;
      map.current.addSource(sourceId, { type: 'geojson', data: geojson });
      polygonSourceIds.current.push(sourceId);

      const fillId = `polygon-fill-${layer.name}`;
      const lineId = `polygon-line-${layer.name}`;

      // Build fill-color: data-driven if colorByColumn is set, otherwise flat
      let fillColor;
      if (layer.style.colorByColumn && layer.style.colorMap) {
        const col = layer.style.colorByColumn;
        const stops = Object.entries(layer.style.colorMap).flatMap(([val, clr]) => [val, clr]);
        fillColor = ['match', ['get', col], ...stops, layer.style.defaultColor];
      } else {
        fillColor = layer.style.fillColor || layer.style.defaultColor;
      }

      map.current.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': fillColor,
          'fill-opacity': layer.style.fillOpacity ?? 0.68
        }
      });

      map.current.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': fillColor,
          'line-width': layer.style.lineWidth || 2
        }
      });

      polygonLayerIds.current.push(fillId, lineId);

      // Click handler: open popup at centroid
      const clickHandler = (e) => {
        if (!e.features.length) return;
        const featureIndex = e.features[0].properties._featureIndex;
        const feature = layer.features[featureIndex];
        if (!feature) return;

        if (activePopup.current) activePopup.current.remove();

        const { lat, lng } = feature.coordinates;
        const isReadOnly = readOnly || !layer.config.editable;
        const popupContent = createPopupContent(feature, layer, featureIndex, isReadOnly);
        const popup = new mapboxgl.Popup({ offset: 10, closeButton: true, closeOnClick: false, maxWidth: '420px' })
          .setLngLat([lng, lat])
          .setHTML(popupContent);

        setupPopupSaveHandler(popup, feature, layer, featureIndex);
        popup.addTo(map.current);
        activePopup.current = popup;
        popup.on('close', () => { if (activePopup.current === popup) activePopup.current = null; });
      };

      const enterHandler = () => { map.current.getCanvas().style.cursor = 'pointer'; };
      const leaveHandler = () => { map.current.getCanvas().style.cursor = ''; };

      map.current.on('click', fillId, clickHandler);
      map.current.on('mouseenter', fillId, enterHandler);
      map.current.on('mouseleave', fillId, leaveHandler);

      polygonEventHandlers.current.push(
        { event: 'click', layerId: fillId, handler: clickHandler },
        { event: 'mouseenter', layerId: fillId, handler: enterHandler },
        { event: 'mouseleave', layerId: fillId, handler: leaveHandler }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, layers, visibleLayers, visibleArchivedLayers, readOnly]);

  // Update layers when data changes
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Add markers for each visible layer (point layers only)
    layers.forEach((layer, layerIndex) => {
      if (layer.config.featureType === 'polygon') return; // handled by GL layers
      const isVisible = visibleLayers.includes(layer.name);

      if (!isVisible) return;

      layer.features.forEach((feature, featureIndex) => {
        if (!feature.coordinates) return;

        // Filter by sub-layer if this layer uses colorByColumn
        if (layer.style.colorByColumn && visibleSubLayers?.[layer.name]) {
          const value = feature.data[layer.style.colorByColumn];
          const inColorMap = layer.style.colorMap && layer.style.colorMap[value] !== undefined;
          const subLayerValue = inColorMap ? value : '__other__';
          if (!visibleSubLayers[layer.name].includes(subLayerValue)) return;
        }

        // Filter archived markers unless this layer's archive is toggled on
        if (layer.config.archivedColumn) {
          const isArchived = !!feature.data[layer.config.archivedColumn];
          const showArchived = visibleArchivedLayers?.includes(layer.name);
          if (isArchived && !showArchived) return;
        }

        // Filter by slider ranges
        const layerSliders = sliderRanges?.[layer.name];
        if (layerSliders && layer.config.sliderFilters) {
          for (const { field, type } of layer.config.sliderFilters) {
            const range = layerSliders[field];
            if (!range) continue;
            const raw = feature.data[field];
            let val;
            if (type === 'year') {
              val = parseInt(raw, 10);
            } else if (type === 'date') {
              const d = new Date(raw);
              val = isNaN(d.getTime()) ? null : d.getFullYear() * 100 + (d.getMonth() + 1);
            }
            if (val === null || isNaN(val) || val < range.low || val > range.high) return;
          }
        }

        const { lat, lng } = feature.coordinates;

        // Create marker element
        const isArchived = layer.config.archivedColumn && !!feature.data[layer.config.archivedColumn];
        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.width = '28px';
        el.style.height = '28px';
        el.style.cursor = 'pointer';
        el.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))';
        const pinColor = isArchived ? '#9e9e9e' : getFeatureColor(feature, layer);
        const iconName = isArchived ? 'pin' : getFeatureIconName(feature, layer);
        el.innerHTML = createPinSvg(pinColor, iconName, isArchived ? 0.6 : 1);

        // Create popup content
        const popupContent = createPopupContent(feature, layer, featureIndex, readOnly || !layer.config.editable);

        const popup = new mapboxgl.Popup({
          offset: 25,
          closeButton: true,
          closeOnClick: false,
          maxWidth: '420px'
        }).setHTML(popupContent);

        // Setup save handler
        setupPopupSaveHandler(popup, feature, layer, featureIndex);

        // Create marker
        const marker = new mapboxgl.Marker({
          element: el,
          anchor: 'center',
          draggable: !readOnly && currentUser?.role === 'superadmin'
        })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.current);

        // Handle marker click — close any other open popup first
        el.addEventListener('click', () => {
          if (activePopup.current && activePopup.current !== popup) {
            activePopup.current.remove();
          }
          activePopup.current = popup;
          if (onFeatureClick) {
            onFeatureClick(layer, feature, featureIndex);
          }
        });

        popup.on('close', () => {
          if (activePopup.current === popup) {
            activePopup.current = null;
          }
        });

        // Handle marker drag
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          if (onFeatureMove) {
            onFeatureMove(layer, feature, featureIndex, {
              lat: lngLat.lat,
              lng: lngLat.lng
            });
          }
        });

        markers.current.push(marker);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, layers, visibleLayers, visibleArchivedLayers, onFeatureClick, onFeatureMove]);

  // Render attached polygons for point layers that have polygonColumn
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    // Remove previous attached polygon layers + sources
    attachedPolyLayerIds.current.forEach(id => {
      if (map.current.getLayer(id)) map.current.removeLayer(id);
    });
    attachedPolyLayerIds.current = [];
    attachedPolySourceIds.current.forEach(id => {
      if (map.current.getSource(id)) map.current.removeSource(id);
    });
    attachedPolySourceIds.current = [];

    layers.forEach(layer => {
      if (!layer.config.polygonColumn) return;
      if (!visibleLayers.includes(layer.name)) return;

      const features = (layer.features || []).filter(f => {
        const raw = f.data[layer.config.polygonColumn];
        if (!raw) return false;
        if (layer.config.archivedColumn) {
          const isArchived = !!f.data[layer.config.archivedColumn];
          if (isArchived && !visibleArchivedLayers?.includes(layer.name)) return false;
        }
        // Filter by sub-layer visibility
        if (layer.style.colorByColumn && visibleSubLayers?.[layer.name]) {
          const value = f.data[layer.style.colorByColumn];
          const inColorMap = layer.style.colorMap && layer.style.colorMap[value] !== undefined;
          const subLayerValue = inColorMap ? value : '__other__';
          if (!visibleSubLayers[layer.name].includes(subLayerValue)) return false;
        }
        // Filter by slider ranges
        const layerSliders = sliderRanges?.[layer.name];
        if (layerSliders && layer.config.sliderFilters) {
          for (const { field, type } of layer.config.sliderFilters) {
            const range = layerSliders[field];
            if (!range) continue;
            const raw = f.data[field];
            let val;
            if (type === 'year') {
              val = parseInt(raw, 10);
            } else if (type === 'date') {
              const d = new Date(raw);
              val = isNaN(d.getTime()) ? null : d.getFullYear() * 100 + (d.getMonth() + 1);
            }
            if (val === null || isNaN(val) || val < range.low || val > range.high) return false;
          }
        }
        return true;
      }).map(f => {
        try {
          const coords = JSON.parse(f.data[layer.config.polygonColumn]);
          const color = getFeatureColor(f, layer);
          return { type: 'Feature', geometry: { type: 'Polygon', coordinates: coords }, properties: { color } };
        } catch (e) { return null; }
      }).filter(Boolean);

      if (features.length === 0) return;

      const sourceId = `attached-poly-source-${layer.name}`;
      map.current.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features } });
      attachedPolySourceIds.current.push(sourceId);

      const fillId = `attached-poly-fill-${layer.name}`;
      const lineId = `attached-poly-line-${layer.name}`;

      map.current.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.68 } });
      map.current.addLayer({ id: lineId, type: 'line', source: sourceId, paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [3, 2] } });

      attachedPolyLayerIds.current.push(fillId, lineId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, layers, visibleLayers, visibleSubLayers, visibleArchivedLayers]);

  // Helper: Interpolate between two hex colors by t (0–1)
  const lerpColor = (hex1, hex2, t) => {
    const parse = h => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16)
    ];
    const [r1, g1, b1] = parse(hex1);
    const [r2, g2, b2] = parse(hex2);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  };

  // Helper: Get feature color based on styling rules
  const getFeatureColor = (feature, layer) => {
    const { style, features } = layer;

    // Gradient coloring by numeric column
    if (style.heatColumn) {
      const raw = feature.data[style.heatColumn];
      const val = parseFloat(String(raw).replace(/[^0-9.-]/g, ''));
      if (isNaN(val)) return style.defaultColor;

      const allVals = (features || [])
        .map(f => parseFloat(String(f.data[style.heatColumn]).replace(/[^0-9.-]/g, '')))
        .filter(v => !isNaN(v));
      const min = Math.min(...allVals);
      const max = Math.max(...allVals);
      const t = max === min ? 0.5 : (val - min) / (max - min);
      return lerpColor(style.lightColor, style.darkColor, t);
    }

    if (style.colorByColumn && feature.data[style.colorByColumn]) {
      const value = feature.data[style.colorByColumn];
      return style.colorMap[value] || style.defaultColor;
    }
    return style.defaultColor;
  };

  // Helper: Create popup content with view/edit mode
  const createPopupContent = (feature, layer, featureIndex, isReadOnly) => {
    const popupId = `popup-${layer.name}-${featureIndex}`;

    const geometryCol = layer.config.geometryColumn;
    const fieldsToShow = layer.config.popupFields && layer.config.popupFields.length > 0
      ? layer.config.popupFields
      : Object.keys(feature.data).filter(key =>
          key !== '_rowIndex' && key !== 'Latitude' && key !== 'Longitude' && key !== geometryCol
        );

    let html = `<div style="padding: 12px; max-width: 420px;" id="${popupId}">`;
    html += `
      <div style="margin-bottom: 9px; border-bottom: 2px solid #ddd; padding-bottom: 6px;">
        <h3 style="margin: 0; font-size: 14px; font-weight: bold;">${(layer.config.nameField && feature.data[layer.config.nameField]) || layer.displayName}</h3>
      </div>
    `;

    // View mode (default)
    const linkFields = layer.config.linkFields || [];
    html += `<div id="view-${popupId}">`;
    fieldsToShow.forEach(fieldName => {
      const value = feature.data[fieldName] || '';
      if (fieldName !== '_rowIndex') {
        const isLink = linkFields.includes(fieldName);
        const displayValue = value
          ? (isLink
            ? `<a href="${value}" target="_blank" rel="noopener noreferrer" style="color:#4A8DB8; word-break:break-all;">${value}</a>`
            : value)
          : '<span style="color:#aaa">—</span>';
        html += `
          <div style="margin-bottom: 4px;">
            <div style="font-size: 11px; font-weight: bold; color: #666; margin-bottom: 0;">${fieldName}</div>
            <div style="font-size: 12px; color: #333; padding: 1px 0;">${displayValue}</div>
          </div>
        `;
      }
    });
    if (!isReadOnly) {
      const featureIsArchived = layer.config.archivedColumn && !!feature.data[layer.config.archivedColumn];
      const archiveBg = featureIsArchived ? '#4E9A5A' : '#C47A36';
      const archiveHover = featureIsArchived ? '#2A6B35' : '#B55A28';
      const archiveLabel = featureIsArchived ? 'Restore' : 'Archive';
      const hasAttachedPoly = layer.config.polygonColumn && !!feature.data[layer.config.polygonColumn];
      const polyLabel = hasAttachedPoly ? 'Edit Area' : 'Draw Area';
      html += `
        <div style="display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;">
          <button
            id="edit-btn-${popupId}"
            style="
              flex: 1;
              padding: 7px;
              background-color: #4A8DB8;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='#3A6F96'"
            onmouseout="this.style.backgroundColor='#4A8DB8'"
          >Edit</button>
          ${layer.config.archivedColumn ? `
          <button
            id="archive-btn-${popupId}"
            style="
              flex: 1;
              padding: 7px;
              background-color: ${archiveBg};
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='${archiveHover}'"
            onmouseout="this.style.backgroundColor='${archiveBg}'"
          >${archiveLabel}</button>
          ` : ''}
          ${layer.config.polygonColumn ? `
          <button
            id="draw-poly-btn-${popupId}"
            style="
              flex: 1;
              padding: 7px;
              background-color: #6A4E9A;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='#5A3D85'"
            onmouseout="this.style.backgroundColor='#6A4E9A'"
          >${polyLabel}</button>
          ` : ''}
          ${currentUser?.role === 'superadmin' ? `
          <button
            id="delete-btn-${popupId}"
            style="
              flex: 1;
              padding: 7px;
              background-color: #B84B48;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              cursor: pointer;
            "
            onmouseover="this.style.backgroundColor='#8C3030'"
            onmouseout="this.style.backgroundColor='#B84B48'"
          >Delete</button>
          ` : ''}
        </div>
      `;
    }
    html += `</div>`;

    // Edit mode (hidden by default, omitted entirely in read-only)
    if (isReadOnly) {
      html += `</div>`;
      return html;
    }
    html += `<div id="edit-${popupId}" style="display: none;">`;
    fieldsToShow.forEach(fieldName => {
      const value = feature.data[fieldName] || '';
      if (fieldName !== '_rowIndex') {
        html += `
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 11px; font-weight: bold; color: #666; margin-bottom: 3px;">${fieldName}</label>
            <input
              type="text"
              id="field-${fieldName}"
              value="${value}"
              style="
                width: 100%;
                padding: 6px 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
                box-sizing: border-box;
              "
            />
          </div>
        `;
      }
    });
    html += `
      <button
        id="save-popup-${popupId}"
        style="
          width: 100%;
          padding: 8px;
          background-color: #4E9A5A;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
          margin-top: 8px;
        "
        onmouseover="this.style.backgroundColor='#3E8A4A'"
        onmouseout="this.style.backgroundColor='#4E9A5A'"
      >Save Changes</button>
    `;
    html += `</div>`;

    html += `</div>`;
    return html;
  };

  // Helper: Setup popup save handler
  const setupPopupSaveHandler = (popup, feature, layer, featureIndex) => {
    // Wait for popup to be added to DOM
    popup.on('open', () => {
      const popupId = `popup-${layer.name}-${featureIndex}`;

      // Wire up Edit button toggle
      const editBtn = document.getElementById(`edit-btn-${popupId}`);
      const viewPanel = document.getElementById(`view-${popupId}`);
      const editPanel = document.getElementById(`edit-${popupId}`);

      if (editBtn && viewPanel && editPanel) {
        editBtn.onclick = () => {
          const isEditing = editPanel.style.display !== 'none';
          if (isEditing) {
            editPanel.style.display = 'none';
            viewPanel.style.display = 'block';
            editBtn.textContent = 'Edit';
            editBtn.style.backgroundColor = '#4A8DB8';
          } else {
            viewPanel.style.display = 'none';
            editPanel.style.display = 'block';
            editBtn.textContent = 'Cancel';
            editBtn.style.backgroundColor = '#9E9E9E';
          }
        };
      }

      const drawPolyBtn = document.getElementById(`draw-poly-btn-${popupId}`);
      if (drawPolyBtn) {
        drawPolyBtn.onclick = () => {
          popup.remove();
          if (onDrawPolygonForFeature) onDrawPolygonForFeature(layer, feature, featureIndex);
        };
      }

      const archiveBtn = document.getElementById(`archive-btn-${popupId}`);
      if (archiveBtn) {
        archiveBtn.onclick = async () => {
          archiveBtn.disabled = true;
          archiveBtn.style.backgroundColor = '#999';
          try {
            if (onFeatureArchive) {
              await onFeatureArchive(layer, feature, featureIndex);
            }
            popup.remove();
          } catch (err) {
            console.error('Error archiving:', err);
            archiveBtn.disabled = false;
            archiveBtn.style.backgroundColor = '#FF9800';
          }
        };
      }

      const deleteBtn = document.getElementById(`delete-btn-${popupId}`);
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          if (!window.confirm('Delete this point? This cannot be undone.')) return;
          deleteBtn.textContent = 'Deleting…';
          deleteBtn.disabled = true;
          deleteBtn.style.backgroundColor = '#999';
          try {
            if (onFeatureDelete) {
              await onFeatureDelete(layer, feature, featureIndex);
            }
            popup.remove();
          } catch (err) {
            console.error('Error deleting:', err);
            deleteBtn.textContent = 'Error';
            deleteBtn.style.backgroundColor = '#B84B48';
            deleteBtn.disabled = false;
          }
        };
      }

      const saveButton = document.getElementById(`save-popup-${popupId}`);
      
      if (saveButton) {
        saveButton.onclick = async () => {
          // Collect updated values from input fields
          const geometryCol = layer.config.geometryColumn;
          const fieldsToShow = layer.config.popupFields && layer.config.popupFields.length > 0
            ? layer.config.popupFields
            : Object.keys(feature.data).filter(key =>
                key !== '_rowIndex' && key !== 'Latitude' && key !== 'Longitude' && key !== geometryCol
              );
          
          const updatedData = { ...feature.data };
          
          fieldsToShow.forEach(fieldName => {
            const input = document.getElementById(`field-${fieldName}`);
            if (input) {
              updatedData[fieldName] = input.value;
            }
          });
          
          // Show saving state
          saveButton.textContent = 'Saving...';
          saveButton.disabled = true;
          saveButton.style.backgroundColor = '#999';
          
          try {
            // Update Google Sheet
            if (onFeatureMove) {
              await onFeatureMove(layer, feature, featureIndex, feature.coordinates, updatedData);
            }
            
            // Success feedback
            saveButton.textContent = 'Saved ✓';
            saveButton.style.backgroundColor = '#4E9A5A';

            setTimeout(() => {
              // Switch back to view mode and update displayed values
              const viewPanel = document.getElementById(`view-${popupId}`);
              const editPanel = document.getElementById(`edit-${popupId}`);
              const editBtn = document.getElementById(`edit-btn-${popupId}`);
              if (viewPanel && editPanel && editBtn) {
                // Refresh view panel text from updated inputs
                fieldsToShow.forEach(fieldName => {
                  const input = document.getElementById(`field-${fieldName}`);
                  if (input) {
                    const viewField = viewPanel.querySelector(`[data-field="${fieldName}"]`);
                    if (viewField) viewField.textContent = input.value || '—';
                  }
                });
                editPanel.style.display = 'none';
                viewPanel.style.display = 'block';
                editBtn.textContent = 'Edit';
                editBtn.style.backgroundColor = '#4A8DB8';
              }
              saveButton.textContent = 'Save Changes';
              saveButton.disabled = false;
              saveButton.style.backgroundColor = '#4E9A5A';
            }, 1000);
            
          } catch (error) {
            console.error('Error saving:', error);
            saveButton.textContent = 'Error - Try Again';
            saveButton.style.backgroundColor = '#C0504D';
            saveButton.disabled = false;
          }
        };
      }
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {canUndo && (
        <button
          onClick={onUndo}
          style={{
            position: 'absolute',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 18px',
            backgroundColor: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            zIndex: 10,
          }}
        >
          ↩ Undo Move
        </button>
      )}
    </div>
  );
};

export default Map;
