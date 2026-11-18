import type { ButtonHTMLAttributes } from 'react';

const TONES = {
    primary: 'text-primary-500 hover:bg-primary-50 dark:hover:bg-[#15203c]',
    danger: 'text-danger-500 hover:bg-danger-50 dark:hover:bg-[#15203c]',
    success: 'text-success-600 hover:bg-success-50 dark:hover:bg-[#15203c]',
    gray: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#15203c]',
};

export const iconButtonClass = (tone: keyof typeof TONES = 'primary') =>
    `inline-flex items-center justify-center w-[32px] h-[32px] rounded-md transition-all disabled:opacity-50 disabled:pointer-events-none ${TONES[tone]}`;

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    /** material-symbols icon name */
    icon: string;
    /** Accessible name; also shown as tooltip. */
    label: string;
    tone?: keyof typeof TONES;
}

/** Square icon-only action button used in table rows. Use iconButtonClass() for a Link with the same look. */
const IconButton = ({ icon, label, tone = 'primary', className = '', type = 'button', ...rest }: IconButtonProps) => (
    <button type={type} className={`${iconButtonClass(tone)} ${className}`} aria-label={label} title={label} {...rest}>
        <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
            {icon}
        </i>
    </button>
);

export default IconButton;
