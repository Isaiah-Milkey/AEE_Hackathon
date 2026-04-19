import React, { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON, Pane, Rectangle, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const WEST_TEXAS_CENTER = [31.5, -102.0]
const DEFAULT_ZOOM = 7
const PIPELINE_VISIBLE_ZOOM = 7
const PIPELINE_TOOLTIP_ZOOM = 9
const WEST_TEXAS_BOUNDS = [
  [29.0, -106.8],
  [34.8, -99.0],
]
const HEATMAP_GRID = {
  rows: 18,
  cols: 24,
}

const TYPE_STYLE = {
  hub: {
    haloRadius: 18,
    markerRadius: 11.5,
    centerRadius: 3.2,
    borderColor: '#f5fbff',
    centerColor: '#58a6ff',
    dashArray: null,
  },
  load_zone: {
    haloRadius: 15,
    markerRadius: 9,
    centerRadius: 2.7,
    borderColor: '#f5fbff',
    centerColor: '#f0c419',
    dashArray: '4 3',
  },
  resource: {
    haloRadius: 13,
    markerRadius: 7.5,
    centerRadius: 2.2,
    borderColor: '#f5fbff',
    centerColor: '#8b949e',
    dashArray: null,
  },
}

function useGeoJsonOverlay(url) {
  const [data, setData] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Overlay fetch failed with ${response.status}`)
        }
        return response.json()
      })
      .then((json) => {
        setData(json)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error(`Failed to load overlay from ${url}:`, error)
        }
      })

    return () => controller.abort()
  }, [url])

  return data
}

function TexasOutlineLayer({ apiBase }) {
  const data = useGeoJsonOverlay(`${apiBase}/api/overlays/texas-outline`)

  if (!data) {
    return null
  }

  return (
    <Pane name="state-outline" style={{ zIndex: 385 }}>
      <GeoJSON
        data={data}
        interactive={false}
        style={() => ({
          color: '#9fd8ff',
          weight: 2.5,
          opacity: 0.78,
          fillColor: '#133445',
          fillOpacity: 0.09,
        })}
      />
    </Pane>
  )
}

function CountyBoundariesLayer({ apiBase }) {
  const data = useGeoJsonOverlay(`${apiBase}/api/overlays/county-boundaries`)

  if (!data) {
    return null
  }

  return (
    <Pane name="county-boundaries" style={{ zIndex: 380 }}>
      <GeoJSON
        data={data}
        interactive={false}
        style={() => ({
          color: '#3d4a5c',
          weight: 1,
          opacity: 0.5,
          fillColor: '#1a2332',
          fillOpacity: 0.15,
        })}
      />
    </Pane>
  )
}

function GasPipelineLayer({ apiBase, opacity, tooltipEnabled }) {
  const data = useGeoJsonOverlay(`${apiBase}/api/overlays/gas-pipelines?max_allowable_offset=0.01`)

  const pipelineStyle = useMemo(() => ({
    color: '#ff7b3a',
    weight: 2,
    opacity,
  }), [opacity])

  if (!data) {
    return null
  }

  return (
    <Pane name="gas-pipelines" style={{ zIndex: 410 }}>
      <GeoJSON
        key={tooltipEnabled ? 'interactive' : 'static'}
        data={data}
        interactive={tooltipEnabled}
        style={pipelineStyle}
        onEachFeature={tooltipEnabled ? (feature, layer) => {
          const type = feature.properties?.typepipe || 'Pipeline'
          const operator = feature.properties?.operator || 'Unknown operator'
          layer.bindTooltip(`${type} - ${operator}`, {
            sticky: true,
            direction: 'top',
            opacity: 0.92,
          })
        } : undefined}
      />
    </Pane>
  )
}

function MapViewportController() {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(WEST_TEXAS_BOUNDS, {
      padding: [28, 28],
    })
  }, [map])

  return null
}

function MapClickHandler({ onMapClick, nodes}) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      const nearExisting = nodes.some((n) => {
        const dist = Math.sqrt((n.lat - lat) ** 2 + (n.lng - lng) ** 2)
        return dist < 0.3
      })
      if (!nearExisting) {
        onMapClick(lat, lng)
      }
    }
  })
  return null
}

function MapZoomTracker({ onZoomChange }) {
  useMapEvents({
    zoomend(event) {
      onZoomChange(event.target.getZoom())
    }
  })
  return null
}

function SettlementPoint({ node, onNodeClick, colorBy = 'lmp' }) {
  const nodeStyle = TYPE_STYLE[node.node_type] || TYPE_STYLE.resource
  
  // Determine which color to use based on colorBy setting
  // colorBy='lmp' uses lmp_color (green=cheap, red=expensive)
  // colorBy='spread' uses spread_color (green=favorable, red=unfavorable)
  const dotColor = colorBy === 'lmp' ? (node.lmp_color || node.color || '#888888') : (node.color || '#888888')
  const dotLabel = colorBy === 'lmp' ? node.lmp_label : node.label

  return (
    <React.Fragment key={node.id}>
      <CircleMarker
        center={[node.lat, node.lng]}
        radius={nodeStyle.haloRadius}
        interactive={false}
        pathOptions={{
          fillColor: dotColor,
          fillOpacity: 0.16,
          color: '#f5fbff',
          opacity: 0.34,
          weight: 5,
        }}
      />
      <CircleMarker
        center={[node.lat, node.lng]}
        radius={nodeStyle.markerRadius}
        pathOptions={{
          fillColor: dotColor,
          fillOpacity: 0.93,
          color: nodeStyle.borderColor,
          opacity: 0.98,
          weight: node.node_type === 'hub' ? 2.6 : 2.1,
          dashArray: nodeStyle.dashArray,
        }}
        eventHandlers={{
          click: () => onNodeClick(node.id)
        }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
          <div style={tooltipStyles.container}>
            <div style={tooltipStyles.name}>{node.name}</div>
            <div style={tooltipStyles.id}>{node.id}</div>
            <div style={tooltipStyles.type}>{formatNodeType(node.node_type)}</div>
            {node.avg_spread != null && (
              <>
                <div style={{
                  ...tooltipStyles.spread,
                  color: node.avg_spread >= 0 ? '#1a7a1a' : '#c0392b'
                }}>
                  {node.avg_spread > 0 ? '+' : ''}{node.avg_spread.toFixed(2)} $/MWh
                </div>
                <div style={tooltipStyles.label}>{dotLabel || node.label}</div>
              </>
            )}
            {colorBy === 'lmp' && node.avg_lmp != null && (
              <div style={tooltipStyles.lmp}>
                LMP: ${node.avg_lmp.toFixed(2)}/MWh
              </div>
            )}
            <div style={tooltipStyles.hint}>Click for details</div>
          </div>
        </Tooltip>
      </CircleMarker>
    </React.Fragment>
  )
}

function HeatmapSurface({ nodes, metric }) {
  const cells = useMemo(() => {
    const metricNodes = nodes.filter((n) => n[metric] != null)
    if (!metricNodes.length) return []

    const rawCells = []
    let minValue = Infinity
    let maxValue = -Infinity

    const latStep = (WEST_TEXAS_BOUNDS[1][0] - WEST_TEXAS_BOUNDS[0][0]) / HEATMAP_GRID.rows
    const lngStep = (WEST_TEXAS_BOUNDS[1][1] - WEST_TEXAS_BOUNDS[0][1]) / HEATMAP_GRID.cols

    for (let row = 0; row < HEATMAP_GRID.rows; row += 1) {
      for (let col = 0; col < HEATMAP_GRID.cols; col += 1) {
        const south = WEST_TEXAS_BOUNDS[0][0] + row * latStep
        const north = south + latStep
        const west = WEST_TEXAS_BOUNDS[0][1] + col * lngStep
        const east = west + lngStep
        const centerLat = south + latStep / 2
        const centerLng = west + lngStep / 2

        let weightedValue = 0
        let totalWeight = 0

        metricNodes.forEach((node) => {
          const distance = Math.sqrt((node.lat - centerLat) ** 2 + (node.lng - centerLng) ** 2)
          const weight = 1 / Math.max(distance ** 2, 0.015)
          weightedValue += node.value * weight
          totalWeight += weight
        })

        const value = weightedValue / totalWeight
        minValue = Math.min(minValue, value)
        maxValue = Math.max(maxValue, value)

        rawCells.push({
          bounds: [[south, west], [north, east]],
          center: [centerLat, centerLng],
          value,
        })
      }
    }

    const range = Math.max(maxValue - minValue, 1e-6)
    return rawCells.map((cell) => ({
      ...cell,
      normalized: (cell.value - minValue) / range,
      minValue,
      maxValue,
    }))
  }, [nodes, metric])

  if (!cells.length) {
    return null
  }

  return (
    <Pane name="heatmap-surface" style={{ zIndex: 395 }}>
      {cells.map((cell, index) => {
        const color = getHeatColor(cell.normalized)
        const opacity = 0.12 + (cell.normalized * 0.42)
        return (
          <Rectangle
            key={`${metric}-${index}`}
            bounds={cell.bounds}
            interactive={false}
            pathOptions={{
              stroke: false,
              fillColor: color,
              fillOpacity: opacity,
            }}
          />
        )
      })}
    </Pane>
  )
}

function getHeatColor(normalized) {
  const clamped = Math.max(0, Math.min(1, normalized))
  const hue = 220 - (190 * clamped)
  const saturation = 80
  const lightness = 55 - (8 * clamped)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

function formatNodeType(value) {
  return value
    ?.split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function MapView({ apiBase, nodes, layers, gasPipelineOpacity, heatmapMetric, colorBy = 'lmp', onNodeClick, onMapClick }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const pipelineTooltipEnabled = zoom >= PIPELINE_TOOLTIP_ZOOM

  return (
    <MapContainer
      center={WEST_TEXAS_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      preferCanvas={true}
      style={{
        height: '100%',
        width: '100%',
        background: 'linear-gradient(180deg, #0d1b24 0%, #0a141b 100%)',
      }}
    >
      <MapViewportController />
      <MapZoomTracker onZoomChange={setZoom} />

      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
        updateWhenZooming={false}
      />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
        pane="overlayPane"
        opacity={0.82}
        updateWhenZooming={false}
      />

      <MapClickHandler onMapClick={onMapClick} nodes={nodes} />

      <TexasOutlineLayer apiBase={apiBase} />

      {layers.countyBoundaries && (
        <CountyBoundariesLayer apiBase={apiBase} />
      )}

      {layers.heatmap && (
        <HeatmapSurface
          nodes={nodes}
          metric={heatmapMetric}
        />
      )}

      {layers.gasPipelines && zoom >= PIPELINE_VISIBLE_ZOOM && (
        <GasPipelineLayer
          apiBase={apiBase}
          opacity={gasPipelineOpacity}
          tooltipEnabled={pipelineTooltipEnabled}
        />
      )}

      {layers.settlementPoints && (
        <Pane name="settlement-points" style={{ zIndex: 470 }}>
          {nodes.map((node) => (
            <SettlementPoint
              key={node.id}
              node={node}
              onNodeClick={onNodeClick}
              colorBy={colorBy}
            />
          ))}
        </Pane>
      )}
    </MapContainer>
  )
}

const tooltipStyles = {
  container: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '12px',
    minWidth: '160px',
    padding: '2px',
  },
  name: {
    fontWeight: 700,
    fontSize: '13px',
    marginBottom: '3px',
    color: '#1a1a1a',
  },
  id: {
    color: '#666',
    fontSize: '11px',
    marginBottom: '2px',
  },
  type: {
    color: '#54616d',
    fontSize: '10px',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  spread: {
    fontWeight: 700,
    fontSize: '13px',
    marginBottom: '2px',
  },
  label: {
    color: '#444',
    fontSize: '11px',
    marginBottom: '3px',
  },
  lmp: {
    color: '#666',
    fontSize: '11px',
    marginBottom: '3px',
    fontStyle: 'italic',
  },
  hint: {
    color: '#999',
    fontSize: '10px',
    fontStyle: 'italic',
  },
}
