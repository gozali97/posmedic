import type { ReactNode } from 'react';

interface CardProps {
    title?: ReactNode;
    /** Right side of the header: buttons, search box. */
    actions?: ReactNode;
    className?: string;
    children: ReactNode;
}

/** Trezo `trezo-card`. */
const Card = ({ title, actions, className = '', children }: CardProps) => (
    <div className={`trezo-card bg-white dark:bg-[#0c1427] mb-[25px] p-[20px] md:p-[25px] rounded-md ${className}`}>
        {(title || actions) && (
            <div className="trezo-card-header mb-[20px] md:mb-[25px] sm:flex sm:items-center sm:justify-between gap-[15px]">
                {title && (
                    <div className="trezo-card-title">
                        <h5 className="!mb-0">{title}</h5>
                    </div>
                )}
                {actions && <div className="trezo-card-subtitle mt-[13px] sm:mt-0 flex flex-wrap items-center gap-[10px]">{actions}</div>}
            </div>
        )}
        <div className="trezo-card-content">{children}</div>
    </div>
);

export default Card;
