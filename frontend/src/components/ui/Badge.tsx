import type { ReactNode } from 'react';

export type BadgeColor = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'gray' | 'purple' | 'orange';

const COLORS: Record<BadgeColor, string> = {
    primary: 'bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300',
    success: 'bg-success-50 text-success-700 dark:bg-success-900/40 dark:text-success-300',
    danger: 'bg-danger-50 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300',
    warning: 'bg-warning-50 text-warning-900 dark:bg-warning-900/40 dark:text-warning-300',
    info: 'bg-info-50 text-info-800 dark:bg-info-900/40 dark:text-info-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-[#15203c] dark:text-gray-300',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

interface BadgeProps {
    color?: BadgeColor;
    className?: string;
    children: ReactNode;
}

const Badge = ({ color = 'primary', className = '', children }: BadgeProps) => (
    <span className={`inline-block px-[8px] py-[2px] rounded-sm font-medium text-xs whitespace-nowrap ${COLORS[color]} ${className}`}>{children}</span>
);

export default Badge;
