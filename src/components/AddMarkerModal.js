import React, { useState, useEffect } from 'react';
import geocodingService from '../services/geocoding';

const AddMarkerModal = ({ layers, coordinates, onSubmit, onCancel }) => {
  const isPolygonMode = coordinates === null;
  const [selectedLayerName, setSelectedLayerName] = useState(layers[0]?.name || '');
  const [fieldValues, setFieldValues] = useState({});
  const [geocodedAddress, setGeocodedAddress] = useState('');
  const [loadingAddress, setLoadingAddress] = useState(!isPolygonMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const selectedLayer = layers.find(l => l.name === selectedLayerName);

  // Reverse geocode the clicked location once on mount (point mode only)
  useEffect(() => {
    if (isPolygonMode) return;
    let cancelled = false;
    setLoadingAddress(true);
    geocodingService.reverseGeocode(coordinates.lat, coordinates.lng).then(addr => {
      if (!cancelled) {
        setGeocodedAddress(addr || '');
        setLoadingAddress(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLayerChange = (layerName) => {
    setSelectedLayerName(layerName);
    setFieldValues({}); // clear explicit edits when layer changes
  };

  // Build the ordered list of form fields for the selected layer
  const getFormFields = () => {
    if (!selectedLayer) return [];
    const { config } = selectedLayer;
    const excluded = new Set(
      ['_rowIndex', config.latColumn, config.lngColumn, config.geometryColumn].filter(Boolean)
    );

    // Use all columns from the sheet (derived from any existing feature's keys),
    // falling back to popupFields only if the layer has no features yet.
    let baseFields = selectedLayer.features[0]
      ? Object.keys(selectedLayer.features[0].data)
      : (config.popupFields || []);

    // Always surface the address column at the top if it isn't already present
    const addressCol = config.addressColumn;
    if (addressCol && !baseFields.includes(addressCol)) {
      baseFields = [addressCol, ...baseFields];
    }

    return baseFields.filter(f => !excluded.has(f));
  };

  // Controlled value: explicit edit wins, otherwise use geocoded address for address field
  const getValue = (fieldName) => {
    if (fieldName in fieldValues) return fieldValues[fieldName];
    if (selectedLayer && fieldName === selectedLayer.config.addressColumn) {
      return geocodedAddress;
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const formFields = getFormFields();
    const finalValues = {};
    formFields.forEach(f => { finalValues[f] = getValue(f); });

    try {
      await onSubmit(selectedLayerName, finalValues);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const formFields = getFormFields();

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3000,
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        width: '380px',
        maxHeight: '82vh',
        overflowY: 'auto',
        boxShadow: '0 4px 24px rgba(0,0,0,0.35)'
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>{isPolygonMode ? 'Add New Polygon' : 'Add New Point'}</h3>

        {/* Layer selector */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px' }}>
            Layer
          </label>
          <select
            value={selectedLayerName}
            onChange={e => handleLayerChange(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          >
            {layers.map(l => (
              <option key={l.name} value={l.name}>{l.displayName}</option>
            ))}
          </select>
        </div>

        {/* Coordinates (read-only display, point mode only) */}
        {!isPolygonMode && (
          <div style={{
            marginBottom: '14px',
            padding: '8px 10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#666'
          }}>
            Location: {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {formFields.map(fieldName => {
            const isAddressField =
              selectedLayer && fieldName === selectedLayer.config.addressColumn;
            const sliderFilter = selectedLayer?.config.sliderFilters?.find(f => f.field === fieldName);
            return (
              <div key={fieldName} style={{ marginBottom: '10px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#666',
                  marginBottom: '3px'
                }}>
                  {fieldName}
                  {isAddressField && loadingAddress && (
                    <span style={{ fontWeight: 'normal', color: '#aaa', marginLeft: '4px' }}>
                      (geocoding…)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={getValue(fieldName)}
                  onChange={e =>
                    setFieldValues(prev => ({ ...prev, [fieldName]: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '12px',
                    boxSizing: 'border-box'
                  }}
                />
                {sliderFilter?.type === 'date' && (
                  <span style={{ fontSize: '10px', color: '#aaa', marginTop: '2px', display: 'block' }}>
                    MM/DD/YYYY
                  </span>
                )}
              </div>
            );
          })}

          {error && (
            <p style={{ color: '#C0504D', fontSize: '12px', margin: '8px 0 0' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: 'white',
                fontSize: '13px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: saving ? '#9e9e9e' : '#4E9A5A',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: saving ? 'default' : 'pointer',
                fontSize: '13px',
                fontWeight: 'bold'
              }}
            >
              {saving ? 'Adding…' : isPolygonMode ? 'Add Polygon' : 'Add Point'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddMarkerModal;
