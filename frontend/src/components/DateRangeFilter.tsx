import { useId } from 'react';
import { DATE_PRESETS, presetRange, type DatePreset } from '@/utils/dateRange';

export type RangePreset = DatePreset | 'custom' | 'all';

export interface RangeValue {
    preset: RangePreset;
    start_date: string;
    end_date: string;
}

export const rangeFromPreset = (preset: RangePreset): RangeValue => (preset === 'custom' || preset === 'all' ? { preset, start_date: '', end_date: '' } : { preset, ...presetRange(preset) });

const control = 'bg-gray-50 border border-gray-50 h-[36px] text-xs rounded-md px-[10px] text-black dark:bg-[#15203c] dark:text-white dark:border-[#15203c] outline-0 focus:border-primary-500';

/** Period filter with the F15 presets (Hari ini … Bulan lalu), "Semua" and a custom start/end (inclusive). */
const DateRangeFilter = ({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) => {
    const id = useId();
    return (
        <>
            <label className="sr-only" htmlFor={`${id}-preset`}>
                Periode
            </label>
            <select id={`${id}-preset`} className={control} value={value.preset} onChange={(e) => onChange(rangeFromPreset(e.target.value as RangePreset))}>
                {DATE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                        {p.label}
                    </option>
                ))}
                <option value="all">Semua tanggal</option>
                <option value="custom">Pilih tanggal…</option>
            </select>
            {value.preset === 'custom' && (
                <>
                    <label className="sr-only" htmlFor={`${id}-start`}>
                        Dari tanggal
                    </label>
                    <input
                        id={`${id}-start`}
                        type="date"
                        className={control}
                        value={value.start_date}
                        max={value.end_date || undefined}
                        onChange={(e) => onChange({ ...value, start_date: e.target.value })}
                    />
                    <span aria-hidden="true">–</span>
                    <label className="sr-only" htmlFor={`${id}-end`}>
                        Sampai tanggal
                    </label>
                    <input
                        id={`${id}-end`}
                        type="date"
                        className={control}
                        value={value.end_date}
                        min={value.start_date || undefined}
                        onChange={(e) => onChange({ ...value, end_date: e.target.value })}
                    />
                </>
            )}
        </>
    );
};

export const filterControlClass = control;

export default DateRangeFilter;
