import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label: ReactNode;
    description?: ReactNode;
}

/** Trezo `.form-check` checkbox. */
const Checkbox = ({ label, description, id, className = '', ...rest }: CheckboxProps) => {
    const autoId = useId();
    const inputId = id ?? autoId;

    return (
        <div className={`form-check flex items-start gap-[10px] ${className}`}>
            <input id={inputId} type="checkbox" className="mt-[4px]" {...rest} />
            <label htmlFor={inputId} className="cursor-pointer">
                <span className="block text-black dark:text-white font-medium">{label}</span>
                {description && <span className="block text-sm text-gray-500 dark:text-gray-400">{description}</span>}
            </label>
        </div>
    );
};

export default Checkbox;
