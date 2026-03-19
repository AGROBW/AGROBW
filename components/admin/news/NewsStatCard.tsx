import React from 'react';
import { LucideIcon } from 'lucide-react';

interface NewsStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
}

const NewsStatCard: React.FC<NewsStatCardProps> = ({ icon: Icon, label, value, hint }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-700">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className="text-2xl font-black text-slate-900">{value}</p>
      </div>
    </div>
    {hint ? <p className="mt-3 text-sm text-slate-500">{hint}</p> : null}
  </div>
);

export default NewsStatCard;
