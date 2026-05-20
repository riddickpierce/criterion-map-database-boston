import React, { useState, useEffect, useRef } from 'react';
import Map from './components/Map';
import LayerControls from './components/LayerControls';
import AddMarkerModal from './components/AddMarkerModal';
import SearchBar from './components/SearchBar';
import googleSheetsService from './services/googleSheets';
import geocodingService from './services/geocoding';

// Import your local config
// Copy config.example.js to config.local.js and customize it
import { config } from './config.local';

const computeCentroid = (rings) => {
  const ring = rings[0];
  const n = ring.length - 1; // GeoJSON rings repeat first point — exclude it
  const lng = ring.slice(0, n).reduce((sum, p) => sum + p[0], 0) / n;
  const lat = ring.slice(0, n).reduce((sum, p) => sum + p[1], 0) / n;
  return { lat, lng };
};

function App() {
  const [layers, setLayers] = useState([]);
  const [visibleLayers, setVisibleLayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [visibleSubLayers, setVisibleSubLayers] = useState({});
  const [sliderRanges, setSliderRanges] = useState({});
  const [geocodingProgress, setGeocodingProgress] = useState(null);
  const [mapStyle, setMapStyle] = useState(config.map.style);
  const [searchTarget, setSearchTarget] = useState(null);
  const [addMarkerMode, setAddMarkerMode] = useState(false);
  const [addMarkerCoords, setAddMarkerCoords] = useState(null);
  const [drawPolygonMode, setDrawPolygonMode] = useState(false);
  const [pendingPolygonGeometry, setPendingPolygonGeometry] = useState(null);
  const polygonEditTargetRef = useRef(null);
  const [visibleArchivedLayers, setVisibleArchivedLayers] = useState([]);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinError, setPinError] = useState(null);
  const undoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const oauthCredentials = useRef(null);
  const usersRef = useRef([]);
  const [currentUser, setCurrentUser] = useState(null);

  // Initialize services
  useEffect(() => {
    const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.REACT_APP_GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.REACT_APP_GOOGLE_REFRESH_TOKEN;
    const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
    const adminPin = process.env.REACT_APP_ADMIN_PIN;

    if (!mapboxToken) {
      setError('Mapbox token not found. Please set REACT_APP_MAPBOX_TOKEN in .env');
      return;
    }

    geocodingService.initialize(mapboxToken);

    if (adminPin) {
      // Deployed mode: start read-only, store OAuth creds so PIN can unlock them
      googleSheetsService.initializeApiKey(apiKey);
      setReadOnly(true);
      if (clientId && clientSecret && refreshToken) {
        oauthCredentials.current = { clientId, clientSecret, refreshToken };
      }
    } else if (clientId && clientSecret && refreshToken) {
      // Local mode: OAuth directly — full read/write, no PIN needed
      googleSheetsService.initializeOAuth(clientId, clientSecret, refreshToken);
      setReadOnly(false);
    } else if (apiKey) {
      // Pure read-only fallback
      googleSheetsService.initializeApiKey(apiKey);
      setReadOnly(true);
    } else {
      setError('No Google credentials found. Set OAuth vars or REACT_APP_GOOGLE_API_KEY in .env');
      return;
    }

    setAuthenticated(true);
  }, []);

  // Load data from Google Sheets
  useEffect(() => {
    if (!authenticated) return;

    loadAllSheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const loadAllSheets = async (skipCoordWrite = false) => {
    setLoading(true);
    setError(null);

    try {
      const loadedLayers = [];

      for (const sheetConfig of config.sheets) {
        let features = [];
        try {
          // Read sheet data
          const rows = await googleSheetsService.readSheet(
            config.spreadsheetId,
            sheetConfig.name
          );
          if (sheetConfig.featureType === 'polygon') {
            for (const row of rows) {
              const geometryStr = row[sheetConfig.geometryColumn];
              if (!geometryStr) continue;
              try {
                const geometry = JSON.parse(geometryStr);
                features.push({ coordinates: computeCentroid(geometry), geometry, data: row });
              } catch (e) {
                console.warn(`Skipping row with invalid geometry in ${sheetConfig.name}`);
              }
            }
          } else {
          const addressesToGeocode = [];
          const rowIndices = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const addressColumn = sheetConfig.addressColumn;
            const address = row[addressColumn];

            if (!address) continue;

            // Check if we already have coordinates
            if (sheetConfig.latColumn && sheetConfig.lngColumn) {
              const lat = parseFloat(row[sheetConfig.latColumn]);
              const lng = parseFloat(row[sheetConfig.lngColumn]);

              if (!isNaN(lat) && !isNaN(lng)) {
                features.push({
                  coordinates: { lat, lng },
                  data: row
                });
                continue;
              }
            }

            // Need to geocode
            addressesToGeocode.push(address);
            rowIndices.push(i);
          }

          // Geocode addresses that don't have coordinates
          if (addressesToGeocode.length > 0) {
            setGeocodingProgress({
              sheet: sheetConfig.displayName,
              current: 0,
              total: addressesToGeocode.length
            });

            const geocoded = await geocodingService.batchGeocode(
              addressesToGeocode,
              (progress) => {
                setGeocodingProgress({
                  sheet: sheetConfig.displayName,
                  current: Math.floor(progress * addressesToGeocode.length),
                  total: addressesToGeocode.length
                });
              }
            );

            // Add geocoded features and collect coordinate cell updates for a single batch write
            const coordUpdates = [];
            const cacheKey = `${config.spreadsheetId}/${sheetConfig.name}`;
            const sheetHeaders = googleSheetsService.headersCache[cacheKey] || [];
            const latColIdx = sheetConfig.latColumn ? sheetHeaders.indexOf(sheetConfig.latColumn) : -1;
            const lngColIdx = sheetConfig.lngColumn ? sheetHeaders.indexOf(sheetConfig.lngColumn) : -1;
            const latColLetter = latColIdx >= 0 ? googleSheetsService.columnIndexToLetter(latColIdx) : null;
            const lngColLetter = lngColIdx >= 0 ? googleSheetsService.columnIndexToLetter(lngColIdx) : null;

            for (let idx = 0; idx < geocoded.length; idx++) {
              const coords = geocoded[idx];
              if (!coords) continue;

              const rowIndex = rowIndices[idx];
              const row = rows[rowIndex];

              features.push({ coordinates: coords, data: row });

              if (sheetConfig.latColumn && sheetConfig.lngColumn) {
                row[sheetConfig.latColumn] = coords.lat.toString();
                row[sheetConfig.lngColumn] = coords.lng.toString();

                if (!skipCoordWrite && latColLetter && lngColLetter) {
                  const actualRow = rowIndex + 2; // 1-based + header row
                  coordUpdates.push(
                    { range: `${latColLetter}${actualRow}`, value: coords.lat.toString() },
                    { range: `${lngColLetter}${actualRow}`, value: coords.lng.toString() }
                  );
                }
              }
            }

            // Write all coordinates for this sheet in one API call instead of one per row
            if (!skipCoordWrite && coordUpdates.length > 0) {
              try {
                await googleSheetsService.batchUpdateCells(
                  config.spreadsheetId,
                  sheetConfig.name,
                  coordUpdates
                );
              } catch (err) {
                console.error(`Failed to save coordinates in ${sheetConfig.name}:`, err);
                throw Object.assign(new Error(err.message), { isCoordWriteError: true });
              }
            }

            setGeocodingProgress(null);
          }
          } // end else (point layer)

          loadedLayers.push({
            name: sheetConfig.name,
            displayName: sheetConfig.displayName,
            features: features,
            style: sheetConfig.style,
            config: sheetConfig
          });

        } catch (err) {
          if (err.isCoordWriteError) {
            // Coord write failed — load the map anyway but surface the option to retry without writing
            setError(`__COORD_WRITE_ERROR__${err.message}`);
            loadedLayers.push({
              name: sheetConfig.name,
              displayName: sheetConfig.displayName,
              features: features,
              style: sheetConfig.style,
              config: sheetConfig
            });
          } else {
            console.error(`Error loading sheet ${sheetConfig.name}:`, err);
          }
        }
      }

      // Load users list for name-based auth
      if (config.usersSheet) {
        try {
          const userRows = await googleSheetsService.readSheet(config.spreadsheetId, config.usersSheet);
          usersRef.current = userRows
            .map(r => ({ name: r.Name?.trim(), role: r.Role?.trim().toLowerCase() }))
            .filter(u => u.name);
        } catch (err) {
          console.warn('Could not load users sheet:', err);
        }
      }

      setLayers(loadedLayers);
      setVisibleLayers([]);

      // Build initial sub-layer visibility for layers that use colorByColumn
      const initialSubLayers = {};
      loadedLayers.forEach(layer => {
        if (layer.style.colorByColumn && layer.style.colorMap) {
          const values = [...Object.keys(layer.style.colorMap), '__other__'];
          initialSubLayers[layer.name] = values;
        }
      });
      setVisibleSubLayers(initialSubLayers);

      // Build initial slider ranges for layers that have sliderFilters
      const initialSliderRanges = {};
      loadedLayers.forEach(layer => {
        if (!layer.config.sliderFilters) return;
        initialSliderRanges[layer.name] = {};
        layer.config.sliderFilters.forEach(({ field, type }) => {
          const values = (layer.features || [])
            .map(f => parseSliderValue(f.data[field], type))
            .filter(v => v !== null);
          if (values.length === 0) return;
          const min = Math.min(...values);
          const max = Math.max(...values);
          initialSliderRanges[layer.name][field] = { min, max, low: min, high: max, type };
        });
      });
      setSliderRanges(initialSliderRanges);

      setLoading(false);

    } catch (err) {
      setError(`Failed to load data: ${err.message}`);
      setLoading(false);
    }
  };

  const parseSliderValue = (raw, type) => {
    if (!raw) return null;
    if (type === 'year') {
      const y = parseInt(raw, 10);
      return isNaN(y) ? null : y;
    }
    if (type === 'date') {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d.getFullYear() * 100 + (d.getMonth() + 1);
    }
    return null;
  };

  const handleSliderChange = (layerName, field, bound, value) => {
    setSliderRanges(prev => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        [field]: {
          ...prev[layerName][field],
          [bound]: Number(value)
        }
      }
    }));
  };

  const handleDeselectAll = () => {
    setVisibleLayers([]);
    setVisibleSubLayers({});
  };

  const handleToggleLayer = (layerName) => {
    setVisibleLayers(prev => {
      const nowVisible = !prev.includes(layerName);
      // When toggling parent, set all sub-layers to match
      const layer = layers.find(l => l.name === layerName);
      if (layer?.style.colorByColumn && layer?.style.colorMap) {
        setVisibleSubLayers(prevSub => ({
          ...prevSub,
          [layerName]: nowVisible
            ? [...Object.keys(layer.style.colorMap), '__other__']
            : []
        }));
      }
      return nowVisible
        ? [...prev, layerName]
        : prev.filter(name => name !== layerName);
    });
  };

  const handleToggleSubLayer = (layerName, subLayerValue) => {
    setVisibleSubLayers(prev => {
      const current = prev[layerName] || [];
      const updated = current.includes(subLayerValue)
        ? current.filter(v => v !== subLayerValue)
        : [...current, subLayerValue];
      return { ...prev, [layerName]: updated };
    });
  };

  // Reload only one layer's data without triggering the full loading screen.
  // Safe to call after appending a row that already has coordinates — no geocoding needed.
  const reloadSingleLayer = async (layerName) => {
    const sheetConfig = config.sheets.find(s => s.name === layerName);
    if (!sheetConfig) return;

    const rows = await googleSheetsService.readSheet(config.spreadsheetId, sheetConfig.name);
    const features = [];

    if (sheetConfig.featureType === 'polygon') {
      for (const row of rows) {
        const geometryStr = row[sheetConfig.geometryColumn];
        if (!geometryStr) continue;
        try {
          const geometry = JSON.parse(geometryStr);
          features.push({ coordinates: computeCentroid(geometry), geometry, data: row });
        } catch (e) {}
      }
    } else {
      for (const row of rows) {
        if (!row[sheetConfig.addressColumn]) continue;
        const lat = parseFloat(row[sheetConfig.latColumn]);
        const lng = parseFloat(row[sheetConfig.lngColumn]);
        if (!isNaN(lat) && !isNaN(lng)) {
          features.push({ coordinates: { lat, lng }, data: row });
        }
      }
    }

    setLayers(prev => prev.map(l =>
      l.name === layerName ? { ...l, features } : l
    ));

    // Extend slider ranges to cover any new values (never shrink the current filter)
    setSliderRanges(prev => {
      if (!sheetConfig.sliderFilters) return prev;
      const layerRanges = { ...(prev[layerName] || {}) };
      sheetConfig.sliderFilters.forEach(({ field, type }) => {
        const values = features
          .map(f => parseSliderValue(f.data[field], type))
          .filter(v => v !== null);
        if (values.length === 0) return;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const existing = layerRanges[field];
        layerRanges[field] = {
          min,
          max,
          low: existing ? Math.min(existing.low, min) : min,
          high: existing ? Math.max(existing.high, max) : max,
          type
        };
      });
      return { ...prev, [layerName]: layerRanges };
    });
  };

  const handleMapClick = (coords) => {
    setAddMarkerCoords(coords);
    setAddMarkerMode(false);
  };

  const handleAddMarkerSubmit = async (layerName, fieldValues) => {
    const sheetConfig = config.sheets.find(s => s.name === layerName);
    if (!sheetConfig) return;

    const rowData = { ...fieldValues };

    // Write coordinates into the row
    if (sheetConfig.latColumn) rowData[sheetConfig.latColumn] = addMarkerCoords.lat.toString();
    if (sheetConfig.lngColumn) rowData[sheetConfig.lngColumn] = addMarkerCoords.lng.toString();

    await googleSheetsService.appendRow(config.spreadsheetId, layerName, rowData);
    logAudit('Added', layerName, rowData[sheetConfig.addressColumn] || rowData[sheetConfig.nameField] || '');
    setAddMarkerCoords(null);
    await reloadSingleLayer(layerName);
  };

  const handleAddMarkerCancel = () => {
    setAddMarkerCoords(null);
    setAddMarkerMode(false);
  };

  const handlePolygonCreate = (geometry) => {
    setDrawPolygonMode(false);
    if (polygonEditTargetRef.current) {
      // Attached polygon for an existing point feature — save directly, no modal
      const target = polygonEditTargetRef.current;
      polygonEditTargetRef.current = null;
      handleSaveAttachedPolygon(target.layer, target.feature, target.featureIndex, geometry);
    } else {
      // Standalone polygon layer — show modal
      setPendingPolygonGeometry(geometry);
    }
  };

  const handleSaveAttachedPolygon = async (layer, feature, featureIndex, geometry) => {
    const sheetConfig = config.sheets.find(s => s.name === layer.name);
    if (!sheetConfig?.polygonColumn) return;

    const updatedData = {
      ...feature.data,
      [sheetConfig.polygonColumn]: JSON.stringify(geometry)
    };

    await googleSheetsService.updateRow(
      config.spreadsheetId,
      layer.name,
      feature.data._rowIndex,
      updatedData
    );

    setLayers(prev => prev.map(l => {
      if (l.name !== layer.name) return l;
      const updatedFeatures = [...l.features];
      updatedFeatures[featureIndex] = { ...updatedFeatures[featureIndex], data: updatedData };
      return { ...l, features: updatedFeatures };
    }));
  };

  const handleDrawPolygonForFeature = (layer, feature, featureIndex) => {
    polygonEditTargetRef.current = { layer, feature, featureIndex };
    setDrawPolygonMode(true);
  };

  const handlePolygonSubmit = async (layerName, fieldValues) => {
    const sheetConfig = config.sheets.find(s => s.name === layerName);
    if (!sheetConfig) return;

    const rowData = {
      ...fieldValues,
      [sheetConfig.geometryColumn]: JSON.stringify(pendingPolygonGeometry)
    };

    await googleSheetsService.appendRow(config.spreadsheetId, layerName, rowData);
    logAudit('Added Polygon', layerName, rowData[sheetConfig.nameField] || '');
    setPendingPolygonGeometry(null);
    await reloadSingleLayer(layerName);
  };

  const handlePolygonCancel = () => {
    setPendingPolygonGeometry(null);
  };

  const handleAdminTrigger = () => {
    if (!process.env.REACT_APP_ADMIN_PIN) return;
    setPinModalOpen(true);
    setPinError(null);
  };

  const handleNameSubmit = (enteredName) => {
    const trimmed = enteredName.trim();
    const match = usersRef.current.find(u => u.name.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      if (oauthCredentials.current) {
        const { clientId, clientSecret, refreshToken } = oauthCredentials.current;
        googleSheetsService.initializeOAuth(clientId, clientSecret, refreshToken);
      }
      setCurrentUser({ name: match.name, role: match.role });
      setReadOnly(false);
      setPinModalOpen(false);
      setPinError(null);
    } else {
      setPinError('Name not recognized.');
    }
  };

  const logAudit = async (action, layerName, details) => {
    if (!currentUser || !config.auditLogSheet) return;
    try {
      await googleSheetsService.appendRow(config.spreadsheetId, config.auditLogSheet, {
        Timestamp: new Date().toLocaleString(),
        User: currentUser.name,
        Action: action,
        Layer: layerName,
        Details: details
      });
    } catch (err) {
      console.error('Audit log failed:', err);
    }
  };

  const getFeatureLabel = (feature, layerConfig) =>
    feature.data[layerConfig?.nameField] || feature.data[layerConfig?.addressColumn] || '(unknown)';

  const handleAdminLogout = () => {
    const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
    if (apiKey) googleSheetsService.initializeApiKey(apiKey);
    setReadOnly(true);
    setAddMarkerMode(false);
    setCurrentUser(null);
  };

  const handleToggleArchivedLayer = (layerName) => {
    setVisibleArchivedLayers(prev =>
      prev.includes(layerName)
        ? prev.filter(n => n !== layerName)
        : [...prev, layerName]
    );
  };

  const handleFeatureArchive = async (layer, feature, featureIndex) => {
    const sheetConfig = config.sheets.find(s => s.name === layer.name);
    if (!sheetConfig?.archivedColumn) return;

    const isCurrentlyArchived = !!feature.data[sheetConfig.archivedColumn];
    const updatedData = {
      ...feature.data,
      [sheetConfig.archivedColumn]: isCurrentlyArchived ? '' : 'true'
    };

    await googleSheetsService.updateRow(
      config.spreadsheetId,
      layer.name,
      feature.data._rowIndex,
      updatedData
    );
    logAudit(isCurrentlyArchived ? 'Restored' : 'Archived', layer.name, getFeatureLabel(feature, layer.config));

    setLayers(prev => prev.map(l => {
      if (l.name !== layer.name) return l;
      const updatedFeatures = [...l.features];
      updatedFeatures[featureIndex] = { ...updatedFeatures[featureIndex], data: updatedData };
      return { ...l, features: updatedFeatures };
    }));
  };

  const handleFeatureDelete = async (layer, feature, featureIndex) => {
    try {
      await googleSheetsService.deleteRow(
        config.spreadsheetId,
        layer.name,
        feature.data._rowIndex
      );
      logAudit('Deleted', layer.name, getFeatureLabel(feature, layer.config));

      // Remove the feature from local state
      setLayers(prev => prev.map(l => {
        if (l.name !== layer.name) return l;
        const updatedFeatures = l.features.filter((_, i) => i !== featureIndex);
        return { ...l, features: updatedFeatures };
      }));
    } catch (err) {
      console.error('Error deleting feature:', err);
      setError(`Failed to delete feature: ${err.message}`);
      throw err;
    }
  };

  const handleFeatureClick = (layer, feature, featureIndex) => {
    console.log('Feature clicked:', layer.displayName, feature);
  };

  const handleFeatureMove = async (layer, feature, featureIndex, newCoords, updatedData) => {
    try {
      const rowData = updatedData || { ...feature.data };

      const coordsChanged = newCoords && (
        newCoords.lat !== feature.coordinates.lat || newCoords.lng !== feature.coordinates.lng
      );

      let finalCoords = feature.coordinates;

      if (coordsChanged) {
        // Save current state for undo before modifying
        undoStack.current.push({
          layerName: layer.name,
          featureIndex,
          coordinates: { ...feature.coordinates },
          data: { ...feature.data }
        });
        setCanUndo(true);

        // Drag: update lat/lng and reverse-geocode to get new address
        finalCoords = newCoords;
        if (layer.config.latColumn) rowData[layer.config.latColumn] = newCoords.lat.toString();
        if (layer.config.lngColumn) rowData[layer.config.lngColumn] = newCoords.lng.toString();
        const reversedAddress = await geocodingService.reverseGeocode(newCoords.lat, newCoords.lng);
        if (reversedAddress && layer.config.addressColumn) {
          rowData[layer.config.addressColumn] = reversedAddress;
        }
      } else if (updatedData && layer.config.addressColumn) {
        // Popup edit: check if address field changed and re-geocode if so
        const oldAddress = feature.data[layer.config.addressColumn];
        const newAddress = rowData[layer.config.addressColumn];
        if (newAddress && newAddress !== oldAddress) {
          const geocoded = await geocodingService.geocode(newAddress);
          if (geocoded) {
            finalCoords = geocoded;
            if (layer.config.latColumn) rowData[layer.config.latColumn] = geocoded.lat.toString();
            if (layer.config.lngColumn) rowData[layer.config.lngColumn] = geocoded.lng.toString();
          }
        }
      }

      // Update local state so the marker moves immediately
      const updatedLayers = layers.map(l => {
        if (l.name === layer.name) {
          const updatedFeatures = [...l.features];
          updatedFeatures[featureIndex] = {
            ...updatedFeatures[featureIndex],
            coordinates: finalCoords,
            data: { ...rowData }
          };
          return { ...l, features: updatedFeatures };
        }
        return l;
      });
      setLayers(updatedLayers);

      // Update the row in Google Sheets
      await googleSheetsService.updateRow(
        config.spreadsheetId,
        layer.name,
        feature.data._rowIndex,
        rowData
      );

      logAudit(coordsChanged ? 'Moved' : 'Edited', layer.name, getFeatureLabel({ data: rowData }, layer.config));
      console.log('Feature updated and synced to sheet');

      // Reload from sheet so formula-computed fields reflect their new values
      await reloadSingleLayer(layer.name);
      
    } catch (err) {
      console.error('Error updating feature:', err);
      setError(`Failed to update feature: ${err.message}`);
      throw err; // Re-throw so popup can handle error state
    }
  };

  const handleUndo = async () => {
    if (undoStack.current.length === 0) return;
    const { layerName, featureIndex, coordinates, data } = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);

    // Restore local state immediately
    setLayers(prev => prev.map(l => {
      if (l.name !== layerName) return l;
      const updatedFeatures = [...l.features];
      updatedFeatures[featureIndex] = { ...updatedFeatures[featureIndex], coordinates, data: { ...data } };
      return { ...l, features: updatedFeatures };
    }));

    // Write the old data back to Google Sheets
    try {
      await googleSheetsService.updateRow(config.spreadsheetId, layerName, data._rowIndex, data);
    } catch (err) {
      console.error('Error undoing move:', err);
      setError(`Failed to undo: ${err.message}`);
    }
  };

  if (!authenticated) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Setting up authentication...</h2>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'sans-serif',
        flexDirection: 'column'
      }}>
        <h2>Loading data from Google Sheets...</h2>
        {geocodingProgress && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <p>Geocoding {geocodingProgress.sheet}</p>
            <p>{geocodingProgress.current} of {geocodingProgress.total}</p>
            <div style={{
              width: '300px',
              height: '20px',
              backgroundColor: '#e0e0e0',
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${(geocodingProgress.current / geocodingProgress.total) * 100}%`,
                height: '100%',
                backgroundColor: '#4E9A5A',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const isCoordWriteError = error?.startsWith('__COORD_WRITE_ERROR__');

  if (error && !isCoordWriteError) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'sans-serif'
      }}>
        <div style={{
          backgroundColor: '#ffebee',
          padding: '20px',
          borderRadius: '8px',
          maxWidth: '500px'
        }}>
          <h2 style={{ color: '#963D3D' }}>Error</h2>
          <p>{error}</p>
          <button
            onClick={() => loadAllSheets()}
            style={{ marginTop: '10px', padding: '8px 16px', cursor: 'pointer', backgroundColor: '#4E9A5A', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {isCoordWriteError && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2000,
          backgroundColor: '#fff3cd', borderBottom: '1px solid #ffc107',
          padding: '10px 16px', fontFamily: 'sans-serif', fontSize: '13px',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ flex: 1 }}>
            <strong>Warning:</strong> Could not save new coordinates to Google Sheets. The map has loaded, but coordinates will need to be re-geocoded next time.
            {error && <span style={{ display: 'block', fontSize: '11px', color: '#856404', marginTop: '2px' }}>{error.replace('__COORD_WRITE_ERROR__', '')}</span>}
          </span>
          <button onClick={() => loadAllSheets(false)} style={{ padding: '4px 10px', cursor: 'pointer', backgroundColor: '#4E9A5A', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px' }}>
            Retry with saving
          </button>
          <button onClick={() => setError(null)} style={{ padding: '4px 10px', cursor: 'pointer', backgroundColor: '#9e9e9e', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px' }}>
            Dismiss
          </button>
        </div>
      )}
      <SearchBar
        layers={layers}
        mapboxToken={process.env.REACT_APP_MAPBOX_TOKEN}
        onSelectFeature={(layer, feature, featureIndex) =>
          setSearchTarget({ type: 'feature', layer, feature, featureIndex, _t: Date.now() })
        }
        onSelectPlace={(lat, lng, label) =>
          setSearchTarget({ type: 'place', lat, lng, label, _t: Date.now() })
        }
      />
      <Map
        mapboxToken={process.env.REACT_APP_MAPBOX_TOKEN}
        center={config.map.center}
        zoom={config.map.zoom}
        style={mapStyle}
        layers={layers}
        visibleLayers={visibleLayers}
        visibleSubLayers={visibleSubLayers}
        sliderRanges={sliderRanges}
        onFeatureClick={handleFeatureClick}
        onFeatureMove={handleFeatureMove}
        onUndo={handleUndo}
        canUndo={canUndo}
        onFeatureDelete={handleFeatureDelete}
        onFeatureArchive={handleFeatureArchive}
        visibleArchivedLayers={visibleArchivedLayers}
        readOnly={readOnly}
        currentUser={currentUser}
        addMarkerMode={addMarkerMode}
        onMapClick={handleMapClick}
        drawPolygonMode={drawPolygonMode}
        onPolygonDrawn={handlePolygonCreate}
        onDrawPolygonForFeature={handleDrawPolygonForFeature}
        searchTarget={searchTarget}
      />
      {!readOnly && (
        <>
          <button
            onClick={() => setDrawPolygonMode(prev => !prev)}
            title={drawPolygonMode ? 'Click map to draw polygon vertices, double-click to finish' : 'Draw a polygon on the map'}
            style={{
              position: 'absolute',
              bottom: '76px',
              right: '10px',
              zIndex: 1000,
              padding: '10px 18px',
              backgroundColor: drawPolygonMode ? '#5A3D85' : '#7B5EA7',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'background-color 0.15s'
            }}
          >
            {drawPolygonMode ? 'Drawing… (dbl-click to finish)' : '+ Draw Polygon'}
          </button>
          <button
            onClick={() => setAddMarkerMode(prev => !prev)}
            title={addMarkerMode ? 'Click anywhere on the map to place a point' : 'Add a new point to a layer'}
            style={{
              position: 'absolute',
              bottom: '30px',
              right: '10px',
              zIndex: 1000,
              padding: '10px 18px',
              backgroundColor: addMarkerMode ? '#2D5F9E' : '#4A8DB8',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'background-color 0.15s'
            }}
          >
            {addMarkerMode ? 'Click map to place…' : '+ Add Point'}
          </button>
        </>
      )}
      {addMarkerCoords && (
        <AddMarkerModal
          layers={layers.filter(l => l.config.featureType !== 'polygon' && l.config.editable)}
          coordinates={addMarkerCoords}
          onSubmit={handleAddMarkerSubmit}
          onCancel={handleAddMarkerCancel}
        />
      )}
      {pendingPolygonGeometry && (
        <AddMarkerModal
          layers={layers.filter(l => l.config.featureType === 'polygon' && l.config.editable)}
          coordinates={null}
          onSubmit={handlePolygonSubmit}
          onCancel={handlePolygonCancel}
        />
      )}
      {pinModalOpen && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 4000, fontFamily: 'sans-serif'
        }} onKeyDown={e => e.key === 'Escape' && setPinModalOpen(false)}>
          <div style={{
            backgroundColor: 'white', borderRadius: '8px', padding: '24px',
            width: '260px', boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
          }}>
            <form onSubmit={e => { e.preventDefault(); handleNameSubmit(e.target.username.value); }}>
              <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#555' }}>Enter your name to unlock editing</p>
              <input
                name="username"
                type="text"
                placeholder="Your name"
                autoFocus
                style={{
                  width: '100%', padding: '8px', border: '1px solid #ddd',
                  borderRadius: '4px', fontSize: '14px', boxSizing: 'border-box',
                  marginBottom: '10px'
                }}
              />
              {pinError && (
                <p style={{ color: '#C0504D', fontSize: '12px', margin: '0 0 10px' }}>{pinError}</p>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => { setPinModalOpen(false); setPinError(null); }}
                  style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'white', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, padding: '8px', backgroundColor: '#4A8DB8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <LayerControls
        layers={layers}
        visibleLayers={visibleLayers}
        onToggleLayer={handleToggleLayer}
        onToggleSubLayer={handleToggleSubLayer}
        visibleSubLayers={visibleSubLayers}
        sliderRanges={sliderRanges}
        onSliderChange={handleSliderChange}
        onDeselectAll={handleDeselectAll}
        onRefresh={loadAllSheets}
        visibleArchivedLayers={visibleArchivedLayers}
        onToggleArchivedLayer={handleToggleArchivedLayer}
        isAdminMode={!readOnly && !!process.env.REACT_APP_ADMIN_PIN}
        onAdminTrigger={handleAdminTrigger}
        onAdminLogout={handleAdminLogout}
        mapStyle={mapStyle}
        onStyleChange={setMapStyle}
      />
    </div>
  );
}

export default App;
