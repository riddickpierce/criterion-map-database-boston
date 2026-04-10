// Mapbox Geocoding Service
class GeocodingService {
  constructor() {
    this.accessToken = null;
    this.cache = new Map(); // Cache geocoded results
  }

  initialize(accessToken) {
    this.accessToken = accessToken;
  }

  // Geocode an address to lat/lng
  async geocode(address) {
    // Check cache first
    if (this.cache.has(address)) {
      return this.cache.get(address);
    }

    if (!address || address.trim() === '') {
      return null;
    }

    try {
      const encodedAddress = encodeURIComponent(address);
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${this.accessToken}&limit=1`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const result = { lat, lng };
        
        // Cache the result
        this.cache.set(address, result);
        
        return result;
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  // Batch geocode multiple addresses
  async batchGeocode(addresses, onProgress) {
    const results = [];
    const total = addresses.length;

    for (let i = 0; i < addresses.length; i++) {
      const result = await this.geocode(addresses[i]);
      results.push(result);

      if (onProgress) {
        onProgress((i + 1) / total);
      }

      // Rate limiting: wait 100ms between requests to stay within Mapbox limits
      if (i < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  // Reverse geocode: lat/lng to address
  async reverseGeocode(lat, lng) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${this.accessToken}&limit=1`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        return data.features[0].place_name;
      }

      return null;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }

  // Clear the cache
  clearCache() {
    this.cache.clear();
  }
}

const geocodingService = new GeocodingService();
export default geocodingService;
