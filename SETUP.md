# Quick Setup Checklist

Follow these steps in order. Each should take 5-10 minutes.

## ☐ Step 1: Install Dependencies
```bash
cd map-sheets-sync
npm install
```
Wait for installation to complete (~2-3 minutes).

## ☐ Step 2: Get Mapbox Token
1. Go to https://account.mapbox.com/
2. Sign up/log in
3. Create a new access token
4. Copy it (starts with `pk.`)

## ☐ Step 3: Set Up Google Sheets API

### 3a. Enable API
1. Go to https://console.cloud.google.com/
2. Create new project: "Map Sheets Sync"
3. APIs & Services → Library
4. Search "Google Sheets API" → Enable

### 3b. Create OAuth Client
1. APIs & Services → Credentials
2. Configure OAuth consent screen (if needed):
   - External user type
   - Add your email as test user
   - Add scope: .../auth/spreadsheets
3. Create OAuth client ID:
   - Type: Web application
   - Name: "Map Sheets Sync"
   - Authorized origins: http://localhost:3000
   - Save Client ID and Secret

### 3c. Get Access Token
1. Go to https://developers.google.com/oauthplayground/
2. Settings → Use your own OAuth credentials
3. Enter your Client ID and Secret
4. Select Google Sheets API scope
5. Authorize → Exchange for tokens
6. Copy Access Token (starts with `ya29.`)

## ☐ Step 4: Configure Environment
1. Copy `.env.example` to `.env`
2. Add your tokens:
   ```
   REACT_APP_MAPBOX_TOKEN=pk.your_token_here
   REACT_APP_GOOGLE_ACCESS_TOKEN=ya29.your_token_here
   ```

## ☐ Step 5: Configure Your Sheet
1. Get your Google Sheets ID from URL
2. Copy `src/config.example.js` to `src/config.local.js`
3. Edit `config.local.js`:
   - Set `spreadsheetId`
   - Configure each tab in `sheets` array
   - Match column names exactly

Example config:
```javascript
{
  name: 'Sheet1',           // Tab name
  displayName: 'Locations', // Display name
  addressColumn: 'Address', // Your address column
  style: {
    defaultColor: '#3388ff',
    size: 8
  }
}
```

## ☐ Step 6: Run the App
```bash
npm start
```

App opens at http://localhost:3000

## Expected Result
✅ Map loads centered on your configured location
✅ Layer controls appear in top-left
✅ Your sheet data appears as markers
✅ Click markers to see details
✅ Drag markers to update locations

## Common Issues

### Token Expired
- Google tokens expire in 1 hour
- Get new token from OAuth Playground
- Update `.env` → restart app

### No Markers Showing
- Check browser console for errors
- Verify addresses are complete
- Check column names match config

### Map Not Loading
- Verify Mapbox token starts with `pk.`
- Check browser console
- Verify token in `.env` file

## What's Next?
Once running:
- Add more sheets/layers
- Customize colors and icons
- Test two-way sync by dragging markers
- Click Refresh to reload from sheets

Total setup time: 30-45 minutes
