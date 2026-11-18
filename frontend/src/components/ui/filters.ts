import { fieldClass } from './Input';

/** Compact select/input for the filter row above a table. */
export const filterClass = `${fieldClass} border-gray-200 dark:border-[#172036] !h-[40px] !px-[12px] text-sm`;

/** Dense input for editable table rows (units, purchase items, opname counts). */
export const cellInputClass = `${fieldClass} border-gray-200 dark:border-[#172036] !h-[38px] !px-[10px] text-sm min-w-[80px]`;

/** "" → null, otherwise the trimmed text: optional text fields sent to the backend. */
export const nullable = (s: string): string | null => s.trim() || null;
