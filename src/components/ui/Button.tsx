import React, { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText = 'جاري التنفيذ، انتظر لحظات...',
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex min-h-[42px] lg:min-h-0 items-center justify-center font-bold rounded-xl transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-gradient-to-b from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 active:from-cyan-600 active:to-cyan-700 text-white border border-cyan-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] shadow-md shadow-cyan-950/60 hover:shadow-lg hover:shadow-cyan-900/40',
    secondary:
      'bg-gradient-to-b from-slate-800 to-slate-850 hover:from-slate-750 hover:to-slate-800 text-slate-200 border border-slate-700/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] shadow-sm hover:border-slate-600 hover:text-white',
    success:
      'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 text-white border border-emerald-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] shadow-md shadow-emerald-950/60 hover:shadow-lg hover:shadow-emerald-900/40',
    warning:
      'bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:from-amber-500 active:to-amber-600 text-slate-950 font-black border border-amber-300/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] shadow-md shadow-amber-950/60 hover:shadow-lg hover:shadow-amber-900/40',
    danger:
      'bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 active:from-rose-600 active:to-rose-700 text-white border border-rose-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] shadow-md shadow-rose-950/60 hover:shadow-lg hover:shadow-rose-900/40',
    ghost:
      'bg-transparent hover:bg-slate-800/80 text-slate-300 hover:text-white border border-transparent hover:border-slate-700/60 transition-colors',
    outline:
      'bg-slate-900/40 hover:bg-slate-800/80 border border-slate-700/80 hover:border-slate-600 text-slate-200 hover:text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  };

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
    md: 'px-4 py-2 text-xs gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2.5 rounded-2xl',
  };

  return (
    <button
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      aria-disabled={disabled || isLoading || undefined}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>{loadingText}</span>
        </>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {!isLoading && children && <span>{children}</span>}
    </button>
  );
};

export default Button;
