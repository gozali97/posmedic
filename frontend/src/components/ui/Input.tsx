import { useId, useState, type ComponentProps, type ReactNode } from 'react';

export const fieldClass =
    'h-[55px] rounded-md text-black dark:text-white border bg-white dark:bg-[#0c1427] px-[17px] block w-full outline-0 transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:border-primary-500 disabled:bg-gray-50 disabled:cursor-not-allowed dark:disabled:bg-[#15203c]';

export const fieldBorder = (error?: string) => (error ? 'border-danger-500' : 'border-gray-200 dark:border-[#172036]');

interface FieldWrapperProps {
    id: string;
    label?: string;
    required?: boolean;
    error?: string;
    hint?: ReactNode;
    className?: string;
    children: ReactNode;
}

export const FieldWrapper = ({ id, label, required, error, hint, className = '', children }: FieldWrapperProps) => (
    <div className={`relative ${className}`}>
        {label && (
            <label htmlFor={id} className="mb-[10px] text-black dark:text-white font-medium block">
                {label}
                {required && <span className="text-danger-500"> *</span>}
            </label>
        )}
        {children}
        {error ? (
            <p id={`${id}-error`} className="!mt-[6px] !mb-0 text-sm text-danger-500" role="alert">
                {error}
            </p>
        ) : (
            hint && <p className="!mt-[6px] !mb-0 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
        )}
    </div>
);

interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
    label?: string;
    error?: string;
    hint?: ReactNode;
    wrapperClassName?: string;
}

const Input = ({ label, error, hint, wrapperClassName, id, type = 'text', className = '', required, ref, ...rest }: InputProps) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [revealed, setRevealed] = useState(false);
    const isPassword = type === 'password';

    return (
        <FieldWrapper id={inputId} label={label} required={required} error={error} hint={hint} className={wrapperClassName}>
            <div className="relative">
                <input
                    ref={ref}
                    id={inputId}
                    type={isPassword && revealed ? 'text' : type}
                    required={required}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${inputId}-error` : undefined}
                    className={`${fieldClass} ${fieldBorder(error)} ${isPassword ? 'pr-[50px]' : ''} ${className}`}
                    {...rest}
                />
                {isPassword && (
                    <button
                        type="button"
                        className="absolute right-[15px] top-1/2 -translate-y-1/2 leading-none transition-all hover:text-primary-500"
                        onClick={() => setRevealed((v) => !v)}
                        aria-label={revealed ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                        <i className="material-symbols-outlined !text-[20px]">{revealed ? 'visibility_off' : 'visibility'}</i>
                    </button>
                )}
            </div>
        </FieldWrapper>
    );
};

export default Input;
