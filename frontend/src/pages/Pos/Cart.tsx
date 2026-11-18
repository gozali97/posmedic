import { DrugClassBadge } from '@/components/ProductBadges';
import IconButton from '@/components/ui/IconButton';
import { useAppDispatch, useAppSelector } from '@/store';
import { changeUnit, lineTotal, lineUnit, maxLineQty, removeLine, setQty } from '@/store/cartSlice';
import { formatNumber, formatRupiah } from '@/utils/format';

const qtyBtn =
    'w-[30px] h-[30px] inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-[#172036] transition-all hover:bg-primary-500 hover:text-white hover:border-primary-500 disabled:opacity-40 disabled:pointer-events-none';

/** Cart lines (F10), from Trezo eCommerce/Cart: unit per line, qty limited by sellable stock. */
const Cart = ({ currency }: { currency?: string }) => {
    const dispatch = useAppDispatch();
    const lines = useAppSelector((s) => s.cart.lines);

    if (lines.length === 0) {
        return (
            <div className="text-center py-[30px] text-gray-500">
                <i className="material-symbols-outlined !text-[40px] text-gray-300 dark:text-gray-600" aria-hidden="true">
                    shopping_cart
                </i>
                <p className="!mb-0 !mt-[6px]">Keranjang kosong. Scan barcode atau klik produk.</p>
            </div>
        );
    }

    return (
        <ul className="divide-y divide-gray-100 dark:divide-[#172036]" aria-label="Keranjang">
            {lines.map((line) => {
                const unit = lineUnit(line);
                const max = maxLineQty(lines, line.product, line.unitId, line.key);
                const atMax = line.qty >= max;
                return (
                    <li key={line.key} className="py-[12px]">
                        <div className="flex items-start justify-between gap-[8px]">
                            <div className="min-w-0">
                                <span className="font-semibold text-black dark:text-white block leading-tight">{line.product.name}</span>
                                <span className="flex flex-wrap items-center gap-[6px] mt-[3px]">
                                    {line.product.drug_class !== 'bebas' && line.product.drug_class !== 'non_obat' && <DrugClassBadge value={line.product.drug_class} />}
                                    <span className="text-xs text-gray-500">@ {formatRupiah(unit?.price, currency)}</span>
                                </span>
                            </div>
                            <IconButton icon="delete" label={`Hapus ${line.product.name}`} tone="danger" onClick={() => dispatch(removeLine(line.key))} />
                        </div>
                        <div className="flex items-center justify-between gap-[8px] mt-[8px]">
                            <div className="flex items-center gap-[6px]">
                                <button
                                    type="button"
                                    className={qtyBtn}
                                    onClick={() => dispatch(setQty({ key: line.key, qty: line.qty - 1 }))}
                                    disabled={line.qty <= 1}
                                    aria-label={`Kurangi ${line.product.name}`}
                                >
                                    <i className="material-symbols-outlined !text-[18px]">remove</i>
                                </button>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={Number.isFinite(max) ? max : undefined}
                                    value={line.qty}
                                    onChange={(e) => dispatch(setQty({ key: line.key, qty: Number(e.target.value) }))}
                                    onFocus={(e) => e.target.select()}
                                    className="w-[56px] h-[30px] text-center rounded-md border border-gray-200 dark:border-[#172036] bg-white dark:bg-[#0c1427] text-black dark:text-white outline-0 focus:border-primary-500"
                                    aria-label={`Jumlah ${line.product.name}`}
                                />
                                <button
                                    type="button"
                                    className={qtyBtn}
                                    onClick={() => dispatch(setQty({ key: line.key, qty: line.qty + 1 }))}
                                    disabled={atMax}
                                    aria-label={`Tambah ${line.product.name}`}
                                >
                                    <i className="material-symbols-outlined !text-[18px]">add</i>
                                </button>
                                <label className="sr-only" htmlFor={`unit-${line.key}`}>
                                    Satuan {line.product.name}
                                </label>
                                <select
                                    id={`unit-${line.key}`}
                                    value={line.unitId}
                                    onChange={(e) => dispatch(changeUnit({ key: line.key, unitId: Number(e.target.value) }))}
                                    className="h-[30px] rounded-md border border-gray-200 dark:border-[#172036] bg-white dark:bg-[#0c1427] text-black dark:text-white px-[6px] text-sm outline-0 focus:border-primary-500"
                                >
                                    {[...line.product.units]
                                        .sort((a, b) => a.conversion_qty - b.conversion_qty)
                                        .map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.name}
                                                {u.conversion_qty > 1 ? ` (${formatNumber(u.conversion_qty)})` : ''}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <span className="font-semibold text-black dark:text-white whitespace-nowrap">{formatRupiah(lineTotal(line), currency)}</span>
                        </div>
                        {atMax && Number.isFinite(max) && <p className="!mb-0 !mt-[4px] text-xs text-warning-900 dark:text-warning-300">Batas stok jual tercapai</p>}
                    </li>
                );
            })}
        </ul>
    );
};

export default Cart;
