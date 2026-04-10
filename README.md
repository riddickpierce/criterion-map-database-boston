# Map-Sheets Sync

A React application that syncs Google Sheets data with an interactive Mapbox map. Features two-way synchronization, custom layer styling, and automatic geocoding.

## Features

- ✅ Two-way sync between Google Sheets and map
- ✅ Multiple layers (one per sheet tab)
- ✅ Toggle layers on/off
- ✅ Custom styling based on data columns
- ✅ Automatic address geocoding
- ✅ Drag markers to update locations
- ✅ Click markers to view details
- ✅ Real-time updates

## Prerequisites

- Node.js (v18 or higher) ✅ INSTALLED
- VS Code (or any code editor) ✅ INSTALLED
- Google account with Google Sheets
- Mapbox account (free tier)

## Setup Instructions

### Step 1: Project Setup

You already have the project files! Now navigate to the project:

```bash
cd map-sheets-sync
npm install
```

This will install all dependencies (~2-3 minutes).

### Step 2: Get Mapbox API Token (5 minutes)

1. Go to https://account.mapbox.com/
2. Sign up or log in
3. Go to "Access tokens" page
4. Click "Create a token"
5. Give it a name like "Map Sheets Sync"
6. Keep default scopes (all checked)
7. Click "Create token"
8. **Copy the token** (you won't be able to see it again)

### Step 3: Set up Google Sheets API (10 minutes)

This is the most complex part, but we'll go step-by-step:

#### 3a. Enable Google Sheets API

1. Go to https://console.cloud.google.com/
2. Create a new project (top dropdown → "New Project")
   - Name it "Map Sheets Sync"
   - Click "Create"
3. Make sure your new project is selected (check top dropdown)
4. Go to "APIs & Services" → "Library"
5. Search for "Google Sheets API"
6. Click on it and click "Enable"

#### 3b. Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure OAuth consent screen:
   - Choose "External" (unless you have a Google Workspace)
   - App name: "Map Sheets Sync"
   - User support email: your email
   - Developer contact: your email
   - Click "Save and Continue"
   - Scopes: Click "Add or Remove Scopes"
     - Search for "sheets" and select "../auth/spreadsheets"
     - Click "Update" then "Save and Continue"
   - Test users: Add your email
   - Click "Save and Continue"
4. Now create OAuth client:
   - Application type: "Web application"
   - Name: "Map Sheets Sync"
   - Authorized JavaScript origins:
     - http://localhost:3000
   - Authorized redirect URIs:
     - http://localhost:3000
   - Click "Create"
5. **Save your Client ID** - you'll need it

#### 3c. Get Access Token

For development, we'll use the OAuth Playground:

1. Go to https://developers.google.com/oauthplayground/
2. Click the gear icon (⚙️) in top right
3. Check "Use your own OAuth credentials"
4. Enter your OAuth Client ID and Client Secret
5. Close settings
6. In Step 1, find "Google Sheets API v4" in the list
7. Select "https://www.googleapis.com/auth/spreadsheets"
8. Click "Authorize APIs"
9. Sign in with your Google account
10. Click "Allow"
11. In Step 2, click "Exchange authorization code for tokens"
12. **Copy the Access token** (the long string)

**Note:** This token expires after 1 hour. For production, you'd implement proper OAuth flow, but for development this works.

### Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` in VS Code and fill in your tokens:
   ```
   REACT_APP_MAPBOX_TOKEN=pk.eyJ1...your_token_here
   REACT_APP_GOOGLE_ACCESS_TOKEN=ya29...your_token_here
   ```

### Step 5: Configure Your Spreadsheet

1. Get your Google Sheets ID:
   - Open your Google Sheet
   - Look at the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
   - Copy the SHEET_ID_HERE part

2. Copy the config template:
   ```bash
   cp src/config.example.js src/config.local.js
   ```

3. Open `src/config.local.js` and customize:
   - Set your `spreadsheetId`
   - Configure each sheet tab in the `sheets` array
   - Example:

```javascript
export const config = {
  spreadsheetId: '1abcXYZ123...your_sheet_id',
  
  sheets: [
    {
      name: 'Locations',  // Exact tab name in your sheet
      displayName: 'Store Locations',  // Display name in layer control
      addressColumn: 'Address',  // Column name with addresses
      latColumn: null,  // Set to column name if you have lat/lng
      lngColumn: null,
      featureType: 'point',
      style: {
        defaultColor: '#3388ff',
        colorByColumn: 'Status',  // Column to color by
        colorMap: {
          'Open': '#00ff00',
          'Closed': '#ff0000'
        },
        size: 8
      }
    },
    // Add more sheets here...
  ],
  
  map: {
    center: [-86.7833, 36.1627],  // Your preferred center
    zoom: 10
  }
};
```

### Step 6: Run the Application

```bash
npm start
```

The app will open at http://localhost:3000

## Expected Data Format

Your Google Sheets should have:
- First row: Headers (column names)
- Subsequent rows: Data

Example:

| Address | Status | Type | Notes |
|---------|--------|------|-------|
| 123 Main St, Nashville, TN | Open | Store | Main location |
| 456 Elm St, Nashville, TN | Closed | Warehouse | Temp closed |

## How It Works

1. **Loading**: App reads all configured sheets from Google Sheets
2. **Geocoding**: Addresses without lat/lng are geocoded via Mapbox
3. **Rendering**: Markers appear on map with custom colors/styles
4. **Interaction**:
   - Click markers to see details
   - Drag markers to update location
   - Changes sync back to Google Sheets
5. **Layers**: Toggle each sheet on/off in layer control

## Troubleshooting

### "Access token expired"
- Google tokens expire after 1 hour
- Go back to OAuth Playground and get a new token
- Update `.env` file
- Restart the app

### "Spreadsheet not found"
- Check your spreadsheet ID in `config.local.js`
- Make sure the sheet is shared (at least "Anyone with link can view")

### "Sheet name not found"
- Check exact tab name in `config.local.js`
- Tab names are case-sensitive

### Geocoding fails
- Check Mapbox token is valid
- Addresses must be complete (street, city, state)
- Free tier: 100,000 geocodes/month

### Map not loading
- Check Mapbox token in `.env`
- Check browser console for errors
- Make sure `REACT_APP_MAPBOX_TOKEN` has the `pk.` prefix

## Costs

- **Mapbox Free Tier**: 50,000 map loads/month, 100,000 geocoding requests
- **Google Sheets API**: Free up to generous limits
- **Hosting**: Free on Vercel/Netlify or ~$5/month elsewhere

**Total: $0-20/month** (well under your $100 budget!)

## Next Steps

Once you have the basic version working:
- Add more sheets/layers
- Customize styling rules
- Add filtering capabilities
- Implement proper OAuth flow for production
- Deploy to hosting service

## Support

If you run into issues during setup, check:
1. Browser console for error messages
2. Terminal output for server errors
3. That all tokens are correct in `.env`
4. That config matches your sheet structure
