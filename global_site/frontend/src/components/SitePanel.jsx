import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend, Area, ComposedChart
} from 'recharts'

export default function SitePanel({ site, live, onClose, onRefresh, refreshing, analytics, scorecard }) {
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
          <div style={styles.liveHeader}>
            <div style={styles.liveTitle}>CURRENT CONDITIONS</div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                style={styles.refreshBtn}
                title="Refresh live data from ERCOT"
              >
                {refreshing ? '⟳' : '↻'} Refresh
              </button>
            )}
          </div>
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

      {/* Risk Assessment Section */}
      {analytics && (
        <div style={styles.analyticsSection}>
          <div style={styles.sectionTitle}>RISK ASSESSMENT</div>
          <div style={styles.riskRow}>
            <RiskMetric 
              label="Avg Spread" 
              value={`$${analytics.metrics?.avg_spread ?? '—'}/MWh`}
              color={analytics.metrics?.avg_spread >= 0 ? '#5aaa2a' : '#c0392b'}
            />
            <RiskMetric 
              label="Std Dev" 
              value={analytics.metrics?.std_dev ?? '—'}
              color={analytics.metrics?.std_dev < 10 ? '#5aaa2a' : '#c0392b'}
            />
            <RiskMetric 
              label="% Positive" 
              value={`${analytics.metrics?.pct_positive ?? '—'}%`}
              color={analytics.metrics?.pct_positive >= 50 ? '#5aaa2a' : '#c0392b'}
            />
          </div>
          <div style={styles.riskBadgeRow}>
            <span style={{
              ...styles.riskBadge,
              background: getRiskBadgeColor(analytics.risk_label),
            }}>
              {analytics.risk_label || 'Unknown'} Risk
            </span>
          </div>
          
          {/* Volatility Chart - Rolling 30-day Std Dev */}
          {analytics.rolling_std_series && analytics.rolling_std_series.length > 0 && (
            <div style={styles.chartSection}>
              <div style={styles.chartTitle}>VOLATILITY (30-DAY ROLLING STD DEV)</div>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={analytics.rolling_std_series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: '#8b949e' }}
                    tickFormatter={d => d?.slice(5)}
                    interval={Math.floor(analytics.rolling_std_series.length / 4)}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} />
                  <Tooltip
                    contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: '11px' }}
                    formatter={(val) => [val?.toFixed(2), 'Std Dev']}
                  />
                  <ReferenceLine y={5} stroke="#5aaa2a" strokeDasharray="3 3" />
                  <ReferenceLine y={10} stroke="#c0392b" strokeDasharray="3 3" />
                  <Area 
                    type="monotone" 
                    dataKey="std_dev" 
                    stroke="#f0c419" 
                    fill="#f0c419" 
                    fillOpacity={0.2}
                    strokeWidth={1.5} 
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Spread History Chart with area fills */}
      {chartData.length > 0 && (
        <div style={styles.chartSection}>
          <div style={styles.chartTitle}>SPREAD HISTORY ($/MWh)</div>
          <div style={styles.chartHint}>
            Above zero → run generator &nbsp;|&nbsp; Below zero → buy from grid
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
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
              <defs>
                <linearGradient id="spreadGradientPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5aaa2a" stopOpacity={0.4}/>
                  <stop offset="100%" stopColor="#5aaa2a" stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="spreadGradientNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c0392b" stopOpacity={0.05}/>
                  <stop offset="100%" stopColor="#c0392b" stopOpacity={0.4}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="spread" 
                stroke="#58a6ff" 
                fill="url(#spreadGradientPos)"
                strokeWidth={1.5} 
                name="Spread"
              />
            </ComposedChart>
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

      {/* Site Scorecard */}
      {scorecard && (
        <div style={styles.scorecardSection}>
          <div style={styles.sectionTitle}>SITE SCORECARD</div>
          
          <div style={styles.scorecardGrid}>
            <ScorecardItem 
              label="Avg Spread" 
              value={`$${scorecard.metrics?.avg_spread ?? '—'}/MWh`}
            />
            <ScorecardItem 
              label="Std Deviation" 
              value={scorecard.metrics?.std_dev ?? '—'}
            />
            <ScorecardItem 
              label="% Time Positive" 
              value={`${scorecard.metrics?.pct_positive ?? '—'}%`}
            />
            <ScorecardItem 
              label="Total Days" 
              value={scorecard.metrics?.total_days ?? '—'}
            />
          </div>
          
          {scorecard.best_month && (
            <div style={styles.monthRow}>
              <span style={styles.monthLabel}>Best Month:</span>
              <span style={{...styles.monthValue, color: '#5aaa2a'}}>
                {scorecard.best_month.month}: +${scorecard.best_month.avg_spread}/MWh
              </span>
            </div>
          )}
          {scorecard.worst_month && (
            <div style={styles.monthRow}>
              <span style={styles.monthLabel}>Worst Month:</span>
              <span style={{...styles.monthValue, color: '#c0392b'}}>
                {scorecard.worst_month.month}: ${scorecard.worst_month.avg_spread}/MWh
              </span>
            </div>
          )}
          
          <div style={styles.overallRatingRow}>
            <span style={styles.overallLabel}>OVERALL RATING</span>
            <span style={{
              ...styles.overallBadge,
              background: getRatingColor(scorecard.overall_rating),
            }}>
              {scorecard.overall_rating || 'N/A'}
            </span>
          </div>
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

function getRiskBadgeColor(riskLabel) {
  switch (riskLabel) {
    case 'Stable': return '#1a7a1a'
    case 'Moderate': return '#5aaa2a'
    case 'Risky': return '#c8b400'
    case 'Avoid': return '#c0392b'
    default: return '#888'
  }
}

function getRatingColor(rating) {
  switch (rating) {
    case 'Excellent': return '#1a7a1a'
    case 'Good': return '#5aaa2a'
    case 'Fair': return '#c8b400'
    case 'Poor': return '#c0392b'
    default: return '#888'
  }
}

function LiveStat({ label, value, highlight }) {
  return (
    <div style={styles.liveStat}>
      <div style={styles.liveStatLabel}>{label}</div>
      <div style={{ ...styles.liveStatValue, color: highlight || '#e6edf3' }}>{value}</div>
    </div>
  )
}

function RiskMetric({ label, value, color }) {
  return (
    <div style={styles.riskMetric}>
      <div style={styles.riskMetricLabel}>{label}</div>
      <div style={{ ...styles.riskMetricValue, color }}>{value}</div>
    </div>
  )
}

function ScorecardItem({ label, value }) {
  return (
    <div style={styles.scorecardItem}>
      <div style={styles.scorecardLabel}>{label}</div>
      <div style={styles.scorecardValue}>{value}</div>
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
  liveHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  liveTitle: {
    fontSize:     '10px',
    letterSpacing: '0.1em',
    color:        '#8b949e',
    fontWeight:   700,
  },
  refreshBtn: {
    background:   '#21262d',
    border:       '1px solid #30363d',
    borderRadius: '4px',
    color:        '#58a6ff',
    cursor:       'pointer',
    fontSize:     '10px',
    padding:      '4px 8px',
    display:      'flex',
    alignItems:   'center',
    gap:          '4px',
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
  analyticsSection: {
    padding:      '12px 16px',
    borderTop:    '1px solid #21262d',
    background:   '#0d1117',
    margin:       '0 16px',
    borderRadius: '6px',
    marginTop:    '8px',
  },
  sectionTitle: {
    fontSize:     '10px',
    letterSpacing: '0.1em',
    color:        '#8b949e',
    fontWeight:   700,
    marginBottom: '10px',
  },
  riskRow: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap:                 '8px',
    marginBottom:        '10px',
  },
  riskMetric: {
    background:   '#161b22',
    borderRadius: '4px',
    padding:      '6px 8px',
    textAlign:    'center',
  },
  riskMetricLabel: {
    fontSize:     '8px',
    color:        '#8b949e',
    letterSpacing: '0.05em',
    marginBottom: '2px',
  },
  riskMetricValue: {
    fontSize:   '12px',
    fontWeight: 700,
  },
  riskBadgeRow: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '10px',
  },
  riskBadge: {
    padding:      '4px 12px',
    borderRadius: '12px',
    fontSize:     '10px',
    fontWeight:   700,
    color:        '#fff',
    textTransform: 'uppercase',
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
  scorecardSection: {
    padding:      '12px 16px',
    borderTop:    '1px solid #21262d',
    background:   '#0d1117',
    margin:       '0 16px',
    borderRadius: '6px',
    marginTop:    '8px',
  },
  scorecardGrid: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '8px',
    marginBottom:        '10px',
  },
  scorecardItem: {
    background:   '#161b22',
    borderRadius: '4px',
    padding:      '6px 8px',
  },
  scorecardLabel: {
    fontSize:     '8px',
    color:        '#8b949e',
    letterSpacing: '0.05em',
    marginBottom: '2px',
  },
  scorecardValue: {
    fontSize:   '12px',
    fontWeight: 700,
    color:      '#e6edf3',
  },
  monthRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  monthLabel: {
    fontSize: '10px',
    color:    '#8b949e',
  },
  monthValue: {
    fontSize:   '11px',
    fontWeight: 700,
  },
  overallRatingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
    paddingTop: '10px',
    borderTop: '1px solid #30363d',
  },
  overallLabel: {
    fontSize:     '9px',
    letterSpacing: '0.1em',
    color:        '#8b949e',
    fontWeight:   700,
  },
  overallBadge: {
    padding:      '4px 12px',
    borderRadius: '12px',
    fontSize:     '11px',
    fontWeight:   700,
    color:        '#fff',
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
