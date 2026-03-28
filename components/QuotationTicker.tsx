import React, { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Quotation } from '../types';
import { getQuotations } from '../services/quotationService';

const QuotationTicker: React.FC = () => {
  const [items, setItems] = useState<Quotation[]>([]);

  useEffect(() => {
    const load = async () => {
      const data = await getQuotations();
      setItems(data);
    };

    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="bg-slate-900 border-b border-slate-800 py-2 overflow-hidden group">
      <div className="flex whitespace-nowrap animate-ticker group-hover:pause-ticker">
        {[...items, ...items].map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="inline-flex items-center px-6 border-r border-slate-700 last:border-none">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tighter mr-2">{item.name}</span>
            <span className="text-sm font-semibold text-white mr-2">
              {item.id === 'usd-brl-bcb' ? `R$ ${item.value}` : item.value}
            </span>
            {item.unit && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mr-2">
                {item.unit}
              </span>
            )}
            <span
              className={`text-[11px] font-semibold flex items-center ${
                item.trend === 'up' ? 'text-green-500' : item.trend === 'down' ? 'text-red-500' : 'text-slate-400'
              }`}
            >
              {item.trend === 'up' && <TrendingUp className="w-3 h-3 mr-0.5" strokeWidth={1.5} />}
              {item.trend === 'down' && <TrendingDown className="w-3 h-3 mr-0.5" strokeWidth={1.5} />}
              {item.change !== 0 && `${item.change > 0 ? '+' : ''}${item.change}%`}
              {item.change === 0 && 'Estável'}
            </span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          display: flex;
          width: fit-content;
          animation: ticker 40s linear infinite;
        }
        .group-hover\\:pause-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default QuotationTicker;
