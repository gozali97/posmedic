import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import CustomerSelect from '@/components/CustomerSelect';
import ReceiptModal from '@/components/print/ReceiptModal';
import { TransactionReceipt } from '@/components/print/Receipts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import { TOKEN_KEYS } from '@/config/api';
import { errorMessage, tokenStorage } from '@/services/api.service';
import { alertService } from '@/services/alert.service';
import { productService } from '@/services/master.service';
import { shiftService, transactionService } from '@/services/sales.service';
import { useAppDispatch, useAppSelector } from '@/store';
import {
    addItem,
    cartPayloadLines,
    cartSubtotal,
    clearCart,
    lineKey,
    lineTotal,
    lineUnit,
    loadHeld,
    maxLineQty,
    setCustomer,
    setDiscount,
    setPrescription,
    setRefNumber,
    type CartLine,
    type CartProduct,
} from '@/store/cartSlice';
import { needsPrescription, type ProductItem, type ProductUnit } from '@/types/master.types';
import type { PaymentPayload, Shift, Transaction } from '@/types/sales.types';
import { formatDateTime, formatRupiah } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';
import Cart from './Cart';
import HoldModal from './HoldModal';
import PaymentModal from './PaymentModal';
import PrescriptionModal, { type PrescriptionValue } from './PrescriptionModal';
import ProductGrid from './ProductGrid';
import ShiftOpenForm from './ShiftOpenForm';

type ModalName = 'pay' | 'hold' | 'rx' | null;

/** Navigation state from the held-orders page: load that order, optionally straight into payment. */
interface PosLocationState {
    heldId?: number;
    pay?: boolean;
}

const toCartProduct = ({ id, name, generic_name, drug_class, track_stock, sellable_stock, units }: ProductItem): CartProduct => ({
    id,
    name,
    generic_name,
    drug_class,
    track_stock,
    sellable_stock,
    units,
});

/** Cart as a pre-bill (F10 "Cetak (preview)"): same receipt layout, marked unpaid. */
const draftTransaction = (lines: CartLine[], discount: number, customer: { id: number; name: string } | null, ref: string): Transaction => {
    const now = new Date().toISOString();
    const subtotal = cartSubtotal(lines);
    return {
        id: 0,
        invoice_number: null,
        ref_number: ref || null,
        customer_id: customer?.id ?? null,
        till_id: 0,
        created_by: 0,
        paid_by: null,
        shift_id: null,
        status: 'held',
        subtotal,
        discount,
        total: subtotal - discount,
        dpp: 0,
        ppn: 0,
        ppn_rate: 0,
        paid: 0,
        change: 0,
        payment_method: null,
        payment_info: null,
        prescription_number: null,
        prescription_note: null,
        void_reason: null,
        voided_by: null,
        voided_at: null,
        paid_at: null,
        created_at: now,
        updated_at: now,
        customer: customer ? { id: customer.id, name: customer.name, phone: null, email: null, address: null, created_at: now, updated_at: now } : undefined,
        items: lines.map((l, i) => {
            const unit = lineUnit(l);
            return {
                id: i + 1,
                transaction_id: 0,
                product_id: l.product.id,
                product_unit_id: l.unitId,
                product_name: l.product.name,
                unit_name: unit?.name ?? '',
                conversion_qty: unit?.conversion_qty ?? 1,
                drug_class: l.product.drug_class,
                price: unit?.price ?? 0,
                quantity: l.qty,
                line_total: lineTotal(l),
                discount_share: 0,
                returned_base_quantity: 0,
            };
        }),
    };
};

const PosIndex = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useAppSelector((s) => s.auth.user);
    const store = useAppSelector((s) => s.setting.store);
    const cart = useAppSelector((s) => s.cart);
    const currency = store?.currency_symbol;

    /** undefined = loading, null = no open shift. */
    const [shift, setShift] = useState<Shift | null | undefined>(undefined);
    const [shiftError, setShiftError] = useState('');
    const [modal, setModal] = useState<ModalName>(null);
    const [busy, setBusy] = useState(false);
    const [receipt, setReceipt] = useState<{ trx: Transaction; draft: boolean } | null>(null);
    const [gridReload, setGridReload] = useState(0);
    const [code, setCode] = useState('');
    const [scanning, setScanning] = useState(false);
    const [discountText, setDiscountText] = useState(String(cart.discount || ''));
    /** Set to go to payment on the next render, once the cart state is fresh (after loading a held order or filling the prescription). */
    const [pendingPay, setPendingPay] = useState(false);
    /** The prescription modal was opened by "Bayar": continue to payment after saving it. */
    const [rxThenPay, setRxThenPay] = useState(false);
    const barcodeRef = useRef<HTMLInputElement>(null);

    const subtotal = cartSubtotal(cart.lines);
    const total = subtotal - cart.discount;
    const strictItems = useMemo(() => [...new Set(cart.lines.filter((l) => needsPrescription(l.product.drug_class)).map((l) => l.product.name))], [cart.lines]);
    const hasKeras = cart.lines.some((l) => l.product.drug_class === 'keras');
    const prescriptionMissing = strictItems.length > 0 && (!cart.customer || !cart.prescriptionNumber.trim());

    const focusBarcode = useCallback(() => setTimeout(() => barcodeRef.current?.focus(), 0), []);

    // ------------------------------------------------------------ shift

    const loadShift = useCallback(() => {
        setShiftError('');
        setShift(undefined);
        shiftService
            .current()
            .then((res) => {
                setShift(res.data ?? null);
                if (res.data) tokenStorage.set(TOKEN_KEYS.till, String(res.data.till_id));
            })
            .catch((err) => setShiftError(errorMessage(err, 'Gagal memuat shift')));
    }, []);

    useEffect(loadShift, [loadShift]);

    // F16: once per browser session, warn about expired / near-expiry batches still in stock.
    useEffect(() => {
        if (!shift || !user) return;
        const key = `pos_alerts_shown_${user.id}`;
        try {
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, '1');
        } catch {
            /* storage blocked: warn every time */
        }
        alertService
            .get()
            .then((res) => {
                const c = res.data?.counts;
                if (!c) return;
                const parts = [];
                if (c.expired_batches > 0) parts.push(`${c.expired_batches} batch kedaluwarsa masih berstok`);
                if (c.near_expiry_batches > 0) parts.push(`${c.near_expiry_batches} batch ED ≤ ${store?.expiry_warning_days ?? 90} hari`);
                if (parts.length) toast.warning(`Perhatian: ${parts.join(', ')}.`);
            })
            .catch(() => {
                /* the header badge shows the same data */
            });
    }, [shift, user, store?.expiry_warning_days]);

    // ------------------------------------------------------------ adding items

    const pickProduct = useCallback(
        async (product: ProductItem, unit?: ProductUnit) => {
            const unitId = unit?.id ?? product.units.find((u) => u.is_base)?.id;
            if (!unitId) {
                toast.error(`${product.name} belum punya satuan`);
                return;
            }
            // Room left for one more of this unit: the line's own quantity counts too.
            const key = lineKey(product.id, unitId);
            const inLine = cart.lines.find((l) => l.key === key)?.qty ?? 0;
            if (maxLineQty(cart.lines, product, unitId, key) - inLine < 1) {
                toast.error(`Stok ${product.name} tidak cukup`);
                focusBarcode();
                return;
            }
            const inCart = cart.lines.some((l) => l.product.id === product.id);
            if (!inCart && product.drug_class === 'keras') {
                const ok = await confirmDialog({ title: 'Obat keras', text: `${product.name} adalah obat keras, wajib dengan resep dokter. Tambahkan ke keranjang?`, confirmText: 'Ya, ada resep' });
                if (!ok) {
                    focusBarcode();
                    return;
                }
            }
            if (!inCart && needsPrescription(product.drug_class)) {
                toast.warning(`${product.name}: wajib pasien dan no. resep sebelum dibayar`);
            }
            dispatch(addItem({ product: toCartProduct(product), unitId }));
            focusBarcode();
        },
        [cart.lines, dispatch, focusBarcode],
    );

    const handleScan = async (e: FormEvent) => {
        e.preventDefault();
        const value = code.trim();
        if (!value || scanning) return;
        setScanning(true);
        try {
            const res = await productService.barcode(value);
            setCode('');
            if (res.data) await pickProduct(res.data.product, res.data.unit);
        } catch (err) {
            toast.error(errorMessage(err));
            barcodeRef.current?.select();
        } finally {
            setScanning(false);
        }
    };

    // ------------------------------------------------------------ discount

    useEffect(() => setDiscountText(cart.discount ? String(cart.discount) : ''), [cart.discount]);

    const commitDiscount = () => {
        const value = Math.max(0, Math.floor(Number(discountText) || 0));
        if (value > 0 && value >= subtotal) toast.warning('Diskon harus lebih kecil dari subtotal; direset ke 0');
        dispatch(setDiscount(value));
        setDiscountText(value > 0 && value < subtotal ? String(value) : '');
    };

    // ------------------------------------------------------------ pay / hold

    const cartBody = () => ({
        till_id: shift!.till_id,
        items: cartPayloadLines(cart.lines),
        discount: cart.discount,
        customer_id: cart.customer?.id ?? null,
        ref_number: cart.refNumber.trim(),
        prescription_number: cart.prescriptionNumber.trim(),
        prescription_note: cart.prescriptionNote.trim(),
    });

    const submitPayment = async (payment: PaymentPayload) => {
        if (!shift) return;
        setBusy(true);
        try {
            let res;
            if (cart.heldId) {
                // The cashier may have changed the loaded order: save it, then pay it (stock and prices recomputed by the server).
                await transactionService.updateHeld(cart.heldId, cartBody());
                res = await transactionService.payHeld(cart.heldId, { till_id: shift.till_id, payment });
            } else {
                res = await transactionService.create({ status: 'paid', ...cartBody(), payment });
            }
            toast.success(res.message);
            setModal(null);
            dispatch(clearCart());
            setGridReload((k) => k + 1);
            if (res.data) setReceipt({ trx: res.data, draft: false });
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const startPay = () => {
        if (busy || modal || receipt) return;
        if (cart.lines.length === 0) {
            toast.warning('Keranjang kosong');
            focusBarcode();
            return;
        }
        if (prescriptionMissing) {
            setRxThenPay(true);
            setModal('rx');
            return;
        }
        if (store?.quick_billing) {
            submitPayment({ method: 'cash', paid: total, info: '' });
            return;
        }
        setModal('pay');
    };

    const startHold = () => {
        if (busy || modal || receipt) return;
        if (cart.lines.length === 0) {
            toast.warning('Keranjang kosong');
            focusBarcode();
            return;
        }
        setModal('hold');
    };

    const submitHold = async (refNumber: string, customer: typeof cart.customer) => {
        if (!shift) return;
        dispatch(setRefNumber(refNumber));
        dispatch(setCustomer(customer));
        const body = { ...cartBody(), ref_number: refNumber, customer_id: customer?.id ?? null };
        setBusy(true);
        try {
            const res = cart.heldId ? await transactionService.updateHeld(cart.heldId, body) : await transactionService.create({ status: 'held', ...body });
            toast.success(cart.heldId ? 'Pesanan tertunda diperbarui' : res.message);
            setModal(null);
            dispatch(clearCart());
            focusBarcode();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const closeModal = () => {
        setModal(null);
        setRxThenPay(false);
        focusBarcode();
    };

    const submitPrescription = (v: PrescriptionValue) => {
        dispatch(setCustomer(v.customer));
        dispatch(setPrescription({ number: v.number, note: v.note }));
        setModal(null);
        if (rxThenPay) {
            setRxThenPay(false);
            setPendingPay(true);
        } else {
            focusBarcode();
        }
    };

    const closeReceipt = () => {
        setReceipt(null);
        focusBarcode();
    };

    const cancelCart = async () => {
        if (cart.lines.length === 0 && !cart.heldId) return;
        const ok = await confirmDialog({
            title: cart.heldId ? 'Lepaskan pesanan tertunda?' : 'Kosongkan keranjang?',
            text: cart.heldId ? 'Pesanan tetap tersimpan di daftar pesanan tertunda.' : undefined,
            confirmText: 'Ya',
            danger: !cart.heldId,
        });
        if (ok) dispatch(clearCart());
        focusBarcode();
    };

    // ------------------------------------------------------------ held order from /held

    useEffect(() => {
        const state = location.state as PosLocationState | null;
        if (!state?.heldId || !shift) return;
        navigate(location.pathname, { replace: true, state: null });
        const id = state.heldId;
        (async () => {
            if (cart.lines.length > 0 && cart.heldId !== id) {
                const ok = await confirmDialog({ title: 'Ganti isi keranjang?', text: 'Keranjang saat ini akan dikosongkan dan diganti pesanan tertunda.', confirmText: 'Ganti' });
                if (!ok) return;
            }
            try {
                const trx = (await transactionService.detail(id)).data;
                if (!trx || trx.status !== 'held') {
                    toast.error('Pesanan ini sudah dibayar atau dibatalkan');
                    return;
                }
                const ids = [...new Set((trx.items ?? []).map((i) => i.product_id))];
                const products = new Map((await Promise.all(ids.map((pid) => productService.detail(pid)))).map((r) => [r.data!.id, toCartProduct(r.data!)]));
                const lines: CartLine[] = [];
                const missing: string[] = [];
                for (const it of trx.items ?? []) {
                    const product = products.get(it.product_id);
                    if (!product || !product.units.some((u) => u.id === it.product_unit_id)) missing.push(it.product_name);
                    else lines.push({ key: lineKey(it.product_id, it.product_unit_id), product, unitId: it.product_unit_id, qty: it.quantity });
                }
                if (missing.length) toast.warning(`Satuan tidak tersedia lagi, dilewati: ${missing.join(', ')}`);
                dispatch(
                    loadHeld({
                        lines,
                        discount: trx.discount,
                        customer: trx.customer ? { id: trx.customer.id, name: trx.customer.name, phone: trx.customer.phone } : null,
                        refNumber: trx.ref_number ?? '',
                        prescriptionNumber: trx.prescription_number ?? '',
                        prescriptionNote: trx.prescription_note ?? '',
                        heldId: trx.id,
                    }),
                );
                if (state.pay) setPendingPay(true);
                focusBarcode();
            } catch (err) {
                toast.error(errorMessage(err, 'Gagal memuat pesanan tertunda'));
            }
        })();
        // Runs when navigation state arrives; cart is read at that moment on purpose.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state, shift]);

    useEffect(() => {
        if (pendingPay && modal === null) {
            setPendingPay(false);
            startPay();
        }
        // startPay must see the cart of this render, which is why this runs as an effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingPay, modal, cart]);

    // ------------------------------------------------------------ keyboard (F2 bayar, F4 tahan)

    const shortcuts = useRef({ startPay, startHold });
    shortcuts.current = { startPay, startHold };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                shortcuts.current.startPay();
            } else if (e.key === 'F4') {
                e.preventDefault();
                shortcuts.current.startHold();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ------------------------------------------------------------ render

    if (shiftError) {
        return (
            <Card>
                <div className="text-center py-[30px]">
                    <p>{shiftError}</p>
                    <Button icon="refresh" onClick={loadShift}>
                        Coba lagi
                    </Button>
                </div>
            </Card>
        );
    }
    if (shift === undefined) return <p className="text-center py-[40px] text-gray-500">Memuat shift…</p>;
    if (shift === null) {
        return (
            <>
                <ShiftOpenForm
                    onOpened={(s) => {
                        setShift(s);
                        focusBarcode();
                    }}
                />
            </>
        );
    }

    const rxInitial: PrescriptionValue = { customer: cart.customer, number: cart.prescriptionNumber, note: cart.prescriptionNote };

    return (
        <>
            <PageHeader
                title="Kasir"
                breadcrumbs={[{ label: 'Kasir' }]}
                actions={
                    <>
                        <span className="text-sm">
                            Shift #{shift.id} · Till {shift.till?.number ?? shift.till_id}
                            {shift.till ? ` – ${shift.till.name}` : ''} · dibuka {formatDateTime(shift.opened_at)}
                        </span>
                        <Link to="/held" className="text-sm font-medium text-primary-500 hover:underline">
                            Pesanan tertunda
                        </Link>
                        <Link to={`/shifts/${shift.id}`} className="text-sm font-medium text-danger-500 hover:underline">
                            Tutup shift
                        </Link>
                    </>
                }
            />

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-[25px] items-start mb-[25px]">
                <section className="xl:col-span-5 trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md xl:sticky xl:top-[90px]" aria-label="Transaksi">
                    <form onSubmit={handleScan} className="mb-[15px]" role="search">
                        <label htmlFor="pos-barcode" className="sr-only">
                            Scan barcode
                        </label>
                        <div className="relative">
                            <i className="material-symbols-outlined absolute left-[14px] top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true">
                                barcode_scanner
                            </i>
                            <input
                                id="pos-barcode"
                                ref={barcodeRef}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Scan barcode lalu Enter"
                                autoComplete="off"
                                autoFocus
                                disabled={scanning}
                                className="h-[48px] w-full rounded-md border border-gray-200 dark:border-[#172036] bg-white dark:bg-[#0c1427] text-black dark:text-white pl-[46px] pr-[15px] outline-0 focus:border-primary-500"
                            />
                        </div>
                    </form>

                    {cart.heldId && (
                        <div
                            className="mb-[15px] rounded-md bg-info-50 dark:bg-info-900/40 text-info-800 dark:text-info-300 px-[12px] py-[8px] text-sm flex items-center justify-between gap-[10px]"
                            role="status"
                        >
                            <span>
                                Pesanan tertunda #{cart.heldId}
                                {cart.refNumber ? ` · ${cart.refNumber}` : ''}
                            </span>
                        </div>
                    )}

                    <CustomerSelect value={cart.customer} onChange={(c) => dispatch(setCustomer(c))} wrapperClassName="mb-[10px]" />

                    {(hasKeras || strictItems.length > 0) && (
                        <button
                            type="button"
                            onClick={() => setModal('rx')}
                            className={`w-full mb-[10px] text-left rounded-md px-[12px] py-[8px] text-sm border transition-all ${
                                prescriptionMissing ? 'border-danger-500 text-danger-700 dark:text-danger-300 bg-danger-50 dark:bg-danger-900/40' : 'border-gray-200 dark:border-[#172036]'
                            }`}
                        >
                            <i className="material-symbols-outlined !text-[18px] align-middle mr-[6px]" aria-hidden="true">
                                prescriptions
                            </i>
                            {cart.prescriptionNumber ? `Resep: ${cart.prescriptionNumber}` : prescriptionMissing ? 'Wajib isi pasien & no. resep' : 'Isi data resep (opsional)'}
                        </button>
                    )}

                    <div className="max-h-[42vh] overflow-y-auto -mx-[4px] px-[4px]">
                        <Cart currency={currency} />
                    </div>

                    <div className="border-t border-gray-100 dark:border-[#172036] mt-[10px] pt-[15px] space-y-[8px]">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span className="text-black dark:text-white">{formatRupiah(subtotal, currency)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-[10px]">
                            <label htmlFor="pos-discount">Diskon</label>
                            <input
                                id="pos-discount"
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={discountText}
                                placeholder="0"
                                disabled={cart.lines.length === 0}
                                onChange={(e) => setDiscountText(e.target.value.replace(/\D/g, ''))}
                                onBlur={commitDiscount}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitDiscount();
                                    }
                                }}
                                className="w-[140px] h-[34px] text-right rounded-md border border-gray-200 dark:border-[#172036] bg-white dark:bg-[#0c1427] text-black dark:text-white px-[10px] outline-0 focus:border-primary-500 disabled:opacity-60"
                            />
                        </div>
                        <div className="flex justify-between items-baseline">
                            <span className="font-semibold text-black dark:text-white">Total</span>
                            <span className="text-[24px] font-bold text-black dark:text-white" data-testid="cart-total">
                                {formatRupiah(total, currency)}
                            </span>
                        </div>
                        {store?.is_pkp && <p className="!mb-0 text-xs text-gray-500 text-right">Harga sudah termasuk PPN {store.ppn_rate}%</p>}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-[8px] mt-[15px]">
                        <Button variant="secondary" icon="close" onClick={cancelCart} disabled={busy}>
                            Batal
                        </Button>
                        <Button
                            variant="outline"
                            icon="print"
                            disabled={cart.lines.length === 0}
                            onClick={() => setReceipt({ trx: draftTransaction(cart.lines, cart.discount, cart.customer, cart.refNumber), draft: true })}
                        >
                            Cetak
                        </Button>
                        <Button variant="secondary" icon="pause_circle" onClick={startHold} disabled={busy} title="F4">
                            Tahan <kbd className="text-xs opacity-70">F4</kbd>
                        </Button>
                        <Button variant="success" icon="payments" onClick={startPay} loading={busy && modal === null} disabled={busy} title="F2">
                            Bayar <kbd className="text-xs opacity-80">F2</kbd>
                        </Button>
                    </div>
                </section>

                <section className="xl:col-span-7" aria-label="Produk">
                    <ProductGrid onPick={(p) => pickProduct(p)} reloadKey={gridReload} currency={currency} />
                </section>
            </div>

            <PaymentModal open={modal === 'pay'} total={total} currency={currency} loading={busy} onClose={closeModal} onSubmit={submitPayment} />
            <HoldModal open={modal === 'hold'} initialRef={cart.refNumber} initialCustomer={cart.customer} loading={busy} onClose={closeModal} onSubmit={submitHold} />
            <PrescriptionModal
                open={modal === 'rx'}
                initial={rxInitial}
                strictItems={strictItems}
                submitLabel={rxThenPay ? 'Lanjut bayar' : 'Simpan'}
                onClose={closeModal}
                onSubmit={submitPrescription}
            />
            <ReceiptModal
                open={receipt !== null}
                onClose={closeReceipt}
                title={receipt?.draft ? 'Pra-struk' : `Struk ${receipt?.trx.invoice_number ?? ''}`}
                autoPrint={receipt !== null && !receipt.draft}
                actions={
                    !receipt?.draft && (
                        <Button variant="secondary" icon="add_shopping_cart" onClick={closeReceipt}>
                            Transaksi baru
                        </Button>
                    )
                }
            >
                {receipt && <TransactionReceipt trx={receipt.trx} store={store} draft={receipt.draft} />}
            </ReceiptModal>
        </>
    );
};

export default PosIndex;
