import { useState } from 'react';
import { STAT_NAMES } from '../engine';

const PAGES = [
  { id:'playground',        icon:'⚗️',  label:'Playground Analyser',  group:'Analyse' },
  { id:'bruteforce',        icon:'🔬',  label:'Bruteforcing Analyser', group:'Analyse' },
  { id:'betting-analyser',  icon:'📊',  label:'Odds Analyser',         group:'Betting' },
  { id:'betting-simulator', icon:'🎲',  label:'Betting Simulator',     group:'Betting' },
  { id:'edge-analyser',     icon:'🎯',  label:'Edge Analyser',         group:'Betting' },
];

// A-side stats for modifier select (even indices only)
const MODIFIER_OPTIONS = [
  { label:'— Aucun —', value:-1 },
  { label:'rest',       value:0  },
  { label:'density',    value:2  },
  { label:'streak',     value:4  },
  { label:'W_s',        value:6  },
  { label:'ORTG_s',     value:8  },
  { label:'DRTG_s',     value:10 },
  { label:'MOV_s',      value:12 },
  { label:'elo',        value:14 },
  { label:'ORTG_l3',    value:16 },
  { label:'DRTG_l3',    value:18 },
  { label:'MOV_l3',     value:20 },
  { label:'ORTG_l10',   value:22 },
  { label:'DRTG_l10',   value:24 },
  { label:'MOV_l10',    value:26 },
];

const S = {
  sidebar: {
    width: 230, minWidth: 230, background: '#0d1117', borderRight: '1px solid #21262d',
    display: 'flex', flexDirection: 'column', userSelect: 'none',
  },
  logo: { padding: '22px 20px 18px', borderBottom: '1px solid #21262d' },
  logoTop: { fontFamily:"'JetBrains Mono', monospace", fontWeight: 700, fontSize: 11, color: '#f59e0b', letterSpacing: 3, textTransform: 'uppercase' },
  logoSub: { fontFamily:"'JetBrains Mono', monospace", fontWeight: 400, fontSize: 10, color: '#484f58', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  nav: { padding: '12px 0', flex: 1, overflowY: 'auto' },
  group: { padding: '8px 20px 4px', fontSize: 10, fontWeight: 600, color: '#484f58', letterSpacing: 2, textTransform: 'uppercase' },
  btn: a => ({
    width: '100%', background: a ? 'rgba(245,158,11,.06)' : 'none', border: 'none',
    borderLeft: `2px solid ${a ? '#f59e0b' : 'transparent'}`,
    color: a ? '#e6edf3' : '#8b949e',
    padding: '10px 20px', cursor: 'pointer', textAlign: 'left',
    fontSize: 14, fontWeight: a ? 500 : 400,
    display: 'flex', alignItems: 'center', gap: 10,
    transition: 'all .15s',
  }),
  divider: { margin: '8px 20px', height: 1, background: '#21262d' },
};

const groups = [...new Set(PAGES.map(p => p.group))];

export default function Sidebar({
  current, onSelect,
  statsFileName, hasOdds, nMatches,
  onChangeStats,
  threshModStat, quantileMode,
  onThreshModChange, onQuantileModeChange,
}) {
  const [modOpen, setModOpen] = useState(false);

  return (
    <div style={S.sidebar}>
      <div style={S.logo}>
        <div style={S.logoTop}>Formula</div>
        <div style={S.logoTop}>Playground</div>
        <div style={S.logoSub}>NBA Analytics V3</div>
      </div>

      <div style={S.nav}>
        {groups.map((group, gi) => (
          <div key={group}>
            {gi > 0 && <div style={S.divider} />}
            <div style={S.group}>{group}</div>
            {PAGES.filter(p => p.group === group).map(p => (
              <button key={p.id} style={S.btn(current === p.id)} onClick={() => onSelect(p.id)}>
                <span style={{ fontSize: 16 }}>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        ))}

        <div style={S.divider} />

        {/* Threshold modifier config */}
        <div style={{ padding: '8px 20px 4px', fontSize: 10, fontWeight: 600, color: '#484f58', letterSpacing: 2, textTransform: 'uppercase' }}>
          Threshold Modifier
        </div>
        <div style={{ padding: '6px 16px 10px' }}>
          <select
            value={threshModStat}
            onChange={e => onThreshModChange(Number(e.target.value))}
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 11,
              background: '#161b22', border: '1px solid #30363d', color: '#e6edf3', marginBottom: 6,
            }}
          >
            {MODIFIER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {threshModStat >= 0 && (
            <div style={{ display:'flex', gap:5 }}>
              {[['Entier', false],['Quantile', true]].map(([label, q]) => (
                <button key={label} onClick={() => onQuantileModeChange(q)} style={{
                  flex:1, padding:'4px', borderRadius:4, fontSize:10, fontWeight:600, cursor:'pointer',
                  background: quantileMode===q ? '#132b50' : '#0d1117',
                  border:`1px solid ${quantileMode===q ? '#60a5fa' : '#21262d'}`,
                  color: quantileMode===q ? '#60a5fa' : '#484f58',
                }}>{label}</button>
              ))}
            </div>
          )}
          {threshModStat >= 0 && (
            <div style={{ fontSize:10, color:'#f59e0b', marginTop:6, lineHeight:1.4 }}>
              Modifier: {STAT_NAMES[threshModStat]} − {STAT_NAMES[threshModStat+1]}
            </div>
          )}
        </div>
      </div>

      {/* Footer: dataset info + change button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #21262d' }}>
        <div style={{ fontSize: 10, color: '#484f58', marginBottom: 6, fontFamily:"'JetBrains Mono', monospace" }}>
          {statsFileName ? `📄 ${statsFileName.replace('.json','')}` : ''}
        </div>
        <div style={{ fontSize: 10, color: '#484f58', marginBottom: 8 }}>
          {nMatches?.toLocaleString('fr-FR')} matchs
          {' '}· {hasOdds ? '✓ odds' : '— pas d\'odds'}
        </div>
        <button onClick={onChangeStats} style={{
          width: '100%', padding: '6px', borderRadius: 5, fontSize: 11, fontWeight: 600,
          background: '#0d1117', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer',
        }}>
          🔄 Changer de dataset stats
        </button>
      </div>
    </div>
  );
}
