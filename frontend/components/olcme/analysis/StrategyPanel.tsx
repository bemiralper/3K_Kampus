'use client';

import type { StrategyItem } from '../types';
import s from '../../../app/admin/olcme-degerlendirme/olcme.module.css';

export default function StrategyPanel({ strategies }: { strategies: StrategyItem[] }) {
  if (!strategies.length) return <div className={s.analysisEmpty}>Yeterli veri ile strateji üretilemedi.</div>;

  return (
    <div className={s.analysisPanel}>
      <h3 className={s.analysisPanelTitle}>Strateji Önerileri</h3>
      <div className={s.strategyList}>
        {strategies.map((st, i) => (
          <div key={i} className={`${s.strategyCard} ${st.type === 'warning' ? s.strategyWarning : st.type === 'success' ? s.strategySuccess : s.strategyInfo}`}>
            <div className={s.strategyIcon}>{st.icon}</div>
            <div>
              <div className={s.strategyTitle}>{st.title}</div>
              <div className={s.strategyMessage}>{st.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
