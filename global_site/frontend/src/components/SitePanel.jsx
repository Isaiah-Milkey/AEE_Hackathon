import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'

export default function SitePanel({ site, live, onClose }) {
  const { node, score, chart_data, customClick, distanceMiles, accuracyFlag } = site

  // Thin chart data to last 180 points for performance
  const chartData = (chart_data || []).slice(-180)

  return (
    <div style={styles.panel}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.nodeName}>{node.name}</div>
          <div style={styles.nodeId}>{node.id} · {node.zone}</div>
          {customClick && (
            <div style={styles.proximityWarning}>
              {accuracyFlag
                ? `⚠ Estimated from nearest node — ${distanceMiles} mi away`
                : `Nearest node: ${distanceMiles} mi away`}
            </div>
          )}
        </div>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      {/* Spread score badge */}
      <div style={styles.scoreRow}>
        <div style={{ ...styles.scoreBadge, background: score?.color || '#888' }}>
          {score?.label || 'No data'}
        </div>
        <div style={styles.scoreDetail}>
          <span>Avg spread: </span>
          <strong style={{ color: score?.avg_spread >= 0 ? '#5aaa2a' : '#c0392b' }}>
            {score?.avg_spread != null
              ? `${score.avg_spread > 0 ? '+' : ''}${score.avg_spread} $/MWh`
              : '—'}
          </strong>
        </div>
      </div>

      {/* Live conditions */}
      {live && (
        <div style={styles.liveBox}>
          <div style={styles.liveTitle}>CURRENT CONDITIONS</div>
          <div style={styles.liveGrid}>
            <LiveStat label="LMP"        value={`$${live.lmp}/MWh`} />
            <LiveStat label="Waha Gas"   value={`$${live.waha_price}/MMBtu`} />
            <LiveStat label="Cost to Gen" value={`$${live.cost_to_gen}/MWh`} />
            <LiveStat
              label="Live Spread"
              value={`${live.current_spread > 0 ? '+' : ''}$${live.current_spread}/MWh`}
              highlight={live.current_spread >= 0 ? '#5aaa2a' : '#c0392b'}
            />
          </div>
          <div style={{
            ...styles.recommendation,
            background: live.recommendation === 'Generate' ? '#1a3a1a' : '#3a1a1a',
            borderColor: live.recommendation === 'Generate' ? '#5aaa2a' : '#c0392b',
          }}>
            {live.recommendation === 'Generate'
              ? '▶ RUN GENERATOR — self-generation is cheaper'
              : '⬇ IMPORT FROM GRID — grid power is cheaper'}
          </div>
        </div>
      )}

      {/* Spread history chart */}
      {chartData.length > 0 && (
        <div style={styles.chartSection}>
          <div style={styles.chartTitle}>SPREAD HISTORY ($/MWh)</div>
          <div style={styles.chartHint}>
            Above zero → run generator &nbsp;|&nbsp; Below zero → buy from grid
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#8b949e' }}
                tickFormatter={d => d?.slice(5)}  // show MM-DD only
                interval={Math.floor(chartData.length / 6)}
              />
              <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: '11px' }}
                formatter={(val) => [`$${val}/MWh`]}
              />
              <ReferenceLine y={0} stroke="#555" strokeDasharray="4 2" />
              <Line
                type="monotone"
                dataKey="spread"
                stroke="#58a6ff"
                dot={false}
                strokeWidth={1.5}
                name="Spread"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* LMP vs Gas Cost chart */}
      {chartData.length > 0 && (
        <div style={styles.chartSection}>
          <div style={styles.chartTitle}>LMP vs COST TO GENERATE ($/MWh)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: '#8b949e' }}
                tickFormatter={d => d?.slice(5)}
                interval={Math.floor(chartData.length / 6)}
              />
              <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: '11px' }}
                formatter={(val) => [`$${val}/MWh`]}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Line type="monotone" dataKey="lmp"      stroke="#f0c419" dot={false} strokeWidth={1.5} name="Grid LMP" />
              <Line type="monotone" dataKey="gas_cost" stroke="#e07b00" dot={false} strokeWidth={1.5} name="Cost to Generate" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Averages summary */}
      {score && (
        <div style={styles.summaryRow}>
          <SummaryItem label="Avg LMP"      value={`$${score.avg_lmp}/MWh`} />
          <SummaryItem label="Avg Gen Cost" value={`$${score.avg_gas_cost}/MWh`} />
          <SummaryItem label="Avg Spread"   value={`${score.avg_spread > 0 ? '+' : ''}$${score.avg_spread}/MWh`} />
        </div>
      )}

    </div>
  )
}

function LiveStat({ label, value, highlight }) {
  return (
    <div style={styles.liveStat}>
      <div style={styles.liveStatLabel}>{label}</div>
      <div style={{ ...styles.liveStatValue, color: highlight || '#e6edf3' }}>{value}</div>
    </div>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div style={styles.summaryItem}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  )
}

const styles = {
  panel: {
    width:          '360px',
    minWidth:       '360px',
    background:     '#161b22',
    borderLeft:     '1px solid #30363d',
    overflowY:      'auto',
    display:        'flex',
    flexDirection:  'column',
    fontFamily:     "'IBM Plex Mono', monospace",
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    padding:        '16px',
    borderBottom:   '1px solid #30363d',
  },
  nodeName: {
    fontSize:     '15px',
    fontWeight:   700,
    color:        '#e6edf3',
    marginBottom: '3px',
  },
  nodeId: {
    fontSize: '11px',
    color:    '#8b949e',
  },
  proximityWarning: {
    fontSize:    '10px',
    color:       '#f0c419',
    marginTop:   '4px',
  },
  closeBtn: {
    background:  'none',
    border:      'none',
    color:       '#8b949e',
    cursor:      'pointer',
    fontSize:    '16px',
    padding:     '0 4px',
  },
  scoreRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         '12px',
    padding:     '12px 16px',
    borderBottom: '1px solid #21262d',
  },
  scoreBadge: {
    padding:      '3px 10px',
    borderRadius: '12px',
    fontSize:     '11px',
    fontWeight:   700,
    color:        '#fff',
  },
  scoreDetail: {
    fontSize: '12px',
    color:    '#8b949e',
  },
  liveBox: {
    margin:       '12px 16px',
    padding:      '12px',
    background:   '#0d1117',
    borderRadius: '6px',
    border:       '1px solid #30363d',
  },
  liveTitle: {
    fontSize:     '10px',
    letterSpacing: '0.1em',
    color:        '#8b949e',
    marginBottom: '10px',
    fontWeight:   700,
  },
  liveGrid: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '8px',
    marginBottom:        '10px',
  },
  liveStat: {
    background:   '#161b22',
    borderRadius: '4px',
    padding:      '6px 8px',
  },
  liveStatLabel: {
    fontSize:     '9px',
    color:        '#8b949e',
    letterSpacing: '0.08em',
    marginBottom: '2px',
  },
  liveStatValue: {
    fontSize:   '13px',
    fontWeight: 700,
  },
  recommendation: {
    padding:      '8px 10px',
    borderRadius: '4px',
    border:       '1px solid',
    fontSize:     '11px',
    fontWeight:   700,
    letterSpacing: '0.05em',
  },
  chartSection: {
    padding:      '12px 16px',
    borderTop:    '1px solid #21262d',
  },
  chartTitle: {
    fontSize:     '10px',
    letterSpacing: '0.1em',
    color:        '#8b949e',
    marginBottom: '2px',
    fontWeight:   700,
  },
  chartHint: {
    fontSize:     '9px',
    color:        '#484f58',
    marginBottom: '8px',
  },
  summaryRow: {
    display:      'flex',
    borderTop:    '1px solid #21262d',
    padding:      '12px 16px',
    gap:          '16px',
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize:     '9px',
    color:        '#8b949e',
    letterSpacing: '0.08em',
    marginBottom: '3px',
  },
  summaryValue: {
    fontSize:   '12px',
    fontWeight: 700,
    color:      '#e6edf3',
  },
}
