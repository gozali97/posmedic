import Badge from '@/components/ui/Badge';

/** Transaction status plus a return counter. */
const StatusBadge = ({ status, returnCount = 0 }: { status: string; returnCount?: number }) => (
    <span className="inline-flex flex-wrap gap-[4px]">
        {status === 'paid' && <Badge color="success">Lunas</Badge>}
        {status === 'void' && <Badge color="danger">Void</Badge>}
        {status === 'held' && <Badge color="gray">Tertunda</Badge>}
        {returnCount > 0 && <Badge color="warning">Retur {returnCount}×</Badge>}
    </span>
);

export default StatusBadge;
