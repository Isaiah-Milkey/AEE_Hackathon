import React from 'react'

const NODE_TYPE_OPTIONS = [
  { value: 'all', label: 'All node types' },
  { value: 'hub', label: 'Hubs' },
  { value: 'load_zone', label: 'Load zones' },
  { value: 'resource', label: 'Resources' },
]

const SPREAD_OPTIONS = [
  { value: 'all', label: 'Any spread' },
  { value: 'positive', label: 'Positive only' },
  { value: '8', label: '>= $8/MWh' },
  { value: '15', label: '>= $15/MWh' },
]

const TIME_WINDOW_OPTIONS = [
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
  { value: 'custom', label: 'Custom' },
]

export default function MapControls({ 
  search, 
  filters, 
  onSearchChange, 
  onFilterChange, 
  resultCount, 
  totalCount,
  timeWindow,
  customDateRange,
  onTimeWindowChange,
  onCustomDateRangeChange
}) {
  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <div style={styles.title}>Explore Nodes</div>
        <div style={styles.count}>{resultCount}/{totalCount}</div>
      </div>

      <input
        type="text"
        placeholder="Search by name, id, or zone"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={styles.search}
      />

      <div style={styles.filters}>
        <label style={styles.field}>
          <span style={styles.label}>Node Type</span>
          <select
            value={filters.nodeType}
            onChange={(e) => onFilterChange('nodeType', e.target.value)}
            style={styles.select}
          >
            {NODE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Spread Filter</span>
          <select
            value={filters.spread}
            onChange={(e) => onFilterChange('spread', e.target.value)}
            style={styles.select}
          >
            {SPREAD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>Time Window</span>
          <select
            value={timeWindow}
            onChange={(e) => onTimeWindowChange(e.target.value)}
            style={styles.select}
          >
            {TIME_WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {timeWindow === 'custom' && (
          <div style={styles.customDateRow}>
            <input
              type="date"
              value={customDateRange.start}
              onChange={(e) => onCustomDateRangeChange(prev => ({ ...prev, start: e.target.value }))}
              style={styles.dateInput}
              placeholder="Start"
            />
            <span style={styles.dateSeparator}>to</span>
            <input
              type="date"
              value={customDateRange.end}
              onChange={(e) => onCustomDateRangeChange(prev => ({ ...prev, end: e.target.value }))}
              style={styles.dateInput}
              placeholder="End"
            />
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    zIndex: 1000,
    width: '280px',
    background: 'rgba(15, 23, 31, 0.92)',
    border: '1px solid rgba(159, 216, 255, 0.2)',
    borderRadius: '10px',
    padding: '12px',
    fontFamily: "'IBM Plex Mono', monospace",
    backdropFilter: 'blur(10px)',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.22)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
  },
  title: {
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#9fd8ff',
    fontWeight: 700,
  },
  count: {
    fontSize: '11px',
    color: '#ffb36b',
  },
  search: {
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: '10px',
    background: '#0d1117',
    color: '#e6edf3',
    border: '1px solid #2e4450',
    borderRadius: '8px',
    padding: '10px 12px',
    outline: 'none',
    fontSize: '12px',
  },
  filters: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '10px',
  },
  field: {
    display: 'grid',
    gap: '5px',
  },
  label: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: '#8b949e',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#0d1117',
    color: '#e6edf3',
    border: '1px solid #2e4450',
    borderRadius: '8px',
    padding: '8px 10px',
    outline: 'none',
    fontSize: '12px',
  },
  customDateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  dateInput: {
    flex: 1,
    background: '#0d1117',
    color: '#e6edf3',
    border: '1px solid #2e4450',
    borderRadius: '6px',
    padding: '6px 8px',
    fontSize: '11px',
    outline: 'none',
  },
  dateSeparator: {
    fontSize: '10px',
    color: '#8b949e',
  },
}
