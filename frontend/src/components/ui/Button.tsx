import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'danger' | 'success' | 'secondary' | 'outline';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-primary-500 text-white border-primary-500 hover:bg-primary-400 hover:border-primary-400',
    danger: 'bg-danger-500 text-white border-danger-500 hover:bg-danger-400 hover:border-danger-400',
    success: 'bg-success-600 text-white border-success-600 hover:bg-success-700 hover:border-success-700',
    secondary: 'bg-gray-100 text-black border-gray-100 hover:bg-gray-200 hover:border-gray-200 dark:bg-[#15203c] dark:text-white dark:border-[#15203c]',
    outline: 'bg-transparent text-primary-500 border-primary-500 hover:bg-primary-500 hover:text-white',
};

const SIZES = {
    md: 'py-[10px] md:py-[12px] px-[20px] md:px-[22px]',
    sm: 'py-[6px] px-[14px] text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: keyof typeof SIZES;
    /** material-symbols icon name */
    icon?: string;
    loading?: boolean;
    children?: ReactNode;
}

const Button = ({ variant = 'primary', size = 'md', icon, loading = false, disabled, className = '', children, type = 'button', ...rest }: ButtonProps) => (
    <button
        type={type}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-[6px] font-medium rounded-md border transition-all disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
        {...rest}
    >
        {loading ? (
            <i className="material-symbols-outlined !text-[20px] animate-spin" aria-hidden="true">
                progress_activity
            </i>
        ) : (
            icon && (
                <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                    {icon}
                </i>
            )
        )}
        {children}
    </button>
);

export default Button;
