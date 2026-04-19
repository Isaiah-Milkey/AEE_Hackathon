import React from 'react'

const LAYER_CONFIG = [
  { key: 'settlementPoints',  label: 'Settlement Points', available: true  },
  { key: 'gasPipelines',      label: 'Gas Pipelines',      available: true  },
  { key: 'heatmap',           label: 'Heatmap Surface',    available: true  },
  { key: 'countyBoundaries',  label: 'County Boundaries', available: true  },
  { key: 'voronoi',           label: 'Voronoi Regions',    available: false },
  { key: 'windFarms',         label: 'Wind Farms',         available: false },
  { key: 'solarFarms',        label: 'Solar Farms',        available: false },
]

const HEATMAP_METRICS = [
  { key: 'avg_lmp', label: 'LMP' },
  { key: 'avg_spread', label: 'Avg Spread' },
  { key: 'avg_gas_cost', label: 'Avg Gas Cost' },
]

const COLOR_BY_OPTIONS = [
  { key: 'lmp', label: 'LMP (green=cheap, red=expensive)' },
  { key: 'spread', label: 'Spread (green=favorable, red=unfavorable)' },
]

export default function LayerToggles({
  layers,
  onChange,
  gasPipelineOpacity,
  onGasOpacityChange,
  heatmapMetric,
  onHeatmapMetricChange,
  colorBy,
  onColorByChange,
}) {
  const toggle = (key) => {
    onChange(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>LAYERS</div>
      {LAYER_CONFIG.map(({ key, label, available }) => (
        <label
          key={key}
          style={{
            ...styles.row,
            opacity: available ? 1 : 0.4,
            cursor:  available ? 'pointer' : 'not-allowed',
          }}
        >
          <input
            type="checkbox"
            checked={layers[key]}
            onChange={() => available && toggle(key)}
            disabled={!available}
            style={styles.checkbox}
          />
          <span style={styles.label}>{label}</span>
          {!available && <span style={styles.soon}>soon</span>}
        </label>
      ))}

      {layers.gasPipelines && (
        <div style={styles.sliderBlock}>
          <div style={styles.sliderHeader}>
            <span style={styles.sliderLabel}>Pipeline Opacity</span>
            <span style={styles.sliderValue}>{Math.round(gasPipelineOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={gasPipelineOpacity}
            onChange={(e) => onGasOpacityChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>
      )}

      {layers.heatmap && (
        <div style={styles.sliderBlock}>
          <div style={styles.sliderHeader}>
            <span style={styles.sliderLabel}>Heatmap Metric</span>
          </div>
          <div style={styles.metricGrid}>
            {HEATMAP_METRICS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onHeatmapMetricChange(key)}
                style={{
                  ...styles.metricButton,
                  ...(heatmapMetric === key ? styles.metricButtonActive : {}),
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Color by selector - always visible */}
      <div style={styles.sliderBlock}>
        <div style={styles.sliderHeader}>
          <span style={styles.sliderLabel}>Dot Color</span>
        </div>
        <div style={styles.metricGrid}>
          {COLOR_BY_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onColorByChange(key)}
              style={{
                ...styles.metricButton,
                ...(colorBy === key ? styles.metricButtonActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position:     'absolute',
    top:          '16px',
    right:        '16px',
    zIndex:       1000,
    background:   'rgba(22, 27, 34, 0.92)',
    border:       '1px solid #30363d',
    borderRadius: '6px',
    padding:      '10px 12px',
    fontFamily:   "'IBM Plex Mono', monospace",
    minWidth:     '160px',
    backdropFilter: 'blur(4px)',
  },
  title: {
    fontSize:      '9px',
    letterSpacing: '0.15em',
    color:         '#8b949e',
    fontWeight:    700,
    marginBottom:  '8px',
  },
  row: {
    display:       'flex',
    alignItems:    'center',
    gap:           '8px',
    marginBottom:  '6px',
  },
  checkbox: {
    accentColor:   '#58a6ff',
    cursor:        'inherit',
  },
  label: {
    fontSize: '11px',
    color:    '#c9d1d9',
    flex:     1,
  },
  soon: {
    fontSize:     '9px',
    color:        '#484f58',
    background:   '#21262d',
    padding:      '1px 5px',
    borderRadius: '3px',
  },
  sliderBlock: {
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(139, 148, 158, 0.18)',
  },
  sliderHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  sliderLabel: {
    fontSize: '10px',
    color: '#8b949e',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  sliderValue: {
    fontSize: '10px',
    color: '#ffb36b',
  },
  slider: {
    width: '100%',
    accentColor: '#ff7b3a',
    cursor: 'pointer',
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '6px',
  },
  metricButton: {
    border: '1px solid #2e4450',
    background: '#0d1117',
    color: '#c9d1d9',
    borderRadius: '6px',
    padding: '7px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: "'IBM Plex Mono', monospace",
  },
  metricButtonActive: {
    borderColor: '#ff7b3a',
    color: '#fff3e8',
    background: 'rgba(255, 123, 58, 0.14)',
  },
}
