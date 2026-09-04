import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Flame, TrendingUp, Map as MapIcon, Crosshair, Loader2, Search, 
  ExternalLink, Navigation, Layers, Sparkles, Filter, Store, IndianRupee,
  Truck, Building2, ShoppingBag, Eye, Phone, Sliders, Radio
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Smooth Map Flying Controller
function MapViewController({ center, zoom = 14 }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
}

// Map Click Listener for Custom Pin-Drop
function MapClickHandler({ onMapClick, enabled }) {
  useMapEvents({
    click(e) {
      if (enabled) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

// Available Real Map Styles (including authentic Google Maps & Live Traffic layers)
const MAP_STYLES = {
  google_roadmap: {
    name: 'Google Road',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps'
  },
  google_traffic: {
    name: 'Google Traffic',
    url: 'https://mt1.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Live Traffic'
  },
  google_hybrid: {
    name: 'Google Satellite',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Satellite'
  },
  google_terrain: {
    name: 'Google Terrain',
    url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Terrain'
  },
  carto_dark: {
    name: 'Dark SaaS',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB & OSM'
  }
};

const POPULAR_CITIES = [
  { name: 'My GPS Location', lat: null, lng: null, isGps: true },
  { name: 'Pune (FC Road)', lat: 18.5204, lng: 73.8567 },
  { name: 'Mumbai (Dadar Market)', lat: 19.0178, lng: 72.8478 },
  { name: 'Delhi (Connaught Place)', lat: 28.6304, lng: 77.2177 },
  { name: 'Bengaluru (Koramangala)', lat: 12.9352, lng: 77.6245 },
  { name: 'Ahmedabad (Manek Chowk)', lat: 23.0225, lng: 72.5714 }
];

const CATEGORIES = [
  { id: 'all', label: '🔥 All Hotspots' },
  { id: 'Dairy', label: '🥛 Dairy & Sweets' },
  { id: 'Rain', label: '🌧️ Rain Gear' },
  { id: 'Staples', label: '🌾 Grains & Staples' },
  { id: 'Snacks', label: '🥤 Quick Snacks' }
];

export default function Heatmap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [centerPosition, setCenterPosition] = useState([18.5204, 73.8567]);
  const [activeStyle, setActiveStyle] = useState('google_roadmap');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [radiusKm, setRadiusKm] = useState(3.0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [activeTab, setActiveTab] = useState('hotspots'); // 'hotspots', 'wholesalers', 'demographics'

  const fetchHeatmapData = async (lat, lng, category = selectedCategory, rKm = radiusKm) => {
    setLoading(true);
    try {
      const authData = JSON.parse(localStorage.getItem('vendor_auth') || sessionStorage.getItem('vendor_auth'));
      const vendorId = authData?.vendor_id || 'test';
      const res = await axios.get(`http://127.0.0.1:8000/api/analytics/heatmap`, {
        params: {
          vendor_id: vendorId,
          lat: lat,
          lng: lng,
          category: category !== 'all' ? category : undefined,
          radius_km: rKm
        }
      });
      setData(res.data);
    } catch (err) {
      console.error("Failed to fetch heatmap data:", err);
    } finally {
      setLoading(false);
    }
  };

  const locateUser = () => {
    setLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCenterPosition([lat, lng]);
          fetchHeatmapData(lat, lng);
          setLocating(false);
        },
        (error) => {
          console.warn("Geolocation not available:", error);
          setLocating(false);
          fetchHeatmapData(centerPosition[0], centerPosition[1]);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setLocating(false);
    }
  };

  useEffect(() => {
    locateUser();
  }, []);

  const handleCitySelect = (city) => {
    if (city.isGps) {
      locateUser();
    } else {
      setCenterPosition([city.lat, city.lng]);
      fetchHeatmapData(city.lat, city.lng);
    }
  };

  const handleCategorySelect = (catId) => {
    setSelectedCategory(catId);
    fetchHeatmapData(centerPosition[0], centerPosition[1], catId, radiusKm);
  };

  const handleRadiusChange = (newRadius) => {
    setRadiusKm(newRadius);
    fetchHeatmapData(centerPosition[0], centerPosition[1], selectedCategory, newRadius);
  };

  const handleMapPinDrop = (lat, lng) => {
    setCenterPosition([lat, lng]);
    setPinDropMode(false);
    fetchHeatmapData(lat, lng);
  };

  const handleSearchLocation = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search`, {
        params: {
          q: searchQuery,
          format: 'json',
          limit: 1,
          countrycodes: 'in'
        }
      });
      if (res.data && res.data.length > 0) {
        const place = res.data[0];
        const newLat = parseFloat(place.lat);
        const newLng = parseFloat(place.lon);
        setCenterPosition([newLat, newLng]);
        fetchHeatmapData(newLat, newLng);
      } else {
        alert("Location not found in India. Try another landmark.");
      }
    } catch (err) {
      alert("Location search service unavailable.");
    } finally {
      setIsSearching(false);
    }
  };

  const openGoogleMapsQuery = (lat, lng) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
  };

  const openGoogleMapsDirections = (lat, lng) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  };

  const openStreetView = (lat, lng) => {
    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      
      {/* Top Banner with Google Maps Sync Controls */}
      <div className="bg-brand-surface rounded-3xl p-5 md:p-6 border border-brand-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-2xl bg-brand-teal/10 text-brand-teal border border-brand-teal/20">
              <MapIcon size={24} />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold text-brand-ink font-poppins">
                Google Maps B2B Heatmap & Supply Radar
              </h2>
              <p className="text-xs md:text-sm text-brand-muted mt-0.5">
                Hyperlocal consumer demand, live traffic congestion, and FMCG wholesale mandis
              </p>
            </div>
          </div>
        </div>

        {/* Global Map Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setPinDropMode(!pinDropMode)}
            className={`text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center space-x-1.5 transition-all shadow-sm ${
              pinDropMode 
                ? 'bg-brand-amber text-brand-ink font-black border-2 border-brand-amber animate-pulse' 
                : 'bg-brand-bg hover:bg-brand-teal/10 border border-brand-border text-brand-ink'
            }`}
            title="Click anywhere on the map to relocate store"
          >
            <Crosshair size={14} />
            <span>{pinDropMode ? 'Click on Map to Place Store' : 'Relocate Store Pin'}</span>
          </button>

          <button 
            onClick={() => openGoogleMapsQuery(centerPosition[0], centerPosition[1])}
            className="bg-brand-bg hover:bg-brand-teal/10 border border-brand-border hover:border-brand-teal/30 text-brand-ink hover:text-brand-teal text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center space-x-1.5 transition-all shadow-sm"
          >
            <ExternalLink size={14} />
            <span>Open in Google Maps</span>
          </button>
          
          <button 
            onClick={locateUser} 
            disabled={locating}
            className="bg-brand-teal text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-md hover:bg-brand-teal-dark active:scale-95 transition-all"
          >
            {locating ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
            <span>{locating ? 'Locating...' : 'Locate Me'}</span>
          </button>
        </div>
      </div>

      {/* Search & Location Bar */}
      <div className="space-y-2.5">
        <form onSubmit={handleSearchLocation} className="relative">
          <Search className="absolute left-3.5 top-3 text-brand-muted" size={18} />
          <input 
            type="text" 
            placeholder="Search any Indian locality or landmark (e.g. Bandra West Mumbai, Connaught Place Delhi, Koramangala Bengaluru, Dadar Market)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded-2xl pl-10 pr-28 py-3 text-sm text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-teal shadow-sm transition-all"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="absolute right-2 top-2 bg-brand-teal text-white text-xs font-bold px-4 py-1.5 rounded-xl hover:bg-brand-teal-dark disabled:opacity-50 flex items-center space-x-1 shadow-sm"
          >
            {isSearching ? <Loader2 size={13} className="animate-spin" /> : 'Search'}
          </button>
        </form>

        {/* Quick City Presets */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-brand-muted font-bold uppercase text-[10px] tracking-wider shrink-0 mr-1">
            Major Metros:
          </span>
          {POPULAR_CITIES.map((city, idx) => (
            <button
              key={idx}
              onClick={() => handleCitySelect(city)}
              className="px-3 py-1.5 rounded-xl font-semibold bg-brand-surface border border-brand-border hover:border-brand-teal text-brand-ink shrink-0 transition-all active:scale-95 shadow-sm"
            >
              {city.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Interactive Map Card */}
      <div className="bg-brand-surface border border-brand-border rounded-3xl p-4 md:p-5 shadow-sm relative">
        
        {/* Map Controls: Categories & Google Layers */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3.5 pb-3 border-b border-brand-border/60">
          
          {/* Category Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto text-xs pb-1 lg:pb-0 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-brand-teal text-white shadow-sm'
                    : 'bg-brand-bg text-brand-muted hover:text-brand-ink border border-brand-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Catchment Radius & Map Layer Selector */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Catchment Radius Selector */}
            <div className="flex items-center space-x-1.5 bg-brand-bg px-2.5 py-1 rounded-xl border border-brand-border text-xs">
              <Radio size={14} className="text-brand-teal" />
              <span className="font-bold text-brand-muted text-[11px]">Radius:</span>
              {[1, 3, 5, 10].map((r) => (
                <button
                  key={r}
                  onClick={() => handleRadiusChange(r)}
                  className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-all ${
                    radiusKm === r 
                      ? 'bg-brand-teal text-white shadow-sm' 
                      : 'text-brand-muted hover:text-brand-ink'
                  }`}
                >
                  {r}km
                </button>
              ))}
            </div>

            {/* Google Maps Layer Selector */}
            <div className="flex items-center space-x-1 bg-brand-bg p-1 rounded-xl border border-brand-border text-xs">
              <Layers size={14} className="text-brand-muted ml-1 mr-0.5" />
              {Object.keys(MAP_STYLES).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveStyle(key)}
                  className={`px-2 py-1 rounded-lg font-bold transition-all text-[11px] ${
                    activeStyle === key
                      ? 'bg-brand-surface text-brand-teal shadow-sm border border-brand-border'
                      : 'text-brand-muted hover:text-brand-ink'
                  }`}
                >
                  {MAP_STYLES[key].name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pin Drop Notification Banner */}
        {pinDropMode && (
          <div className="mb-3 bg-brand-amber/15 border border-brand-amber/30 text-brand-ink p-3 rounded-2xl text-xs font-bold flex items-center justify-between animate-bounce">
            <span className="flex items-center">
              <Crosshair size={16} className="mr-2 text-brand-amber" />
              Click anywhere on the map to set your store's anchor position!
            </span>
            <button 
              onClick={() => setPinDropMode(false)}
              className="text-brand-muted hover:text-brand-ink underline"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Leaflet Map with Google Maps & Live Traffic Layer */}
        <div className="w-full h-[400px] md:h-[500px] rounded-2xl border border-brand-border overflow-hidden relative z-0 shadow-inner">
          <MapContainer 
            center={centerPosition} 
            zoom={14} 
            scrollWheelZoom={true} 
            style={{ height: '100%', width: '100%' }}
          >
            <MapViewController center={centerPosition} zoom={14} />
            <MapClickHandler onMapClick={handleMapPinDrop} enabled={pinDropMode} />
            
            {/* Active Tile Layer (Google Road / Live Traffic / Satellite / Terrain) */}
            <TileLayer
              key={activeStyle}
              attribution={MAP_STYLES[activeStyle].attribution}
              url={MAP_STYLES[activeStyle].url}
              maxZoom={20}
              subdomains={['mt0', 'mt1', 'mt2', 'mt3', 'a', 'b', 'c', 'd']}
            />
            
            {/* Interactive Influence / Delivery Catchment Radius Ring */}
            <Circle
              center={centerPosition}
              radius={radiusKm * 1000}
              pathOptions={{ 
                color: '#0F7A6B', 
                fillColor: '#0F7A6B', 
                fillOpacity: 0.08, 
                weight: 2, 
                dashArray: '6, 8' 
              }}
            />

            {/* Store Location Center Marker */}
            <CircleMarker
              center={centerPosition}
              pathOptions={{ 
                color: '#2563EB', 
                fillColor: '#3B82F6', 
                fillOpacity: 1, 
                weight: 4 
              }}
              radius={9}
            >
              <Popup>
                <div className="p-1 font-poppins">
                  <div className="flex items-center space-x-1.5 text-blue-600 font-bold text-sm">
                    <Store size={16} />
                    <span>Sharma General Store</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Anchor point for demand radius & logistics</p>
                  <p className="text-[11px] font-bold text-gray-800 mt-0.5">Catchment Radius: {radiusKm} km</p>
                  
                  <div className="flex space-x-1.5 mt-2.5">
                    <button 
                      onClick={() => openGoogleMapsDirections(centerPosition[0], centerPosition[1])}
                      className="flex-1 text-[11px] bg-blue-600 text-white py-1 px-2 rounded-md font-semibold flex items-center justify-center space-x-1"
                    >
                      <Navigation size={12} />
                      <span>Directions</span>
                    </button>
                    <button 
                      onClick={() => openStreetView(centerPosition[0], centerPosition[1])}
                      className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-800 py-1 px-2 rounded-md font-semibold flex items-center space-x-1"
                    >
                      <Eye size={12} />
                      <span>Street View</span>
                    </button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>

            {/* Nearby Wholesale FMCG Mandis & Depots (Purple Markers) */}
            {data?.wholesalers?.map((w) => (
              <CircleMarker
                key={w.id}
                center={[w.lat, w.lng]}
                pathOptions={{ 
                  color: '#7C3AED', 
                  fillColor: '#8B5CF6', 
                  fillOpacity: 0.9, 
                  weight: 3 
                }}
                radius={7}
              >
                <Popup>
                  <div className="p-1 font-poppins max-w-xs">
                    <div className="flex items-center space-x-1.5 text-purple-700 font-bold text-sm">
                      <Truck size={16} />
                      <span>{w.name}</span>
                    </div>
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold mt-1 inline-block">
                      {w.type}
                    </span>
                    <div className="text-xs text-gray-700 mt-2 space-y-1">
                      <p><span className="font-semibold">Specialty:</span> {w.specialty}</p>
                      <p><span className="font-semibold">Discount:</span> <strong className="text-green-700">{w.discount_rate}</strong></p>
                      <p><span className="font-semibold">Distance:</span> {w.distance_km} km away</p>
                      <p><span className="font-semibold">Hours:</span> {w.open_hours}</p>
                    </div>

                    <div className="flex space-x-1.5 mt-3 pt-2 border-t border-gray-200">
                      <a 
                        href={`tel:${w.contact}`}
                        className="flex-1 text-[11px] bg-purple-600 text-white py-1 px-2 rounded-md font-semibold flex items-center justify-center space-x-1"
                      >
                        <Phone size={11} />
                        <span>Call Mandi</span>
                      </a>
                      <button 
                        onClick={() => openGoogleMapsDirections(w.lat, w.lng)}
                        className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-800 py-1 px-2 rounded-md font-semibold flex items-center space-x-1"
                      >
                        <Navigation size={11} />
                        <span>Route</span>
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}

            {/* Consumer Demand Hotspots (Red / Amber / Teal Pulse Radiuses) */}
            {data?.zones?.map(zone => {
              const isHigh = zone.intensity >= 85;
              const isMedium = zone.intensity >= 65 && zone.intensity < 85;
              
              let color = '#0F7A6B'; // Teal (Low)
              if (isHigh) color = '#E85D4C'; // Red (High)
              else if (isMedium) color = '#D98A0F'; // Amber (Medium)

              return (
                <CircleMarker
                  key={zone.id}
                  center={[zone.lat, zone.lng]}
                  pathOptions={{ 
                    color: color, 
                    fillColor: color, 
                    fillOpacity: isHigh ? 0.65 : 0.45, 
                    weight: isHigh ? 3 : 2 
                  }}
                  radius={isHigh ? 38 : isMedium ? 26 : 16}
                >
                  <Popup>
                    <div className="p-1 max-w-xs font-poppins">
                      <div className="flex items-center justify-between">
                        <strong className="text-sm font-bold text-gray-900">{zone.name}</strong>
                        <span 
                          className="text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white" 
                          style={{ backgroundColor: color }}
                        >
                          {zone.intensity}% Demand
                        </span>
                      </div>

                      <div className="text-xs text-gray-700 mt-2 space-y-1">
                        <p><span className="font-semibold text-gray-900">Trending:</span> {zone.top_demand}</p>
                        <p><span className="font-semibold text-gray-900">Driver:</span> {zone.demand_driver}</p>
                        <p><span className="font-semibold text-gray-900">Crowd:</span> {zone.crowd_type}</p>
                        <p className="font-bold text-teal-700 mt-1">Est. Revenue: ₹{zone.weekly_market_size_inr?.toLocaleString('en-IN')}/wk</p>
                      </div>

                      {/* Google Maps Actions */}
                      <div className="flex items-center space-x-2 mt-3 pt-2 border-t border-gray-200">
                        <button 
                          onClick={() => openGoogleMapsDirections(zone.lat, zone.lng)}
                          className="flex-1 text-[11px] bg-teal-700 text-white py-1 px-2 rounded-md font-semibold flex items-center justify-center space-x-1"
                        >
                          <Navigation size={12} />
                          <span>Navigate</span>
                        </button>
                        <button 
                          onClick={() => openStreetView(zone.lat, zone.lng)}
                          className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-800 py-1 px-2 rounded-md font-semibold flex items-center space-x-1"
                          title="View 360 Street View"
                        >
                          <Eye size={12} />
                          <span>Street View</span>
                        </button>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-xs text-brand-muted px-2 border-t border-brand-border/60 pt-3 mt-3 gap-2">
          <span className="flex items-center">
            <div className="w-3.5 h-3.5 rounded-full bg-brand-danger opacity-75 border-2 border-brand-danger mr-1.5 animate-pulse"></div> 
            <strong>High Demand (&gt;85%)</strong>
          </span>
          <span className="flex items-center">
            <div className="w-3.5 h-3.5 rounded-full bg-brand-amber opacity-75 border-2 border-brand-amber mr-1.5"></div> 
            <strong>Medium (&gt;65%)</strong>
          </span>
          <span className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-600 border-2 border-purple-800 mr-1.5"></div> 
            <strong className="text-purple-700">Wholesale FMCG Mandis</strong>
          </span>
          <span className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-600 mr-1.5"></div> 
            <strong>Your Store</strong>
          </span>
        </div>
      </div>

      {/* Navigation Tabs for Deep Intelligence */}
      <div className="flex items-center space-x-2 border-b border-brand-border pb-2">
        <button
          onClick={() => setActiveTab('hotspots')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'hotspots' 
              ? 'bg-brand-teal text-white shadow-sm' 
              : 'text-brand-muted hover:text-brand-ink bg-brand-surface'
          }`}
        >
          Active Hotspots ({data?.zones?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('wholesalers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
            activeTab === 'wholesalers' 
              ? 'bg-purple-600 text-white shadow-sm' 
              : 'text-brand-muted hover:text-brand-ink bg-brand-surface'
          }`}
        >
          <Truck size={14} />
          <span>Wholesale Mandis ({data?.wholesalers?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('demographics')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
            activeTab === 'demographics' 
              ? 'bg-blue-600 text-white shadow-sm' 
              : 'text-brand-muted hover:text-brand-ink bg-brand-surface'
          }`}
        >
          <Building2 size={14} />
          <span>Catchment Demographics</span>
        </button>
      </div>

      {/* TAB 1: HOTSPOTS */}
      {activeTab === 'hotspots' && (
        <div className="grid md:grid-cols-2 gap-3.5">
          {data?.zones?.map(zone => {
            const isHigh = zone.intensity >= 85;
            const isMedium = zone.intensity >= 65 && zone.intensity < 85;
            let badgeBg = isHigh ? 'bg-brand-danger/10 text-brand-danger border-brand-danger/25' : isMedium ? 'bg-brand-amber/10 text-brand-amber border-brand-amber/25' : 'bg-brand-teal/10 text-brand-teal border-brand-teal/25';

            return (
              <div 
                key={zone.id} 
                className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-brand-ink text-sm md:text-base">{zone.name}</h4>
                      <span className="text-[11px] text-brand-muted">{zone.category}</span>
                    </div>

                    <span className={`text-xs font-black px-2.5 py-1 rounded-xl border font-poppins ${badgeBg}`}>
                      {zone.intensity}% Intensity
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-1 text-xs">
                    <p className="text-brand-ink flex items-center">
                      <Flame size={14} className="text-brand-danger mr-1.5 shrink-0" />
                      <span><strong>Top Demand:</strong> {zone.top_demand}</span>
                    </p>
                    <p className="text-brand-muted text-[11px] pl-5">
                      {zone.demand_driver} ({zone.crowd_type})
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-brand-border/60 flex items-center justify-between">
                  <div className="flex items-center text-xs font-bold text-brand-teal font-poppins">
                    <IndianRupee size={13} className="mr-0.5" />
                    <span>₹{zone.weekly_market_size_inr?.toLocaleString('en-IN')}/wk Potential</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCenterPosition([zone.lat, zone.lng])}
                      className="px-2.5 py-1.5 bg-brand-bg hover:bg-brand-teal/10 text-brand-ink hover:text-brand-teal border border-brand-border rounded-xl text-xs font-semibold transition-all"
                    >
                      Focus
                    </button>
                    
                    <button
                      onClick={() => openGoogleMapsDirections(zone.lat, zone.lng)}
                      className="px-3 py-1.5 bg-brand-teal text-white hover:bg-brand-teal-dark rounded-xl text-xs font-bold flex items-center space-x-1 shadow-sm transition-all"
                    >
                      <Navigation size={12} />
                      <span>Navigate</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: WHOLESALE MANDIS & SUPPLIERS */}
      {activeTab === 'wholesalers' && (
        <div className="grid md:grid-cols-3 gap-3.5">
          {data?.wholesalers?.map((w) => (
            <div key={w.id} className="bg-brand-surface border border-purple-500/30 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full uppercase">
                    {w.type}
                  </span>
                  <span className="text-xs font-bold text-purple-700">{w.distance_km} km away</span>
                </div>
                
                <h4 className="font-bold text-brand-ink text-sm md:text-base">{w.name}</h4>
                <p className="text-xs text-brand-muted mt-1">{w.specialty}</p>

                <div className="mt-3 bg-brand-bg p-2.5 rounded-xl border border-brand-border text-xs space-y-1">
                  <p className="text-green-700 font-bold">Wholesale Rate: {w.discount_rate}</p>
                  <p className="text-brand-muted text-[11px]">Timings: {w.open_hours}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-brand-border/60 flex items-center space-x-2">
                <a
                  href={`tel:${w.contact}`}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm"
                >
                  <Phone size={13} />
                  <span>Call {w.contact}</span>
                </a>
                <button
                  onClick={() => openGoogleMapsDirections(w.lat, w.lng)}
                  className="p-2 bg-brand-bg hover:bg-brand-surface border border-brand-border text-brand-ink rounded-xl"
                  title="Route in Google Maps"
                >
                  <Navigation size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: DEMOGRAPHICS & MARKET POTENTIAL */}
      {activeTab === 'demographics' && (
        <div className="bg-brand-surface rounded-3xl p-6 border border-brand-border shadow-sm">
          <h3 className="font-bold text-lg text-brand-ink font-poppins mb-1">
            Catchment Area Demographics ({radiusKm} km Radius)
          </h3>
          <p className="text-xs text-brand-muted mb-6">
            Estimated consumer market potential and competitor density around your store
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-brand-bg p-4 rounded-2xl border border-brand-border">
              <p className="text-xs text-brand-muted uppercase font-bold tracking-wider">Estimated Households</p>
              <p className="text-2xl font-black text-brand-teal mt-1 font-poppins">
                {data?.demographics?.estimated_households?.toLocaleString('en-IN')}
              </p>
              <span className="text-[10px] text-brand-muted">Residential catchment</span>
            </div>

            <div className="bg-brand-bg p-4 rounded-2xl border border-brand-border">
              <p className="text-xs text-brand-muted uppercase font-bold tracking-wider">Catchment Population</p>
              <p className="text-2xl font-black text-brand-ink mt-1 font-poppins">
                {data?.demographics?.estimated_population?.toLocaleString('en-IN')}
              </p>
              <span className="text-[10px] text-brand-muted">Estimated consumer base</span>
            </div>

            <div className="bg-brand-bg p-4 rounded-2xl border border-brand-border">
              <p className="text-xs text-brand-muted uppercase font-bold tracking-wider">Monthly Spend Potential</p>
              <p className="text-2xl font-black text-brand-danger mt-1 font-poppins">
                ₹{data?.demographics?.monthly_market_potential_crores} Cr
              </p>
              <span className="text-[10px] text-brand-muted">Kirana grocery spend/mo</span>
            </div>

            <div className="bg-brand-bg p-4 rounded-2xl border border-brand-border">
              <p className="text-xs text-brand-muted uppercase font-bold tracking-wider">Nearby FMCG Mandis</p>
              <p className="text-2xl font-black text-purple-700 mt-1 font-poppins">
                {data?.demographics?.wholesaler_count} Mandis
              </p>
              <span className="text-[10px] text-brand-muted">Direct wholesale access</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
