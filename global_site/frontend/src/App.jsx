import React, { useMemo, useState, useEffect } from 'react'
import axios from 'axios'
import MapView from './components/Map'
import SitePanel from './components/SitePanel'
import LayerToggles from './components/LayerToggles'
import MapControls from './components/MapControls'

const API = import.meta.env.VITE_API_URL || ''

export default function App() {
  const [nodes, setNodes] = useState([])
  const [selectedSite, setSelectedSite] = useState(null)
  const [liveData, setLiveData] = useState(null)
  const [analyticsData, setAnalyticsData] = useState(null)
  const [scorecardData, setScorecardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [gasPipelineOpacity, setGasPipelineOpacity] = useState(0.35)
  const [heatmapMetric, setHeatmapMetric] = useState('avg_lmp')
  const [colorBy, setColorBy] = useState('lmp')  // 'lmp' or 'spread' - controls dot colors
  const [search, setSearch] = useState('')
  const [timeWindow, setTimeWindow] = useState('90d')
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' })
  const [filters, setFilters] = useState({
    nodeType: 'all',
    spread: 'all',
  })
  const [layers, setLayers] = useState({
    settlementPoints: true,
    gasPipelines: true,
    heatmap: false,
    countyBoundaries: false,
    voronoi: false,
    windFarms: false,
    solarFarms: false,
  })

  useEffect(() => {
    axios.get(`${API}/api/heatmap`)
      .then((res) => {
        setNodes(res.data.nodes)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load heatmap data:', err)
        setLoading(false)
      })
  }, [])

  // Helper to get window params for API calls
  const getWindowParams = () => {
    if (timeWindow === 'custom') {
      return{ window: 'custom', start_date: customDateRange.start, end_date: customDateRange.end }
    }
    return{ window: timeWindow }
  }

  const handleNodeClick = async (nodeId) => {
    try {
      const windowParams = getWindowParams()
      
      // Use new consolidated location economics endpoint
      // First get node coordinates
      const node = nodes.find(n => n.id === nodeId)
      if (!node) return
      
      const [economics, detail, analytics, scorecard] = await Promise.all([
        axios.get(`${API}/api/location/economics`, {
          params: { lat: node.lat, lng: node.lng }
        }),
        axios.get(`${API}/api/site/${nodeId}`, { params: windowParams }),
        axios.get(`${API}/api/site/${nodeId}/analytics`, { params: windowParams }),
        axios.get(`${API}/api/site/${nodeId}/scorecard`, { params: windowParams }),
      ])
      
      setSelectedSite({
        ...detail.data,
        nodeInfo: economics.data.nearest_node,
        distanceMiles: 0,
        accuracyFlag: false,
      })
      setLiveData(economics.data.live)
      setAnalyticsData(analytics.data)
      setScorecardData(scorecard.data)
    } catch (err) {
      console.error('Failed to load site detail:', err)
    }
  }

  const handleMapClick = async (lat, lng) => {
    try {
      const windowParams = getWindowParams()
      
      // Use new consolidated location economics endpoint
      const economics = await axios.get(`${API}/api/location/economics`, {
        params: { lat, lng }
      })
      
      const nodeId = economics.data.nearest_node.id
      
      const [detail, analytics, scorecard] = await Promise.all([
        axios.get(`${API}/api/site/${nodeId}`, { params: windowParams }),
        axios.get(`${API}/api/site/${nodeId}/analytics`, { params: windowParams }),
        axios.get(`${API}/api/site/${nodeId}/scorecard`, { params: windowParams }),
      ])
      
      setSelectedSite({
        ...detail.data,
        customClick: true,
        clickedLat: lat,
        clickedLng: lng,
        nodeInfo: economics.data.nearest_node,
        distanceMiles: economics.data.distance_miles,
        accuracyFlag: economics.data.accuracy_flag,
      })
      setLiveData(economics.data.live)
      setAnalyticsData(analytics.data)
      setScorecardData(scorecard.data)
    } catch (err) {
      console.error('Failed to find nearest node:', err)
    }
  }

  const handleRefresh = async () => {
    if (!selectedSite?.node?.id) return
    
    setRefreshing(true)
    try {
      const nodeId = selectedSite.node.id || selectedSite.nodeInfo?.id
      const response = await axios.post(`${API}/api/site/${nodeId}/refresh`)
      setLiveData(response.data)
      setLastRefresh(response.data.timestamp)
    } catch (err) {
      console.error('Failed to refresh live data:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const handleTimeWindowChange = async (newWindow) => {
    setTimeWindow(newWindow)
    
    // If a site is selected, reload data with new window
    if (selectedSite?.node?.id || selectedSite?.nodeInfo?.id) {
      const nodeId = selectedSite.node?.id || selectedSite.nodeInfo?.id
      const windowParams = newWindow === 'custom' 
        ? { window: 'custom', start_date: customDateRange.start, end_date: customDateRange.end }
        : { window: newWindow }
      
      try {
        const [detail, analytics, scorecard] = await Promise.all([
          axios.get(`${API}/api/site/${nodeId}`, { params: windowParams }),
          axios.get(`${API}/api/site/${nodeId}/analytics`, { params: windowParams }),
          axios.get(`${API}/api/site/${nodeId}/scorecard`, { params: windowParams }),
        ])
        
        setSelectedSite(prev => ({ ...prev, ...detail.data }))
        setAnalyticsData(analytics.data)
        setScorecardData(scorecard.data)
      } catch (err) {
        console.error('Failed to reload data with new window:', err)
      }
    }
  }

  const handleClosePanel = () => {
    setSelectedSite(null)
    setLiveData(null)
    setAnalyticsData(null)
    setScorecardData(null)
  }

  // Filter nodes based on search and filters
  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch = 
          node.name?.toLowerCase().includes(searchLower) ||
          node.id?.toLowerCase().includes(searchLower) ||
          node.zone?.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }
      
      // Node type filter
      if (filters.nodeType !== 'all' && node.node_type !== filters.nodeType) {
        return false
      }
      
      // Spread filter
      if (filters.spread !== 'all') {
        const spread = node.avg_spread
        if (filters.spread === 'positive' && spread <= 0) return false
        if (filters.spread === '8' && spread < 8) return false
        if (filters.spread === '15' && spread < 15) return false
      }
      
      return true
    })
  }, [nodes, search, filters])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d1117' }}>
      <header style={styles.header}>
        <div style={styles.headerTitle}>WEST TEXAS ENERGY HEATMAP</div>
        <div style={styles.headerSub}>
          {loading ? 'Loading...' : `${nodes.length} nodes · ERCOT West Texas`}
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={styles.mapShell}>
          <div style={styles.mapAura} />
          {loading && (
            <div style={styles.loadingOverlay}>
              Loading heatmap data...
            </div>
          )}

          <MapControls
            search={search}
            filters={filters}
            timeWindow={timeWindow}
            customDateRange={customDateRange}
            onSearchChange={setSearch}
            onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
            onTimeWindowChange={handleTimeWindowChange}
            onCustomDateRangeChange={setCustomDateRange}
            resultCount={filteredNodes.length}
            totalCount={nodes.length}
          />

          <LayerToggles
            layers={layers}
            onChange={setLayers}
            gasPipelineOpacity={gasPipelineOpacity}
            onGasOpacityChange={setGasPipelineOpacity}
            heatmapMetric={heatmapMetric}
            onHeatmapMetricChange={setHeatmapMetric}
            colorBy={colorBy}
            onColorByChange={setColorBy}
          />

          <MapView
            apiBase={API}
            nodes={filteredNodes}
            layers={layers}
            gasPipelineOpacity={gasPipelineOpacity}
            heatmapMetric={heatmapMetric}
            colorBy={colorBy}
            selectedSite={selectedSite}
            onNodeClick={handleNodeClick}
            onMapClick={handleMapClick}
          />
        </div>

        {selectedSite && (
          <SitePanel
            site={selectedSite}
            live={liveData}
            onClose={handleClosePanel}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            analytics={analyticsData}
            scorecard={scorecardData}
          />
        )}
      </div>

      <footer style={styles.legend}>
        <span style={styles.legendTitle}>Map Key:</span>
        {[
          { color: '#1a7a1a', label: 'Strong (>$15/MWh)' },
          { color: '#5aaa2a', label: 'Moderate ($8-15)' },
          { color: '#c8b400', label: 'Marginal ($2-8)' },
          { color: '#e07b00', label: 'Weak ($0-2)' },
          { color: '#c0392b', label: 'Unfavorable (<$0)' },
        ].map(({ color, label }) => (
          <span key={label} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: color }} />
            {label}
          </span>
        ))}
        <span style={styles.legendItem}>
          <span style={styles.legendLine} />
          Gas pipelines
        </span>
        <span style={styles.legendItem}>
          <span style={styles.legendOutline} />
          Texas outline
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, width: '16px', height: '16px', border: '2px solid #f5fbff', background: '#58a6ff' }} />
          Hub
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, width: '13px', height: '13px', border: '2px dashed #f5fbff', background: '#f0c419' }} />
          Load zone
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, width: '11px', height: '11px', border: '2px solid #f5fbff', background: '#8b949e' }} />
          Resource
        </span>
      </footer>
    </div>
  )
}

const styles = {
  header: {
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: '#58a6ff',
  },
  headerSub: {
    fontSize: '12px',
    color: '#8b949e',
    letterSpacing: '0.05em',
  },
  mapShell: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: 'radial-gradient(circle at 20% 20%, rgba(91, 155, 213, 0.14), transparent 30%), radial-gradient(circle at 80% 10%, rgba(255, 157, 66, 0.12), transparent 28%), linear-gradient(180deg, #0b141b 0%, #071017 100%)',
  },
  mapAura: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 300,
    boxShadow: 'inset 0 0 120px rgba(0, 0, 0, 0.35)',
  },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(13,17,23,0.85)',
    padding: '16px 24px',
    borderRadius: '6px',
    fontSize: '13px',
    zIndex: 1000,
    color: '#8b949e',
  },
  legend: {
    background: '#161b22',
    borderTop: '1px solid #30363d',
    padding: '8px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
  },
  legendTitle: {
    fontSize: '11px',
    color: '#8b949e',
    letterSpacing: '0.1em',
    fontWeight: 700,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#c9d1d9',
  },
  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  legendLine: {
    width: '20px',
    height: '0',
    borderTop: '3px solid #ff7b3a',
    display: 'inline-block',
    opacity: 0.75,
  },
  legendOutline: {
    width: '18px',
    height: '10px',
    borderRadius: '10px',
    border: '2px solid #9fd8ff',
    background: 'rgba(19, 52, 69, 0.35)',
    display: 'inline-block',
  },
}
