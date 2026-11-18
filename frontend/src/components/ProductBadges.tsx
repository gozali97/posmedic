import Badge, { type BadgeColor } from '@/components/ui/Badge';
import { DRUG_CLASSES, type ExpiryStatus, type StockStatus } from '@/types/master.types';
import { formatDate } from '@/utils/format';

// Colours follow the Indonesian drug-class marks: green circle (bebas), blue (bebas terbatas), red K (keras).
const DRUG_CLASS_COLOR: Record<string, BadgeColor> = {
    bebas: 'success',
    bebas_terbatas: 'info',
    keras: 'danger',
    narkotika: 'purple',
    psikotropika: 'orange',
    non_obat: 'gray',
};

export const drugClassLabel = (value: string): string => DRUG_CLASSES.find((c) => c.value === value)?.label ?? value;

export const DrugClassBadge = ({ value, className }: { value: string; className?: string }) => (
    <Badge color={DRUG_CLASS_COLOR[value] ?? 'gray'} className={className}>
        {drugClassLabel(value)}
    </Badge>
);

const STOCK: Record<StockStatus, { label: string; color: BadgeColor }> = {
    out: { label: 'Habis', color: 'danger' },
    low: { label: 'Menipis', color: 'warning' },
    ok: { label: 'Aman', color: 'success' },
};

export const StockStatusBadge = ({ status }: { status: StockStatus }) => <Badge color={STOCK[status].color}>{STOCK[status].label}</Badge>;

/** Expiry label of the nearest in-stock batch (products) or of one batch. */
export const ExpiryBadge = ({ status, date }: { status: ExpiryStatus; date?: string | null }) => {
    if (status === 'none') return <span className="text-gray-500">-</span>;
    const color: BadgeColor = status === 'expired' ? 'danger' : status === 'warning' ? 'warning' : 'success';
    const label = status === 'expired' ? 'Kedaluwarsa' : status === 'warning' ? 'Hampir ED' : 'ED aman';
    return (
        <Badge color={color} className="!whitespace-nowrap">
            {label}
            {date ? ` · ${formatDate(date)}` : ''}
        </Badge>
    );
};

export const STOCK_STATUS_OPTIONS = [
    { value: 'out', label: 'Habis' },
    { value: 'low', label: 'Menipis' },
    { value: 'ok', label: 'Aman' },
];

export const EXPIRY_STATUS_OPTIONS = [
    { value: 'expired', label: 'Ada batch kedaluwarsa' },
    { value: 'warning', label: 'Hampir ED' },
    { value: 'ok', label: 'ED aman' },
    { value: 'none', label: 'Tanpa batch' },
];
