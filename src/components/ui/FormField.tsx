import React, { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface FormFieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  helperText,
  required,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="flex items-center justify-between text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1">
            {label}
            {required && <span className="text-rose-400 font-black text-sm">*</span>}
          </span>
          {required && (
            <span className="text-[10px] text-slate-500 font-medium">(إلزامي)</span>
          )}
        </label>
      )}
      {children}
      {error && (
        <p className="text-[11px] font-bold text-rose-400 flex items-center gap-1 animate-fade-in">
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      )}
      {helperText && !error && (
        <p className="text-[11px] text-slate-400 leading-normal">{helperText}</p>
      )}
    </div>
  );
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`min-h-11 w-full min-w-0 rounded-xl border bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.35)] transition-all duration-200 focus:outline-none lg:min-h-0 lg:rounded-lg lg:py-2 lg:text-xs ${
          error
            ? 'border-rose-500/80 bg-rose-950/20 text-rose-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/25'
            : 'border-slate-700/70 hover:border-slate-600 focus:border-cyan-400/90 focus:ring-2 focus:ring-cyan-500/25'
        } ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', error, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`min-h-11 w-full min-w-0 rounded-xl border bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.35)] transition-all duration-200 focus:outline-none lg:min-h-0 lg:rounded-lg lg:py-2 lg:text-xs cursor-pointer ${
          error
            ? 'border-rose-500/80 bg-rose-950/20 text-rose-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/25'
            : 'border-slate-700/70 hover:border-slate-600 focus:border-cyan-400/90 focus:ring-2 focus:ring-cyan-500/25'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`min-h-[100px] w-full min-w-0 rounded-xl border bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.35)] transition-all duration-200 focus:outline-none lg:min-h-[80px] lg:rounded-lg lg:py-2 lg:text-xs ${
          error
            ? 'border-rose-500/80 bg-rose-950/20 text-rose-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/25'
            : 'border-slate-700/70 hover:border-slate-600 focus:border-cyan-400/90 focus:ring-2 focus:ring-cyan-500/25'
        } ${className}`}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { SearchableSelect } from './SearchableSelect';
export type { SearchableOption, SearchableSelectProps } from './SearchableSelect';

export default FormField;
