// Configuration for your Google Sheets mapping
// Copy this to config.local.js and customize for your spreadsheet

export const config = {
  // Your Google Sheets ID (from the URL)
  // Example: https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
  spreadsheetId: '1f6_tuQ5N197LYXjDfuYXbmyfMtFRMzhMXk0tOX5VznQ',

  // Sheet name for user list (columns: Name, Role)
  usersSheet: 'Users',

  // Sheet name for audit log (columns: Timestamp, User, Action, Layer, Details)
  auditLogSheet: 'Audit Log',

  // Configure each tab/sheet in your spreadsheet
  sheets: [
    {
      // Name of the tab in Google Sheets
      name: 'Supply',

      // Display name for the layer toggle
      displayName: 'Supply',

      // Which column contains the address (use the column letter or header name)
      addressColumn: 'Address', // or 'A', 'B', etc.

      // Optional: If you already have lat/long columns, specify them
      latColumn: 'Latitude', // 'Latitude' or null if geocoding needed
      lngColumn: 'Longitude', // 'Longitude' or null if geocoding needed

      // Feature type: 'point', 'line', or 'polygon'
      featureType: 'point',

      nameField: 'Name',
      archivedColumn: 'Archived',
      polygonColumn: 'Polygon',
      editable: true,
      popupFields: ['Address', 'Constr Status', 'Number Of Units', 'Construction Begin', 'Notes', 'Developer Name', 'Link'],
      sliderFilters: [
        { field: 'Construction Begin', type: 'date' }
      ],
      linkFields: ['Link'],

      // Styling configuration
      style: {
        // Default color for all features in this layer
        defaultColor: '#3A9070',

        // Column to use for color coding (optional)
        colorByColumn: 'Constr Status',

        // Color mapping based on column values
        colorMap: {
          'Proposed': '#B8A83A',
          'Under Construction': '#C47A36',
        },

        // Icon mapped by construction status sub-layer
        iconColumn: 'Constr Status',
        iconMap: {
          'Proposed': 'proposed',
          'Under Construction': 'construction',
        },
        defaultIcon: 'building',

        // Size configuration
        size: 8, // For points: radius in pixels
        lineWidth: 3 // For lines: width in pixels
      }
    },
    {
      // Name of the tab in Google Sheets
      name: 'Completed Sales',

      // Display name for the layer toggle
      displayName: 'Completed Sales',

      // Which column contains the address (use the column letter or header name)
      addressColumn: 'Address', // or 'A', 'B', etc.

      // Optional: If you already have lat/long columns, specify them
      latColumn: 'Latitude', // 'Latitude' or null if geocoding needed
      lngColumn: 'Longitude', // 'Longitude' or null if geocoding needed

      // Feature type: 'point', 'line', or 'polygon'
      featureType: 'point',

      nameField: 'Property Name',
      archivedColumn: 'Archived',
      popupFields: ['Address', 'Number Of Units', 'Year Built', 'Sale Date', 'Sale Price', 'Per Unit'],
      sliderFilters: [
        { field: 'Year Built', type: 'year' },
        { field: 'Sale Date', type: 'date' }
      ],

      // Styling configuration
      style: {
        defaultColor: '#4A80BF',
        colorByColumn: null,
        colorMap: {},
        defaultIcon: 'pin',

        // Size configuration
        size: 8, // For points: radius in pixels
        lineWidth: 3 // For lines: width in pixels
      }
    },
    {
      // Name of the tab in Google Sheets
      name: 'Land Sales',

      // Display name for the layer toggle
      displayName: 'Land Sales',

      // Which column contains the address (use the column letter or header name)
      addressColumn: 'Address', // or 'A', 'B', etc.

      // Optional: If you already have lat/long columns, specify them
      latColumn: 'Latitude', // 'Latitude' or null if geocoding needed
      lngColumn: 'Longitude', // 'Longitude' or null if geocoding needed

      // Feature type: 'point', 'line', or 'polygon'
      featureType: 'point',

      nameField: 'Property',
      archivedColumn: 'Archived',
      popupFields: ['Number of Units', 'Acres', 'Land Sale Date', 'Land Sale Price', '$/acre', '$/unit'],
      sliderFilters: [
        { field: 'Land Sale Date', type: 'date' }
      ],

      // Styling configuration
      style: {
        defaultColor: '#4A80BF',
        colorByColumn: null,
        colorMap: {},
        defaultIcon: 'pin',

        // Size configuration
        size: 8, // For points: radius in pixels
        lineWidth: 3 // For lines: width in pixels
      }
    },
    {
      // Name of the tab in Google Sheets
      name: 'Rent Comps',

      // Display name for the layer toggle
      displayName: 'Rent Comps',

      // Which column contains the address (use the column letter or header name)
      addressColumn: 'Address', // or 'A', 'B', etc.

      // Optional: If you already have lat/long columns, specify them
      latColumn: 'Latitude', // 'Latitude' or null if geocoding needed
      lngColumn: 'Longitude', // 'Longitude' or null if geocoding needed

      // Feature type: 'point', 'line', or 'polygon'
      featureType: 'point',

      nameField: 'Property Name',
      archivedColumn: 'Archived',
      popupFields: ['Address', 'Number Of Units', 'Year Built', 'Avg Asking/Unit', 'Occupancy', 'Developer Name', 'True Owner Name'],
      sliderFilters: [
        { field: 'Year Built', type: 'year' },
        { field: 'Number Of Units', type: 'year' }
      ],

      // Styling configuration
      style: {
        // Default color — used as fallback when heatColumn value is missing
        defaultColor: '#EBD98A',

        colorByColumn: null,
        colorMap: {},

        // Gradient coloring: low value = lightColor, high value = darkColor
        heatColumn: 'Avg Asking/Unit',
        lightColor: '#EBD98A',
        darkColor: '#7A2828',

        // Building icon, color varies by rent heat gradient
        defaultIcon: 'building',

        size: 8,
        lineWidth: 3
      }
    },
    {
      // Name of the tab in Google Sheets
      name: 'Sites',

      // Display name for the layer toggle
      displayName: 'Sites',

      // Which column contains the address (use the column letter or header name)
      addressColumn: 'Address', // or 'A', 'B', etc.

      // Optional: If you already have lat/long columns, specify them
      latColumn: 'Latitude', // 'Latitude' or null if geocoding needed
      lngColumn: 'Longitude', // 'Longitude' or null if geocoding needed

      // Feature type: 'point', 'line', or 'polygon'
      featureType: 'point',

      nameField: 'Site',
      archivedColumn: 'Archived',
      polygonColumn: 'Polygon',
      editable: true,
      popupFields: ['Address', 'MF Allowed By Right', 'Acres', 'Asking', 'Broker', 'Broker Company', 'Notes', 'Link'],
      linkFields: ['Link'],

      // Styling configuration
      style: {
        defaultColor: '#B8A83A', // Yellow — used for anything that isn't "Yes"

        colorByColumn: 'MF Allowed By Right',
        colorMap: {
          'Yes': '#4E9A5A', // Green
        },
        otherLabel: 'No',

        // Both Yes/No sub-layers use the dollar icon; color differentiates them
        defaultIcon: 'dollar',

        size: 8,
        lineWidth: 3
      }
    },
    {
      name: 'Zones',
      displayName: 'Developments/Announcements',
      featureType: 'polygon',
      geometryColumn: 'Geometry',
      nameField: 'Name',
      archivedColumn: 'Archived',
      editable: true,
      popupFields: ['Name', 'Type', 'Notes', 'Link'],
      linkFields: ['Link'],
      style: {
        defaultColor: '#757575',
        fillOpacity: 0.68,
        lineWidth: 2,
        colorByColumn: 'Type',
        colorMap: {
          'Multifamily':    '#6A4E9A',
          'Mixed Use':      '#2D5F9E',
          'Single Family':  '#3A7A40',
          'Retail':         '#B55A28',
          'Condos':         '#CCC46A',
          'Affordable':     '#F5F5F5',
        },
      }
    },
    // Add more sheet configurations here...
    // Example for a second sheet:
    // {
    //   name: 'Sheet2',
    //   displayName: 'Delivery Routes',
    //   addressColumn: 'Route',
    //   featureType: 'line',
    //   style: {
    //     defaultColor: '#ff5500',
    //     lineWidth: 4
    //   }
    // }
  ],

  // Map default settings
  map: {
    // Default map center [longitude, latitude]
    center: [-71.0565, 42.3555], // Boston, MA

    // Default zoom level
    zoom: 10,

    // Mapbox style
    style: 'mapbox://styles/mapbox/satellite-streets-v12'
  }
};
