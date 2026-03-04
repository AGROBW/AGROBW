import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  variant?: 'default' | 'small' | 'icon-only';
  className?: string;
}

const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ 
  variant = 'default',
  className = '' 
}) => {
  if (variant === 'icon-only') {
    return (
      <div 
        className={`inline-flex items-center justify-center ${className}`}
        title="Vendedor Verificado"
      >
        <ShieldCheck 
          className="w-5 h-5 text-emerald-600 fill-emerald-100" 
          strokeWidth={2}
        />
      </div>
    );
  }

  if (variant === 'small') {
    return (
      <span 
        className={`inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-semibold text-emerald-700 ${className}`}
      >
        <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
        Verificado
      </span>
    );
  }

  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 border border-emerald-300 rounded-full text-sm font-semibold text-emerald-700 shadow-sm ${className}`}
    >
      <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
      Vendedor Verificado
    </span>
  );
};

export default VerifiedBadge;
