// Browser-based Google Sheets API service
class GoogleSheetsService {
  constructor() {
    this.mode = null; // 'oauth' | 'apikey'
    this.apiKey = null;
    this.accessToken = null;
    this.clientId = null;
    this.clientSecret = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0; // epoch ms
    this.headersCache = {}; // keyed by `${spreadsheetId}/${sheetName}`
    this.formulaColumnsCache = {}; // Set of column names that contain formulas, keyed by `${spreadsheetId}/${sheetName}`
  }

  get readOnly() {
    return this.mode === 'apikey';
  }

  // Initialize in OAuth mode (local, read/write)
  initializeOAuth(clientId, clientSecret, refreshToken) {
    this.mode = 'oauth';
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.tokenExpiresAt = 0; // force refresh on first request
  }

  // Initialize in API key mode (deployed, read-only)
  initializeApiKey(apiKey) {
    this.mode = 'apikey';
    this.apiKey = apiKey;
  }

  // Legacy initializer (static access token) — kept for fallback
  initialize(apiKey, accessToken) {
    this.mode = 'oauth';
    this.apiKey = apiKey;
    this.accessToken = accessToken;
    this.tokenExpiresAt = Infinity; // no refresh available
  }

  // Fetch a fresh access token using the refresh token
  async refreshAccessToken() {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // subtract 60s buffer so we refresh before actual expiry
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    console.log('Google access token refreshed');
  }

  async ensureValidToken() {
    if (this.mode === 'oauth' && this.refreshToken && Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }
  }

  // Helper to make authenticated requests
  async makeRequest(url, options = {}) {
    if (this.readOnly && options.method && options.method !== 'GET') {
      throw new Error('Write operations are not available in read-only mode');
    }

    await this.ensureValidToken();

    let requestUrl = url;
    let headers = { 'Content-Type': 'application/json', ...options.headers };

    if (this.mode === 'apikey') {
      const separator = url.includes('?') ? '&' : '?';
      requestUrl = `${url}${separator}key=${this.apiKey}`;
    } else {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(requestUrl, { ...options, headers });

    // On 401, try refreshing once and retry (OAuth mode only)
    if (response.status === 401 && this.mode === 'oauth' && this.refreshToken) {
      await this.refreshAccessToken();
      headers['Authorization'] = `Bearer ${this.accessToken}`;
      const retryResponse = await fetch(requestUrl, { ...options, headers });
      if (!retryResponse.ok) {
        const error = await retryResponse.json();
        throw new Error(error.error?.message || 'API request failed');
      }
      return retryResponse.json();
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    return response.json();
  }

  // Convert 0-based column index to A1 letter notation (0 → A, 25 → Z, 26 → AA, etc.)
  columnIndexToLetter(index) {
    let letter = '';
    let i = index + 1;
    while (i > 0) {
      const rem = (i - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      i = Math.floor((i - 1) / 26);
    }
    return letter;
  }

  // Read data from a specific sheet
  async readSheet(spreadsheetId, sheetName) {
    try {
      const range = encodeURIComponent(`${sheetName}!A:ZZ`);
      const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
      const formulaUrl = `${valuesUrl}?valueRenderOption=FORMULA`;

      // Fetch formatted values and formula data in parallel
      const [data, formulaData] = await Promise.all([
        this.makeRequest(valuesUrl),
        this.makeRequest(formulaUrl).catch(() => null) // non-fatal if formula fetch fails
      ]);

      const rows = data.values;

      if (!rows || rows.length === 0) {
        return [];
      }

      // Convert to array of objects with headers as keys
      const headers = rows[0];
      this.headersCache[`${spreadsheetId}/${sheetName}`] = headers; // cache for updates

      // Detect which columns contain formulas
      const formulaCols = new Set();
      if (formulaData && formulaData.values && formulaData.values.length > 1) {
        const formulaRows = formulaData.values;
        for (let rowIdx = 1; rowIdx < formulaRows.length; rowIdx++) {
          const row = formulaRows[rowIdx];
          for (let colIdx = 0; colIdx < headers.length; colIdx++) {
            const cell = row[colIdx];
            if (cell && typeof cell === 'string' && cell.startsWith('=')) {
              formulaCols.add(headers[colIdx]);
            }
          }
        }
      }
      this.formulaColumnsCache[`${spreadsheetId}/${sheetName}`] = formulaCols;
      if (formulaCols.size > 0) {
        console.log(`Formula columns detected in "${sheetName}":`, [...formulaCols]);
      }

      const dataRows = rows.slice(1).map((row, rowIndex) => {
        const obj = { _rowIndex: rowIndex }; // Store row index for updates
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });

      return dataRows;
    } catch (error) {
      console.error(`Error reading sheet ${sheetName}:`, error);
      throw error;
    }
  }

  // Helper: get headers from cache, or fetch and cache them
  async getHeaders(spreadsheetId, sheetName) {
    const cacheKey = `${spreadsheetId}/${sheetName}`;
    if (this.headersCache[cacheKey]) {
      return this.headersCache[cacheKey];
    }
    const headerRange = encodeURIComponent(`${sheetName}!1:1`);
    const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${headerRange}`;
    const headerData = await this.makeRequest(headerUrl);
    this.headersCache[cacheKey] = headerData.values[0];
    return this.headersCache[cacheKey];
  }

  // Update a specific row, skipping any columns that contain formulas
  async updateRow(spreadsheetId, sheetName, rowIndex, data) {
    try {
      const headers = await this.getHeaders(spreadsheetId, sheetName);
      const formulaCols = this.formulaColumnsCache[`${spreadsheetId}/${sheetName}`] || new Set();
      const actualRow = rowIndex + 2; // 1-based + header row

      // Build individual cell updates for non-formula columns only
      const cellUpdates = [];
      headers.forEach((header, colIndex) => {
        if (formulaCols.has(header)) return; // leave formula columns untouched
        if (data[header] === undefined) return;
        const colLetter = this.columnIndexToLetter(colIndex);
        cellUpdates.push({
          range: `${sheetName}!${colLetter}${actualRow}`,
          values: [[data[header]]]
        });
      });

      if (cellUpdates.length === 0) return true;

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
      await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: cellUpdates
        })
      });

      return true;
    } catch (error) {
      console.error('Error updating row:', error);
      throw error;
    }
  }

  // Append a new row to a sheet
  async appendRow(spreadsheetId, sheetName, data) {
    try {
      const headers = await this.getHeaders(spreadsheetId, sheetName);

      // Convert data object to array matching header order
      const rowValues = headers.map(header => data[header] || '');

      const range = encodeURIComponent(`${sheetName}!A:A`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`;

      await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify({
          values: [rowValues]
        })
      });

      return true;
    } catch (error) {
      console.error('Error appending row:', error);
      throw error;
    }
  }

  // Delete a specific data row (rowIndex is 0-based, excluding header)
  async deleteRow(spreadsheetId, sheetName, rowIndex) {
    try {
      // Fetch the numeric sheetId from spreadsheet metadata
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
      const meta = await this.makeRequest(metaUrl);
      const sheet = meta.sheets.find(
        s => s.properties.title === sheetName
      );
      if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
      const sheetId = sheet.properties.sheetId;

      // startIndex = rowIndex + 1 (skip header); endIndex = startIndex + 1
      const startIndex = rowIndex + 1;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

      await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex,
                endIndex: startIndex + 1
              }
            }
          }]
        })
      });

      return true;
    } catch (error) {
      console.error('Error deleting row:', error);
      throw error;
    }
  }

  // Batch update multiple cells (for geocoded coordinates)
  async batchUpdateCells(spreadsheetId, sheetName, updates) {
    try {
      const data = updates.map(update => ({
        range: `${sheetName}!${update.range}`,
        values: [[update.value]]
      }));

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;

      await this.makeRequest(url, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data
        })
      });

      return true;
    } catch (error) {
      console.error('Error batch updating cells:', error);
      throw error;
    }
  }
}

const googleSheetsService = new GoogleSheetsService();
export default googleSheetsService;
