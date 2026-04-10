import { useState, useEffect, useRef } from 'react';
import { createPinSvg } from '../utils/markerIcons';

const LayerControls = ({ layers, visibleLayers, visibleSubLayers, onToggleLayer, onToggleSubLayer, sliderRanges, onSliderChange, onRefresh, onDeselectAll, mapStyle, onStyleChange, visibleArchivedLayers, onToggleArchivedLayer, isAdminMode, onAdminTrigger, onAdminLogout }) => {

  const [collapsed, setCollapsed] = useState(false);
  const [openFilters, setOpenFilters] = useState({});

  // Local text state for filter inputs: { 'LayerName': { 'Field': { low: '2010', high: '2024' } } }
  const [inputText, setInputText] = useState({});

  // Triple-click on heading to trigger admin PIN
  const headingClicks = useRef(0);
  const headingClickTimer = useRef(null);

  const handleHeadingClick = () => {
    headingClicks.current += 1;
    clearTimeout(headingClickTimer.current);
    if (headingClicks.current >= 3) {
      headingClicks.current = 0;
      if (onAdminTrigger) onAdminTrigger();
    } else {
      headingClickTimer.current = setTimeout(() => {
        headingClicks.current = 0;
      }, 600);
    }
  };

  // Sync inputText when sliderRanges initializes (on data load)
  useEffect(() => {
    if (!sliderRanges) return;
    setInputText(prev => {
      const next = { ...prev };
      Object.entries(sliderRanges).forEach(([layerName, fields]) => {
        if (next[layerName]) return; // don't overwrite user edits
        next[layerName] = {};
        Object.entries(fields).forEach(([field, range]) => {
          next[layerName][field] = {
            low: formatValue(range.low, range.type),
            high: formatValue(range.high, range.type)
          };
        });
      });
      return next;
    });
  }, [sliderRanges]);

  const formatValue = (value, type) => {
    if (type === 'year') return `${value}`;
    if (type === 'date') {
      const year = Math.floor(value / 100);
      const month = value % 100;
      return `${month}/${year}`;
    }
    return `${value}`;
  };

  const parseValue = (text, type) => {
    if (type === 'year') {
      const y = parseInt(text, 10);
      return isNaN(y) ? null : y;
    }
    if (type === 'date') {
      const parts = text.trim().split('/');
      if (parts.length !== 2) return null;
      const month = parseInt(parts[0], 10);
      const year = parseInt(parts[1], 10);
      if (isNaN(month) || isNaN(year) || month < 1 || month > 12) return null;
      return year * 100 + month;
    }
    return null;
  };

  const handleInputChange = (layerName, field, bound, text) => {
    setInputText(prev => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        [field]: {
          ...prev[layerName]?.[field],
          [bound]: text
        }
      }
    }));
  };

  const handleInputCommit = (layerName, field, bound, text, type, range) => {
    const parsed = parseValue(text, type);
    if (parsed === null) {
      // Reset to last valid value
      setInputText(prev => ({
        ...prev,
        [layerName]: {
          ...prev[layerName],
          [field]: {
            ...prev[layerName]?.[field],
            [bound]: formatValue(range[bound], type)
          }
        }
      }));
      return;
    }
    // Clamp: low <= high
    const clamped = bound === 'low'
      ? Math.min(parsed, range.high)
      : Math.max(parsed, range.low);
    onSliderChange(layerName, field, bound, clamped);
    setInputText(prev => ({
      ...prev,
      [layerName]: {
        ...prev[layerName],
        [field]: {
          ...prev[layerName]?.[field],
          [bound]: formatValue(clamped, type)
        }
      }
    }));
  };
  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      left: '10px',
      backgroundColor: 'white',
      padding: '15px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      zIndex: 1000,
      maxWidth: '250px',
      minWidth: collapsed ? '0' : undefined,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: collapsed ? '0' : '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', cursor: 'default', userSelect: 'none' }} onClick={handleHeadingClick}>Layers</h3>
          {isAdminMode && !collapsed && (
            <span
              onClick={onAdminLogout}
              title="Exit admin mode"
              style={{ fontSize: '10px', backgroundColor: '#4E9A5A', color: 'white', padding: '1px 6px', borderRadius: '3px', cursor: 'pointer', userSelect: 'none' }}
            >
              Admin ×
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {!collapsed && (
            <>
              <button
                onClick={onDeselectAll}
                style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#9e9e9e', color: 'white', border: 'none', borderRadius: '4px' }}
              >
                Deselect All
              </button>
              <button
                onClick={onRefresh}
                style={{ padding: '4px 8px', fontSize: '12px', cursor: 'pointer', backgroundColor: '#4E9A5A', color: 'white', border: 'none', borderRadius: '4px' }}
              >
                Refresh
              </button>
            </>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand layers panel' : 'Collapse layers panel'}
            style={{
              padding: '4px 7px',
              fontSize: '13px',
              cursor: 'pointer',
              backgroundColor: '#f0f0f0',
              color: '#555',
              border: 'none',
              borderRadius: '4px',
              lineHeight: 1,
            }}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>
      </div>

      {!collapsed && <>
      {/* Map Style Switcher */}
      <div style={{
        marginBottom: '12px',
        paddingBottom: '12px',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <div style={{ fontSize: '12px', marginBottom: '6px', fontWeight: 'bold' }}>Map Style</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => onStyleChange('mapbox://styles/mapbox/streets-v12')}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              cursor: 'pointer',
              backgroundColor: mapStyle === 'mapbox://styles/mapbox/streets-v12' ? '#4A8DB8' : '#f0f0f0',
              color: mapStyle === 'mapbox://styles/mapbox/streets-v12' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              fontWeight: mapStyle === 'mapbox://styles/mapbox/streets-v12' ? 'bold' : 'normal'
            }}
          >
            Streets
          </button>
          <button
            onClick={() => onStyleChange('mapbox://styles/mapbox/satellite-streets-v12')}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              cursor: 'pointer',
              backgroundColor: mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12' ? '#4A8DB8' : '#f0f0f0',
              color: mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              fontWeight: mapStyle === 'mapbox://styles/mapbox/satellite-streets-v12' ? 'bold' : 'normal'
            }}
          >
            Satellite
          </button>
        </div>
      </div>
      
      {layers.map((layer) => {
        const isVisible = visibleLayers.includes(layer.name);
        const featureCount = layer.features?.length || 0;
        const hasSubLayers = layer.style.colorByColumn && layer.style.colorMap;
        const subLayerEntries = hasSubLayers
          ? [...Object.entries(layer.style.colorMap), ['__other__', layer.style.defaultColor]]
              .filter(([value]) => {
                // Always show __other__ if the layer has a custom otherLabel (e.g. "No")
                if (value === '__other__' && layer.style.otherLabel) return true;
                const features = layer.features || [];
                if (features.length === 0) return true; // show all entries before data loads
                const col = layer.style.colorByColumn;
                return features.some(f => {
                  const fVal = f.data[col];
                  return value === '__other__'
                    ? !layer.style.colorMap[fVal]
                    : fVal === value;
                });
              })
          : [];

        return (
          <div key={layer.name} style={{ marginBottom: '8px' }}>
            {/* Parent layer row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                backgroundColor: isVisible ? '#EEF4FB' : '#f9f9f9',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onClick={() => onToggleLayer(layer.name)}
            >
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => {}}
                style={{ marginRight: '8px', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: isVisible ? 'bold' : 'normal',
                  marginBottom: '2px'
                }}>
                  {layer.displayName}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>
                  {featureCount} feature{featureCount !== 1 ? 's' : ''}
                </div>
              </div>
              {isVisible && layer.config.sliderFilters && sliderRanges?.[layer.name] && (
                <span
                  onClick={e => {
                    e.stopPropagation();
                    setOpenFilters(prev => ({ ...prev, [layer.name]: !prev[layer.name] }));
                  }}
                  style={{
                    fontSize: '10px',
                    color: openFilters[layer.name] ? 'white' : '#999',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    border: `1px solid ${openFilters[layer.name] ? '#4A8DB8' : '#ccc'}`,
                    backgroundColor: openFilters[layer.name] ? '#4A8DB8' : 'transparent',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    marginLeft: '4px',
                  }}
                >
                  Filter
                </span>
              )}
            </div>

            {/* Sub-layer rows */}
            {hasSubLayers && isVisible && (
              <div style={{ paddingLeft: '16px', marginTop: '4px' }}>
                {subLayerEntries.map(([value, color]) => {
                  const isSubVisible = (visibleSubLayers?.[layer.name] || []).includes(value);
                  const label = value === '__other__' ? (layer.style.otherLabel || 'Other') : value;
                  return (
                    <div
                      key={value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: isSubVisible ? '#f8f8f8' : 'transparent'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSubLayer(layer.name, value);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSubVisible}
                        onChange={() => {}}
                        style={{ marginRight: '8px', cursor: 'pointer' }}
                      />
                      <div
                        style={{ width: '14px', height: '14px', marginRight: '6px', flexShrink: 0 }}
                        dangerouslySetInnerHTML={{ __html: createPinSvg(
                          color,
                          (value !== '__other__' && layer.style.iconMap?.[value]) || layer.style.defaultIcon || 'pin',
                          1,
                          0.5
                        )}}
                      />
                      <div style={{ fontSize: '12px', color: isSubVisible ? '#333' : '#999' }}>
                        {label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Range filters */}
            {isVisible && openFilters[layer.name] && layer.config.sliderFilters && sliderRanges?.[layer.name] && (
              <div style={{ paddingLeft: '8px', paddingRight: '4px', marginTop: '6px', borderLeft: '2px solid #EEF4FB' }}>
                {layer.config.sliderFilters.map(({ field, type }) => {
                  const range = sliderRanges[layer.name][field];
                  if (!range) return null;
                  const lowText = inputText[layer.name]?.[field]?.low ?? formatValue(range.low, type);
                  const highText = inputText[layer.name]?.[field]?.high ?? formatValue(range.high, type);
                  const placeholder = type === 'date' ? 'M/YYYY' : 'YYYY';
                  return (
                    <div key={field} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#555', marginBottom: '4px' }}>
                        {field}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="text"
                          value={lowText}
                          placeholder={placeholder}
                          onChange={e => handleInputChange(layer.name, field, 'low', e.target.value)}
                          onBlur={e => handleInputCommit(layer.name, field, 'low', e.target.value, type, range)}
                          onKeyDown={e => e.key === 'Enter' && handleInputCommit(layer.name, field, 'low', e.target.value, type, range)}
                          style={{ width: '70px', padding: '3px 5px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', textAlign: 'center' }}
                        />
                        <span style={{ fontSize: '11px', color: '#999' }}>to</span>
                        <input
                          type="text"
                          value={highText}
                          placeholder={placeholder}
                          onChange={e => handleInputChange(layer.name, field, 'high', e.target.value)}
                          onBlur={e => handleInputCommit(layer.name, field, 'high', e.target.value, type, range)}
                          onKeyDown={e => e.key === 'Enter' && handleInputCommit(layer.name, field, 'high', e.target.value, type, range)}
                          style={{ width: '70px', padding: '3px 5px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', textAlign: 'center' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Archived sub-layer row */}
            {(() => {
              const archivedCol = layer.config.archivedColumn;
              if (!archivedCol || !isVisible) return null;
              const archivedCount = (layer.features || []).filter(
                f => !!f.data[archivedCol]
              ).length;
              if (archivedCount === 0) return null;
              const showingArchived = (visibleArchivedLayers || []).includes(layer.name);
              return (
                <div style={{ paddingLeft: '16px', marginTop: '4px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: showingArchived ? '#f8f8f8' : 'transparent'
                    }}
                    onClick={() => onToggleArchivedLayer(layer.name)}
                  >
                    <input
                      type="checkbox"
                      checked={showingArchived}
                      onChange={() => {}}
                      style={{ marginRight: '8px', cursor: 'pointer' }}
                    />
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: '#9e9e9e',
                      border: '1px solid #ccc',
                      marginRight: '6px',
                      flexShrink: 0
                    }} />
                    <div style={{ fontSize: '12px', color: showingArchived ? '#333' : '#999' }}>
                      Archived ({archivedCount})
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}

      {layers.length === 0 && (
        <div style={{ fontSize: '12px', color: '#999', textAlign: 'center' }}>
          No layers configured
        </div>
      )}
      </>}
    </div>
  );
};

export default LayerControls;