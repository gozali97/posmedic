import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { FieldWrapper, fieldBorder, fieldClass } from './Input';

export interface SelectOption {
    value: string | number;
    label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: ReactNode;
    options: SelectOption[];
    /** Text of an empty first option; omit to force a choice from `options`. */
    placeholder?: string;
    wrapperClassName?: string;
}

const Select = ({ label, error, hint, options, placeholder, wrapperClassName, id, required, className = '', ...rest }: SelectProps) => {
    const autoId = useId();
    const selectId = id ?? autoId;

    return (
        <FieldWrapper id={selectId} label={label} required={required} error={error} hint={hint} className={wrapperClassName}>
            <select
                id={selectId}
                required={required}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${selectId}-error` : undefined}
                className={`${fieldClass} ${fieldBorder(error)} !px-[14px] cursor-pointer ${className}`}
                {...rest}
            >
                {placeholder !== undefined && <option value="">{placeholder}</option>}
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </FieldWrapper>
    );
};

export default Select;
