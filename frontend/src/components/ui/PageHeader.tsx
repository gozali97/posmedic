import type { ReactNode } from 'react';
import { Link } from 'react-router';

export interface Crumb {
    label: string;
    to?: string;
}

interface PageHeaderProps {
    title: string;
    breadcrumbs?: Crumb[];
    actions?: ReactNode;
}

/** Page title + breadcrumb row used at the top of every Trezo page. */
const PageHeader = ({ title, breadcrumbs = [], actions }: PageHeaderProps) => (
    <div className="mb-[25px] md:flex items-center justify-between gap-[15px]">
        <div>
            <h5 className="!mb-0">{title}</h5>
            {breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb">
                    <ol className="breadcrumb mt-[8px] flex flex-wrap items-center gap-x-[26px] text-sm">
                        {breadcrumbs.map((c, i) => (
                            <li key={`${c.label}-${i}`} className="breadcrumb-item relative">
                                {c.to ? (
                                    <Link to={c.to} className="transition-all hover:text-primary-500">
                                        {c.label}
                                    </Link>
                                ) : (
                                    <span className="text-black dark:text-white" aria-current="page">
                                        {c.label}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ol>
                </nav>
            )}
        </div>
        {actions && <div className="mt-[15px] md:mt-0 flex flex-wrap items-center gap-[10px]">{actions}</div>}
    </div>
);

export default PageHeader;
