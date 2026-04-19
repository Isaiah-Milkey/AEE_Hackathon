import React, { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend, Area, ComposedChart,
  BarChart, Bar, Cell
} from 'recharts'

// Helper function to translate feature names to human-readable labels
const translateFeatureName = (featureName, value) => {
  switch (featureName) {
    case 'price_lag_1h': return `Price 1hr ago ($${value.toFixed(1)})`
    case 'price_lag_24h': return `Price yesterday ($${value.toFixed(1)})`
    case 'price_lag_168h': return `Price last week ($${value.toFixed(1)})`
    case 'hour': return `Hour: ${Math.floor(value)}:00`
    case 'henry_hub_price': return `Gas price ($${value.toFixed(2)})`
    case 'gas_lag_24h': return `Gas yesterday ($${value.toFixed(2)})`
    case 'gas_lag_168h': return `Gas last week ($${value.toFixed(2)})`
    case 'is_weekend': return `Weekend: ${value ? 'Yes' : 'No'}`
    case 'day_of_week':
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return `Day: ${days[Math.floor(value)]}`
    case 'month':
      const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `Month: ${months[Math.floor(value)]}`
    default: return featureName
  }
}

// Helper function to generate explanation summary
const generateExplanationSummary = (explanation) => {
  if (!explanation || explanation.length === 0) return "No explanation available."

  const topFeature = explanation[0]
  const topFeatureName = topFeature.feature_name

  let primaryDriver = ''
  if (topFeatureName.includes('price_lag')) {
    primaryDriver = 'Recent price momentum'
  } else if (topFeatureName === 'hour') {
    primaryDriver = 'Time of day'
  } else if (topFeatureName.includes('gas')) {
    primaryDriver = 'Natural gas prices'
  } else if (topFeatureName === 'day_of_week' || topFeatureName === 'is_weekend') {
    primaryDriver = 'Weekly patterns'
  } else {
    primaryDriver = 'Market fundamentals'
  }

  const secondaryFactors = explanation.slice(1, 3).map(item => {
    if (item.feature_name.includes('price_lag')) return 'historical prices'
    if (item.feature_name === 'hour') return 'time of day'
    if (item.feature_name.includes('gas')) return 'gas prices'
    if (item.feature_name === 'day_of_week' || item.feature_name === 'is_weekend') return 'day patterns'
    return 'market conditions'
  }).join(' and ')

  return `${primaryDriver} and ${secondaryFactors} were the dominant drivers of this forecast.`
}

export default function SitePanel({ site, live, onClose, onRefresh, refreshing, analytics, scorecard }) {
  const { node, score, chart_data, customClick, distanceMiles, accuracyFlag } = site

  const [activeTab, setActiveTab] = useState('details')
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastMessage, setForecastMessage] = useState('')
  const [forecastError, setForecastError] = useState('')
  const [forecastData, setForecastData] = useState(null)
  const [selectedHorizon, setSelectedHorizon] = useState('1h')

  const apiBase = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    setActiveTab('details')
    setForecastLoading(false)
    setForecastMessage('')
    setForecastError('')
  }, [node?.id])

  const handleRunForecast = async () => {
    if (!node?.id) return

    setForecastLoading(true)
    setForecastError('')
    setForecastMessage('')
    setForecastData(null)

    try {
      const response = await fetch(`${apiBase}/api/site/${node.id}/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: node.id }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `Request failed with status ${response.status}` }))
        throw new Error(errorData.detail || `Forecast request failed with status ${response.status}`)
      }

      const data = await response.json()

      if (data.status === 'success' && data.forecasts) {
        setForecastData(data)
        setForecastMessage(`Forecast generated successfully for ${data.forecasts.electricity ? Object.keys(data.forecasts.electricity).length : 0} time horizons.`)
      } else {
        setForecastMessage(data.message || 'Forecast generated with limited results.')
      }
    } catch (err) {
      setForecastError(err?.message || 'Forecast request failed.')
    } finally {
      setForecastLoading(false)
    }
  }

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

      <div style={styles.tabBar}>
        <button
          style={activeTab === 'details' ? { ...styles.tabButton, ...styles.tabButtonActive } : styles.tabButton}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button
          style={activeTab === 'forecast' ? { ...styles.tabButton, ...styles.tabButtonActive } : styles.tabButton}
          onClick={() => setActiveTab('forecast')}
        >
          Forecast
        </button>
      </div>

      {activeTab === 'details' && (
        <>

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
      </>
      )}

      {activeTab === 'forecast' && (
        <div style={styles.forecastSection}>
          <div style={styles.sectionTitle}>FORECAST</div>
          <div style={styles.forecastCard}>
            <p style={styles.forecastText}>
              Generate ML-powered forecasts for electricity and gas prices using 8 trained models predicting 1h, 6h, 24h, and 72h ahead.
            </p>
            <button
              onClick={handleRunForecast}
              disabled={forecastLoading}
              style={styles.forecastButton}
            >
              {forecastLoading ? 'Running forecast…' : 'Run forecast'}
            </button>
            {forecastMessage && (
              <div style={styles.forecastMessage}>{forecastMessage}</div>
            )}
            {forecastError && (
              <div style={styles.forecastError}>{forecastError}</div>
            )}

            {/* Horizon Cards */}
            {forecastData && forecastData.forecasts && (
              <div style={styles.forecastResults}>
                <div style={styles.horizonCardsGrid}>
                  {['1h', '6h', '24h', '72h'].map(horizon => {
                    const elecData = forecastData.forecasts.electricity?.[horizon]
                    if (!elecData) return null

                    const isSelected = selectedHorizon === horizon
                    const isGenerate = elecData.dispatch_decision === 'GENERATE'

                    return (
                      <div
                        key={horizon}
                        onClick={() => setSelectedHorizon(horizon)}
                        style={{
                          ...styles.horizonCard,
                          ...(isSelected ? styles.horizonCardActive : {})
                        }}
                      >
                        <div style={styles.horizonCardTitle}>{horizon} ahead</div>
                        <div style={styles.horizonCardPrice}>${elecData.price}/MWh</div>
                        <div style={styles.horizonCardCost}>BTM Cost: ${elecData.btm_cost}/MWh</div>
                        <div style={{
                          ...styles.horizonCardSpread,
                          color: elecData.spread > 0 ? '#58a6ff' : '#ff7b72'
                        }}>
                          Spread: {elecData.spread > 0 ? '+' : ''}${elecData.spread}/MWh
                        </div>
                        <div style={{
                          ...styles.horizonCardDecision,
                          backgroundColor: isGenerate ? '#238636' : '#da3633',
                          color: '#fff'
                        }}>
                          {elecData.dispatch_decision}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Explainability Panel */}
                <div style={styles.explainabilityPanel}>
                  <div style={styles.explainabilityTitle}>
                    Why did the model predict ${forecastData.forecasts.electricity?.[selectedHorizon]?.price}/MWh for {selectedHorizon} ahead?
                  </div>

                  {forecastData.forecasts.electricity?.[selectedHorizon]?.explanation && (
                    <>
                      <div style={styles.shapChart}>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart
                            data={forecastData.forecasts.electricity[selectedHorizon].explanation.map(item => ({
                              feature: translateFeatureName(item.feature_name, item.value),
                              positive: item.shap_impact > 0 ? item.shap_impact : 0,
                              negative: item.shap_impact < 0 ? item.shap_impact : 0,
                              impact: item.shap_impact
                            }))}
                            layout="horizontal"
                            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                            <XAxis
                              type="number"
                              tick={{ fontSize: 10, fill: '#8b949e' }}
                            />
                            <YAxis
                              type="category"
                              dataKey="feature"
                              tick={{ fontSize: 9, fill: '#8b949e' }}
                              width={180}
                            />
                            <Tooltip
                              contentStyle={{
                                background: '#161b22',
                                border: '1px solid #30363d',
                                fontSize: '11px'
                              }}
                              formatter={(value) => [`${value > 0 ? '+' : ''}${value.toFixed(2)}`, 'SHAP Impact']}
                            />
                            <ReferenceLine x={0} stroke="#8b949e" strokeDasharray="2 2" />
                            <Bar dataKey="positive" stackId="shap" fill="#f0c419" />
                            <Bar dataKey="negative" stackId="shap" fill="#58a6ff" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div style={styles.explanationSummary}>
                        {generateExplanationSummary(forecastData.forecasts.electricity[selectedHorizon].explanation)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
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
  tabBar: {
    display: 'flex',
    gap: '8px',
    padding: '0 16px 12px',
  },
  tabButton: {
    flex: 1,
    background: '#0d1117',
    border: '1px solid #30363d',
    color: '#8b949e',
    padding: '10px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },
  tabButtonActive: {
    background: '#161b22',
    borderColor: '#58a6ff',
    color: '#58a6ff',
  },
  forecastSection: {
    padding: '16px',
    margin: '0 16px 16px',
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: '8px',
  },
  forecastCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  forecastText: {
    color: '#c9d1d9',
    fontSize: '13px',
    lineHeight: '1.6',
  },
  forecastButton: {
    background: '#58a6ff',
    color: '#0d1117',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '13px',
  },
  forecastMessage: {
    color: '#7ee0ff',
    fontSize: '12px',
  },
  forecastError: {
    color: '#ff7b72',
    fontSize: '12px',
  },
  forecastResults: {
    marginTop: '16px',
    padding: '12px',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
  },
  horizonSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  horizonLabel: {
    color: '#8b949e',
    fontSize: '12px',
    fontWeight: '500',
  },
  horizonButton: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  horizonButtonActive: {
    background: '#58a6ff',
    color: '#0d1117',
    borderColor: '#58a6ff',
  },
  forecastGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  forecastItem: {
    padding: '8px',
    background: '#0d1117',
    borderRadius: '4px',
    border: '1px solid #21262d',
  },
  forecastItemLabel: {
    color: '#8b949e',
    fontSize: '10px',
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  forecastItemValue: {
    color: '#c9d1d9',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '2px',
  },
  forecastItemTime: {
    color: '#7d8590',
    fontSize: '9px',
  },
  dataQuality: {
    marginBottom: '12px',
    padding: '8px',
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: '4px',
  },
  dataQualityTitle: {
    color: '#8b949e',
    fontSize: '10px',
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  dataQualityItem: {
    color: '#c9d1d9',
    fontSize: '11px',
  },
  dataQualityWarning: {
    color: '#f0c419',
    fontSize: '11px',
    marginTop: '2px',
  },
  forecastTable: {
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  forecastTableTitle: {
    color: '#8b949e',
    fontSize: '10px',
    fontWeight: '500',
    textTransform: 'uppercase',
    padding: '8px',
    background: '#161b22',
    borderBottom: '1px solid #21262d',
  },
  forecastTableGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
  },
  forecastTableHeader: {
    padding: '6px 8px',
    background: '#21262d',
    color: '#8b949e',
    fontSize: '10px',
    fontWeight: '500',
    borderBottom: '1px solid #30363d',
  },
  forecastTableCell: {
    padding: '6px 8px',
    color: '#c9d1d9',
    fontSize: '11px',
    borderBottom: '1px solid #21262d',
  },
  horizonCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gridTemplateRows: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '16px',
  },
  horizonCard: {
    padding: '10px',
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    minHeight: '90px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  horizonCardActive: {
    borderColor: '#58a6ff',
    background: '#161b22',
  },
  horizonCardTitle: {
    color: '#8b949e',
    fontSize: '10px',
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  horizonCardPrice: {
    color: '#c9d1d9',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '3px',
  },
  horizonCardCost: {
    color: '#8b949e',
    fontSize: '9px',
    marginBottom: '2px',
  },
  horizonCardSpread: {
    fontSize: '10px',
    fontWeight: '500',
    marginBottom: '4px',
  },
  horizonCardDecision: {
    padding: '3px 5px',
    borderRadius: '3px',
    fontSize: '8px',
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    lineHeight: '1.2',
  },
  explainabilityPanel: {
    padding: '16px',
    background: '#0d1117',
    border: '1px solid #21262d',
    borderRadius: '6px',
  },
  explainabilityTitle: {
    color: '#c9d1d9',
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '16px',
    lineHeight: '1.4',
  },
  shapChart: {
    marginBottom: '12px',
  },
  explanationSummary: {
    color: '#8b949e',
    fontSize: '11px',
    fontStyle: 'italic',
    lineHeight: '1.4',
    padding: '8px',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '4px',
  },
  chartHint: {
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
