import Badge from '@/components/ui/Badge';
import type { PaymentStatus } from '@/types/stock.types';

/** Lunas / Belum lunas / Lewat jatuh tempo. */
const PaymentBadge = ({ status, overdue }: { status: PaymentStatus; overdue?: boolean }) => {
    if (status === 'paid') return <Badge color="success">Lunas</Badge>;
    return overdue ? <Badge color="danger">Lewat jatuh tempo</Badge> : <Badge color="warning">Belum lunas</Badge>;
};

export default PaymentBadge;
