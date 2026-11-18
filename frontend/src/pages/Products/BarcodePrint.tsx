import { useState } from 'react';
import { createPortal } from 'react-dom';
import Barcode from 'react-barcode';
import Button from '@/components/ui/Button';
import { cellInputClass } from '@/components/ui/filters';
import type { ProductItem } from '@/types/master.types';
import { formatRupiah } from '@/utils/format';

const MAX_LABELS = 200;

// While printing, only the label sheet (portalled to <body>) is shown.
const PRINT_CSS = `
#barcode-print { display: none; }
@media print {
    body > *:not(#barcode-print) { display: none !important; }
    #barcode-print { display: flex !important; flex-wrap: wrap; gap: 4mm; padding: 4mm; }
    #barcode-print .label { width: 50mm; padding: 2mm; border: 1px dashed #999; text-align: center; break-inside: avoid; font-family: sans-serif; color: #000; }
    #barcode-print svg { max-width: 100%; height: auto; }
    @page { margin: 5mm; }
}`;

/** Per-unit barcode labels (F2): pick how many of each, then print via the browser dialog. */
const BarcodePrint = ({ product }: { product: ProductItem }) => {
    const printable = product.units.filter((u) => u.barcode);
    const [counts, setCounts] = useState<Record<number, string>>(() => Object.fromEntries(printable.map((u) => [u.id, '1'])));

    const labels = printable.flatMap((u) => {
        const n = Math.min(Math.max(Math.floor(Number(counts[u.id]) || 0), 0), MAX_LABELS);
        return Array.from({ length: n }, (_, i) => ({ unit: u, key: `${u.id}-${i}` }));
    });

    if (printable.length === 0) return <p className="!mb-0 text-gray-500">Belum ada satuan dengan barcode. Isi barcode di form produk untuk mencetak label.</p>;

    return (
        <div>
            <style>{PRINT_CSS}</style>
            <div className="flex flex-wrap gap-[20px] mb-[15px]">
                {printable.map((u) => (
                    <div key={u.id} className="rounded-md border border-gray-100 dark:border-[#172036] p-[12px] text-center">
                        <div className="bg-white inline-block rounded-sm">
                            <Barcode value={u.barcode!} height={40} width={1.4} fontSize={12} margin={4} />
                        </div>
                        <label className="flex items-center justify-center gap-[8px] mt-[8px] text-sm">
                            <span>{u.name} · jumlah label</span>
                            <input
                                type="number"
                                min={0}
                                max={MAX_LABELS}
                                inputMode="numeric"
                                className={`${cellInputClass} !w-[80px]`}
                                value={counts[u.id] ?? '0'}
                                onChange={(e) => setCounts((c) => ({ ...c, [u.id]: e.target.value }))}
                            />
                        </label>
                    </div>
                ))}
            </div>
            <Button icon="print" disabled={labels.length === 0} onClick={() => window.print()}>
                Cetak {labels.length} label
            </Button>
            {createPortal(
                <div id="barcode-print" aria-hidden="true">
                    {labels.map(({ unit, key }) => (
                        <div key={key} className="label">
                            <div style={{ fontSize: '9pt', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{product.name}</div>
                            <div style={{ fontSize: '8pt' }}>
                                {unit.name} · {formatRupiah(unit.price)}
                            </div>
                            <Barcode value={unit.barcode!} height={34} width={1.3} fontSize={10} margin={2} />
                        </div>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
};

export default BarcodePrint;
