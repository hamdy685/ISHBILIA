import React from 'react';
import { Link } from 'react-router-dom';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  to?: string;
  isActive?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, to, isActive }) => {
  const isClickable = Boolean(onClick || to);
  const activeClasses = isActive
    ? 'ring-2 ring-gold-400/80 border-gold-400/80 bg-slate-850/90 shadow-gold-950/40'
    : '';
  const clickableClasses = isClickable
    ? 'cursor-pointer hover:border-gold-500/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/70 active:scale-[0.98]'
    : '';

  const content = (
    <div
      onClick={onClick}
      className={`bg-slate-900/75 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl shadow-black/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all duration-300 ${clickableClasses} ${activeClasses} ${className}`}
    >
      {children}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block no-underline">
        {content}
      </Link>
    );
  }

  return content;
};

export interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  subtext?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  accentColor?: 'gold' | 'copper' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'purple' | 'slate' | 'orange' | 'violet';
  className?: string;
  onClick?: () => void;
  to?: string;
  isActive?: boolean;
  clickableHint?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  icon,
  subtext,
  trend,
  accentColor = 'gold',
  className = '',
  onClick,
  to,
  isActive = false,
  clickableHint,
}) => {
  const isInteractive = Boolean(onClick || to);

  const accentClasses: Record<string, { iconBg: string; text: string; glow: string; activeBorder: string }> = {
    gold: { iconBg: 'bg-gold-950/80 text-gold-300 border-gold-500/40 shadow-inner', text: 'text-gold-400', glow: 'group-hover:border-gold-400/60', activeBorder: 'ring-2 ring-gold-400/80 border-gold-400/80' },
    copper: { iconBg: 'bg-copper-950/80 text-copper-300 border-copper-500/40 shadow-inner', text: 'text-copper-400', glow: 'group-hover:border-copper-400/60', activeBorder: 'ring-2 ring-copper-400/80 border-copper-400/80' },
    cyan: { iconBg: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60', text: 'text-cyan-400', glow: 'group-hover:border-cyan-500/50', activeBorder: 'ring-2 ring-cyan-500/80 border-cyan-400/80' },
    emerald: { iconBg: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60', text: 'text-emerald-400', glow: 'group-hover:border-emerald-500/50', activeBorder: 'ring-2 ring-emerald-500/80 border-emerald-400/80' },
    amber: { iconBg: 'bg-amber-950/60 text-amber-400 border-amber-800/60', text: 'text-amber-400', glow: 'group-hover:border-amber-500/50', activeBorder: 'ring-2 ring-amber-500/80 border-amber-400/80' },
    rose: { iconBg: 'bg-rose-950/60 text-rose-400 border-rose-800/60', text: 'text-rose-400', glow: 'group-hover:border-rose-500/50', activeBorder: 'ring-2 ring-rose-500/80 border-rose-400/80' },
    indigo: { iconBg: 'bg-indigo-950/60 text-indigo-400 border-indigo-800/60', text: 'text-indigo-400', glow: 'group-hover:border-indigo-500/50', activeBorder: 'ring-2 ring-indigo-500/80 border-indigo-400/80' },
    purple: { iconBg: 'bg-purple-950/60 text-purple-400 border-purple-800/60', text: 'text-purple-400', glow: 'group-hover:border-purple-500/50', activeBorder: 'ring-2 ring-purple-500/80 border-purple-400/80' },
    orange: { iconBg: 'bg-orange-950/60 text-orange-400 border-orange-800/60', text: 'text-orange-400', glow: 'group-hover:border-orange-500/50', activeBorder: 'ring-2 ring-orange-500/80 border-orange-400/80' },
    violet: { iconBg: 'bg-violet-950/60 text-violet-400 border-violet-800/60', text: 'text-violet-400', glow: 'group-hover:border-violet-500/50', activeBorder: 'ring-2 ring-violet-500/80 border-violet-400/80' },
    slate: { iconBg: 'bg-slate-800/80 text-slate-300 border-slate-700/60', text: 'text-slate-300', glow: 'group-hover:border-slate-600', activeBorder: 'ring-2 ring-slate-400/80 border-slate-300/80' },
  };

  const accent = accentClasses[accentColor] || accentClasses.gold;

  const cardElement = (
    <Card
      onClick={onClick}
      isActive={isActive}
      className={`relative overflow-hidden group select-none transition-all ${accent.glow} ${
        isActive ? `${accent.activeBorder} shadow-lg shadow-gold-950/40` : ''
      } ${isInteractive ? 'hover:scale-[1.02] cursor-pointer' : ''} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">{title}</p>
            {isInteractive && (
              <span className="text-[10px] text-slate-500 group-hover:text-gold-400 group-hover:translate-x-[-2px] transition-all opacity-0 group-hover:opacity-100">
                ←
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-100 tracking-tight group-hover:text-white transition-colors">{value}</div>
            {trend && (
              <span className={`text-[11px] font-black ${trend.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trend.isPositive ? '↑' : '↓'} {trend.value}
              </span>
            )}
          </div>
          {subtext && <p className="text-[11px] text-slate-500 font-medium">{subtext}</p>}
          {clickableHint && (
            <p className="text-[10px] text-gold-400/90 font-semibold group-hover:text-gold-300 transition-colors">
              {clickableHint}
            </p>
          )}
        </div>
        {icon && (
          <div className={`p-2.5 rounded-xl border ${accent.iconBg} transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-inner`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block no-underline">
        {cardElement}
      </Link>
    );
  }

  return cardElement;
};

export interface KpiPillProps {
  title: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accentColor?: 'gold' | 'copper' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'purple' | 'slate' | 'orange' | 'violet';
  isActive?: boolean;
  onClick?: () => void;
  to?: string;
  clickableHint?: string;
  className?: string;
}

export const KpiPill: React.FC<KpiPillProps> = ({
  title,
  value,
  icon,
  accentColor = 'gold',
  isActive = false,
  onClick,
  to,
  clickableHint,
  className = '',
}) => {
  const isInteractive = Boolean(onClick || to);

  const colorMap: Record<string, string> = {
    gold: isActive
      ? 'bg-gold-950/90 text-gold-200 border-gold-400 ring-2 ring-gold-500/40 shadow-md shadow-gold-950/50'
      : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-gold-500/60 hover:text-gold-300',
    copper: isActive
      ? 'bg-copper-950/90 text-copper-200 border-copper-400 ring-2 ring-copper-500/40 shadow-md shadow-copper-950/50'
      : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-copper-500/60 hover:text-copper-300',
    cyan: isActive
      ? 'bg-cyan-950/90 text-cyan-200 border-cyan-400 ring-2 ring-cyan-500/40 shadow-md shadow-cyan-950/50'
      : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-cyan-500/60 hover:text-cyan-300',
    emerald: isActive
      ? 'bg-emerald-950/90 text-emerald-200 border-emerald-400 ring-2 ring-emerald-500/40 shadow-md shadow-emerald-950/50'
      : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-emerald-500/60 hover:text-emerald-300',
    amber: isActive
      ? 'bg-amber-950/90 text-amber-200 border-amber-400 ring-2 ring-amber-500/40 shadow-md shadow-amber-950/50'
      : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-amber-500/60 hover:text-amber-300',
    rose: isActive
      ? 'bg-rose-950/90 text-rose-200 border-rose-400 ring-2 ring-rose-500/40 shadow-md shadow-rose-950/50'
      : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-rose-500/60 hover:text-rose-300',
    indigo: isActive
      ? 'bg-indigo-950/90 text-indigo-200 border-indigo-400 ring-2 ring-indigo-500/40 shadow-md shadow-indigo-950/50'
      : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-indigo-500/60 hover:text-indigo-300',
    slate: isActive
      ? 'bg-slate-800 text-white border-slate-400 ring-2 ring-slate-400/40'
      : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200',
  };

  const theme = colorMap[accentColor] || colorMap.cyan;

  const content = (
    <button
      type="button"
      onClick={onClick}
      title={clickableHint || title}
      className={`inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border text-xs font-bold transition-all shrink-0 whitespace-nowrap shadow-sm select-none cursor-pointer active:scale-95 ${theme} ${className}`}
    >
      {icon && <span className="text-sm shrink-0">{icon}</span>}
      <span className="text-[11px] font-semibold opacity-90">{title}:</span>
      <span className="font-mono font-black text-sm">{value}</span>
    </button>
  );

  if (to) {
    return (
      <Link to={to} className="shrink-0 no-underline">
        {content}
      </Link>
    );
  }

  return content;
};

export const KpiPillsBar: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth flex-nowrap sm:flex-wrap ${className}`}
    dir="rtl"
  >
    {children}
  </div>
);

export default Card;

