import React, { useState, useEffect, useRef } from 'react';

const SearchBar = ({ layers, mapboxToken, onSelectFeature, onSelectPlace }) => {
  const [query, setQuery] = useState('');
  const [dataResults, setDataResults] = useState([]);
  const [placeResults, setPlaceResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDataResults([]);
      setPlaceResults([]);
      setOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const lower = q.toLowerCase();

      // Search all layers, all fields
      const matches = [];
      layers.forEach(layer => {
        const excludedFields = new Set([
          '_rowIndex',
          layer.config.latColumn,
          layer.config.lngColumn,
          layer.config.geometryColumn,
          layer.config.polygonColumn,
        ].filter(Boolean));

        (layer.features || []).forEach((feature, featureIndex) => {
          const matchingFields = [];
          Object.entries(feature.data).forEach(([key, val]) => {
            if (excludedFields.has(key) || !val) return;
            if (String(val).toLowerCase().includes(lower)) {
              matchingFields.push(key);
            }
          });
          if (matchingFields.length > 0) {
            const nameField = layer.config.nameField;
            const addrField = layer.config.addressColumn;
            const name =
              (nameField && feature.data[nameField]) ||
              (addrField && feature.data[addrField]) ||
              'Unnamed';
            matches.push({ layer, feature, featureIndex, name, matchingFields });
          }
        });
      });

      setDataResults(matches.slice(0, 20));

      // Mapbox forward geocoding
      setLoading(true);
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxToken}&limit=5`;
        const res = await fetch(url);
        const json = await res.json();
        setPlaceResults(
          (json.features || []).map(f => ({
            id: f.id,
            name: f.place_name,
            lng: f.center[0],
            lat: f.center[1],
          }))
        );
      } catch {
        setPlaceResults([]);
      }
      setLoading(false);
      setOpen(true);
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSelectFeature = (result) => {
    setQuery('');
    setOpen(false);
    onSelectFeature(result.layer, result.feature, result.featureIndex);
  };

  const handleSelectPlace = (place) => {
    setQuery('');
    setOpen(false);
    onSelectPlace(place.lat, place.lng, place.name);
  };

  const hasResults = dataResults.length > 0 || placeResults.length > 0;
  const showNoResults = open && !hasResults && query.trim() && !loading;

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '270px',
        zIndex: 1500,
        width: '320px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
          color: '#aaa', fontSize: '11px', pointerEvents: 'none',
        }}>
          &#128269;
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          style={{
            width: '100%',
            padding: '10px 36px 10px 32px',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            fontSize: '12px',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {loading && (
          <span style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            color: '#aaa', fontSize: '12px',
          }}>
            …
          </span>
        )}
        {!loading && query && (
          <button
            onMouseDown={() => { setQuery(''); setOpen(false); }}
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#bbb', fontSize: '20px', lineHeight: 1, padding: '0 4px',
            }}
          >
            ×
          </button>
        )}
      </div>

      {(open && hasResults) || showNoResults ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          marginTop: '4px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          maxHeight: '420px',
          overflowY: 'auto',
        }}>
          {showNoResults && (
            <div style={{ padding: '14px', color: '#888', fontSize: '13px', textAlign: 'center' }}>
              No results found
            </div>
          )}

          {dataResults.length > 0 && (
            <>
              <div style={{
                padding: '7px 14px 5px',
                fontSize: '10px', fontWeight: 'bold', color: '#999',
                letterSpacing: '0.07em', textTransform: 'uppercase',
              }}>
                In your data{dataResults.length === 20 ? ' (top 20)' : ` (${dataResults.length})`}
              </div>
              {dataResults.map((result, i) => (
                <div
                  key={i}
                  onMouseDown={() => handleSelectFeature(result)}
                  style={{
                    padding: '8px 14px',
                    cursor: 'pointer',
                    borderTop: '1px solid #f2f2f2',
                    backgroundColor: 'white',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EEF4FB'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#222' }}>{result.name}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                    <span style={{ color: '#4A8DB8', fontWeight: '500' }}>{result.layer.displayName}</span>
                    {' · '}
                    {result.matchingFields.join(', ')}
                  </div>
                </div>
              ))}
            </>
          )}

          {placeResults.length > 0 && (
            <>
              <div style={{
                padding: '7px 14px 5px',
                fontSize: '10px', fontWeight: 'bold', color: '#999',
                letterSpacing: '0.07em', textTransform: 'uppercase',
                borderTop: dataResults.length > 0 ? '2px solid #eee' : 'none',
              }}>
                Places
              </div>
              {placeResults.map((place, i) => (
                <div
                  key={place.id}
                  onMouseDown={() => handleSelectPlace(place)}
                  style={{
                    padding: '8px 14px',
                    cursor: 'pointer',
                    borderTop: '1px solid #f2f2f2',
                    borderBottom: i === placeResults.length - 1 ? 'none' : undefined,
                    backgroundColor: 'white',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EEF4FB'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <div style={{ fontSize: '13px', color: '#333' }}>{place.name}</div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default SearchBar;
