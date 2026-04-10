// Configuration for your Google Sheets mapping
// Copy this to config.local.js and customize for your spreadsheet

export const config = {
  // Your Google Sheets ID (from the URL)
  // Example: https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
  spreadsheetId: 'YOUR_SPREADSHEET_ID_HERE',

  // Configure each tab/sheet in your spreadsheet
  sheets: [
    {
      // Name of the tab in Google Sheets
      name: 'Sheet1',
      
      // Display name for the layer toggle
      displayName: 'Store Locations',
      
      // Which column contains the address (use the column letter or header name)
      addressColumn: 'Address', // or 'A', 'B', etc.
      
      // Optional: If you already have lat/long columns, specify them
      latColumn: null, // 'Latitude' or null if geocoding needed
      lngColumn: null, // 'Longitude' or null if geocoding needed
      
      // Feature type: 'point', 'line', or 'polygon'
      featureType: 'point',
      
      // Styling configuration
      style: {
        // Default color for all features in this layer
        defaultColor: '#3388ff',
        
        // Column to use for color coding (optional)
        colorByColumn: 'Status', // null if not needed
        
        // Color mapping based on column values
        colorMap: {
          'Active': '#00ff00',
          'Inactive': '#ff0000',
          'Pending': '#ffaa00'
        },
        
        // Icon type for points (optional)
        iconColumn: 'Type', // null if not needed
        
        // Icon mapping
        iconMap: {
          'Store': 'store',
          'Warehouse': 'warehouse',
          'Office': 'office'
        },
        
        // Default icon if no match
        defaultIcon: 'marker',
        
        // Size configuration
        size: 8, // For points: radius in pixels
        lineWidth: 3 // For lines: width in pixels
      }
    }
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
    center: [-86.7833, 36.1627], // Nashville, TN
    
    // Default zoom level
    zoom: 10,
    
    // Mapbox style
    style: 'mapbox://styles/mapbox/streets-v12'
  }
};
