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
    'inline-flex min-h-[42px] lg:min-h-0 items-center justify-center font-bold rounded-xl transition-all duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/80 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer btn-luxury-ripple';

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-gradient-to-r from-[#d4a84e] via-[#c5933d] to-[#a47430] hover:from-[#e2be76] hover:via-[#d4a84e] hover:to-[#b88334] text-slate-950 font-black border border-gold-300/40 shadow-lg shadow-gold-950/50 hover:shadow-xl hover:shadow-gold-500/25 hover:-translate-y-0.5 active:translate-y-0',
    secondary:
      'bg-slate-900/70 hover:bg-slate-850/90 text-slate-200 hover:text-gold-200 border border-white/10 hover:border-gold-500/50 shadow-md shadow-black/40 hover:shadow-gold-950/30 backdrop-blur-md hover:-translate-y-0.5 active:translate-y-0',
    success:
      'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-400/30 shadow-lg shadow-emerald-950/50 hover:shadow-emerald-900/30 hover:-translate-y-0.5 active:translate-y-0',
    warning:
      'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black border border-amber-300/40 shadow-lg shadow-amber-950/50 hover:-translate-y-0.5 active:translate-y-0',
    danger:
      'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border border-rose-400/30 shadow-lg shadow-rose-950/50 hover:-translate-y-0.5 active:translate-y-0',
    ghost:
      'bg-transparent hover:bg-white/[0.05] text-slate-300 hover:text-gold-300 border border-transparent hover:border-gold-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0',
    outline:
      'bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-copper-400/50 text-slate-200 hover:text-copper-200 shadow-sm backdrop-blur-md hover:-translate-y-0.5 active:translate-y-0',
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
