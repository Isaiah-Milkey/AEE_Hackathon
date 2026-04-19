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
  const [loading, setLoading] = useState(true)
  const [gasPipelineOpacity, setGasPipelineOpacity] = useState(0.35)
  const [heatmapMetric, setHeatmapMetric] = useState('avg_lmp')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    nodeType: 'all',
    spread: 'all',
  })
  const [layers, setLayers] = useState({
    settlementPoints: true,
    gasPipelines: true,
    heatmap: false,
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

  const handleNodeClick = async (nodeId) => {
    try {
      const [detail, live] = await Promise.all([
        axios.get(`${API}/api/site/${nodeId}`),
        axios.get(`${API}/api/site/${nodeId}/live`),
      ])
      setSelectedSite(detail.data)
      setLiveData(live.data)
    } catch (err) {
      console.error('Failed to load site detail:', err)
    }
  }

  const handleMapClick = async (lat, lng) => {
    try {
      const nearest = await axios.get(`${API}/api/nearest`, {
        params: { lat, lng }
      })
      const [detail, live] = await Promise.all([
        axios.get(`${API}/api/site/${nearest.data.nearest_node}`),
        axios.get(`${API}/api/site/${nearest.data.nearest_node}/live`),
      ])
      setSelectedSite({
        ...detail.data,
        customClick: true,
        clickedLat: lat,
        clickedLng: lng,
        distanceMiles: nearest.data.distance_miles,
        accuracyFlag: nearest.data.accuracy_flag,
      })
      setLiveData(live.data)
    } catch (err) {
      console.error('Failed to find nearest node:', err)
    }
  }

  const filteredNodes = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()
    return nodes.filter((node) => {
      const matchesSearch = !searchTerm || [
        node.name,
        node.id,
        node.zone,
      ].some((value) => value?.toLowerCase().includes(searchTerm))

      const matchesNodeType = filters.nodeType === 'all' || node.node_type === filters.nodeType

      let matchesSpread = true
      if (filters.spread === 'positive') {
        matchesSpread = (node.avg_spread ?? Number.NEGATIVE_INFINITY) > 0
      } else if (filters.spread !== 'all') {
        matchesSpread = (node.avg_spread ?? Number.NEGATIVE_INFINITY) >= Number(filters.spread)
      }

      return matchesSearch && matchesNodeType && matchesSpread
    })
  }, [nodes, search, filters])

  const handleClosePanel = () => {
    setSelectedSite(null)
    setLiveData(null)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      <header style={styles.header}>
        <span style={styles.headerTitle}>BTM SPREAD HEATMAP</span>
        <span style={styles.headerSub}>West Texas · ERCOT · Behind-the-Meter Economics</span>
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
            onSearchChange={setSearch}
            onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
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
          />

          <MapView
            apiBase={API}
            nodes={filteredNodes}
            layers={layers}
            gasPipelineOpacity={gasPipelineOpacity}
            heatmapMetric={heatmapMetric}
            onNodeClick={handleNodeClick}
            onMapClick={handleMapClick}
          />
        </div>

        {selectedSite && (
          <SitePanel
            site={selectedSite}
            live={liveData}
            onClose={handleClosePanel}
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
