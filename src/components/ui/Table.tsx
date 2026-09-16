import React from 'react';

export interface TableProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string | number;
}

export const Table: React.FC<TableProps> = ({ children, className = '', minWidth = '650px' }) => {
  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-width:thin] rounded-2xl border border-slate-800/90 bg-slate-900/70 shadow-xl shadow-slate-950/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md">
      <table
        style={{ minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth }}
        className={`w-full text-right text-xs text-slate-200 border-collapse ${className}`}
      >
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <thead className={`sticky top-0 z-10 bg-slate-950/95 text-slate-300 font-bold border-b border-slate-800 shadow-sm backdrop-blur-sm ${className}`}>
      {children}
    </thead>
  );
};

export const TableBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <tbody className={`divide-y divide-slate-800/50 ${className}`}>{children}</tbody>;
};

export const TableRow: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({
  children,
  className = '',
  onClick,
}) => {
  return (
    <tr
      onClick={onClick}
      className={`hover:bg-slate-800/45 transition-colors duration-150 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </tr>
  );
};

export const TableHead: React.FC<{ children?: React.ReactNode; className?: string; colSpan?: number; style?: React.CSSProperties }> = ({
  children,
  className = '',
  colSpan,
  style,
}) => {
  return (
    <th
      scope="col"
      colSpan={colSpan}
      style={{ wordBreak: 'normal', overflowWrap: 'normal', ...style }}
      className={`whitespace-nowrap px-3.5 py-3 text-xs font-bold text-slate-300 sm:px-4 sm:py-3.5 ${className}`}
    >
      {children}
    </th>
  );
};

export const TableCell: React.FC<{ children?: React.ReactNode; className?: string; colSpan?: number; style?: React.CSSProperties }> = ({
  children,
  className = '',
  colSpan,
  style,
}) => {
  return (
    <td
      colSpan={colSpan}
      style={{ wordBreak: 'normal', overflowWrap: 'break-word', ...style }}
      className={`px-3.5 py-3 sm:px-4 sm:py-3.5 text-xs text-slate-200 ${className}`}
    >
      {children}
    </td>
  );
};

export default Table;
