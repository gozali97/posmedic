import { useEffect, useRef, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { CONTENT_WIDTHS, usePrint, type PaperWidth } from './usePrint';

interface ReceiptModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Receipt content (TransactionReceipt, ReturnReceipt, ShiftRecapReceipt); null while loading. */
    children: ReactNode;
    /** Print as soon as the modal opens (after payment). */
    autoPrint?: boolean;
    /** Extra buttons left of "Cetak" (e.g. "Transaksi baru"). */
    actions?: ReactNode;
}

/** On-screen preview of a receipt at paper width, with the 58/80 mm choice and a print button. */
const ReceiptModal = ({ open, onClose, title, children, autoPrint = false, actions }: ReceiptModalProps) => {
    const { print, portal, width, setWidth, printing } = usePrint();
    const printedRef = useRef(false);

    useEffect(() => {
        if (!open) {
            printedRef.current = false;
            return;
        }
        if (autoPrint && children && !printedRef.current) {
            printedRef.current = true;
            print(children);
        }
    }, [open, autoPrint, children, print]);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    {actions}
                    <Button icon="print" onClick={() => children && print(children)} loading={printing} disabled={!children}>
                        Cetak
                    </Button>
                </>
            }
        >
            <fieldset className="flex items-center gap-[15px] mb-[15px]">
                <legend className="sr-only">Lebar kertas</legend>
                <span className="text-sm font-medium text-black dark:text-white">Kertas</span>
                {(['58', '80'] as PaperWidth[]).map((w) => (
                    <label key={w} className="inline-flex items-center gap-[6px] cursor-pointer text-sm">
                        <input type="radio" name="paper-width" value={w} checked={width === w} onChange={() => setWidth(w)} className="accent-primary-500" />
                        {w} mm
                    </label>
                ))}
            </fieldset>
            <div className="bg-gray-100 dark:bg-[#15203c] rounded-md p-[12px] max-h-[60vh] overflow-y-auto">
                <div className="bg-white text-black mx-auto shadow-sm p-[3mm] box-content" style={{ width: CONTENT_WIDTHS[width], fontSize: width === '58' ? '10px' : '12px' }}>
                    {children ?? <p className="text-center !text-gray-500 !mb-0">Memuat…</p>}
                </div>
            </div>
            {portal}
        </Modal>
    );
};

export default ReceiptModal;
