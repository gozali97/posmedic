import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { DrugClassBadge } from '@/components/ProductBadges';
import { cellInputClass } from '@/components/ui/filters';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage } from '@/services/api.service';
import { productService } from '@/services/master.service';
import type { ProductItem } from '@/types/master.types';

interface ProductPickerProps {
    onSelect: (product: ProductItem) => void;
    placeholder?: string;
    /** Accessible name of the search box. */
    label?: string;
    /** Products without stock tracking (services) are shown disabled: purchases and opname need batches. */
    trackedOnly?: boolean;
    className?: string;
}

/** Search-as-you-type product combobox (name, generic name or barcode). Arrow keys + Enter pick a product. */
const ProductPicker = ({ onSelect, placeholder = 'Cari produk (nama, generik, barcode)…', label = 'Cari produk', trackedOnly = false, className = '' }: ProductPickerProps) => {
    const listId = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<ProductItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [active, setActive] = useState(0);
    const debounced = useDebounce(query);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const term = debounced.trim();
        if (!term) {
            setResults([]);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        setError('');
        productService
            .list({ search: term, per_page: 10 }, controller.signal)
            .then((res) => {
                setResults(res.data?.products ?? []);
                setActive(0);
            })
            .catch((err) => {
                if (!controller.signal.aborted) setError(errorMessage(err, 'Gagal mencari produk'));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [debounced]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const selectable = (p: ProductItem) => !trackedOnly || p.track_stock;

    const pick = (p: ProductItem) => {
        if (!selectable(p)) return;
        onSelect(p);
        setQuery('');
        setResults([]);
        setOpen(false);
    };

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === 'Enter') {
            // Never submit the surrounding form from the search box.
            e.preventDefault();
            if (open && results[active]) pick(results[active]);
        } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
        }
    };

    const showList = open && query.trim() !== '';

    return (
        <div ref={wrapRef} className={`relative ${className}`}>
            <input
                type="search"
                role="combobox"
                aria-label={label}
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
                className={cellInputClass}
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={handleKey}
            />
            {showList && (
                <ul
                    id={listId}
                    role="listbox"
                    className="absolute z-[20] left-0 right-0 mt-[4px] max-h-[320px] overflow-y-auto rounded-md border border-gray-100 dark:border-[#172036] bg-white dark:bg-[#0c1427] shadow-lg min-w-[280px]"
                >
                    {loading && results.length === 0 ? (
                        <li className="px-[12px] py-[10px] text-sm text-gray-500">Mencari…</li>
                    ) : error ? (
                        <li className="px-[12px] py-[10px] text-sm text-danger-500">{error}</li>
                    ) : results.length === 0 ? (
                        <li className="px-[12px] py-[10px] text-sm text-gray-500">Produk tidak ditemukan</li>
                    ) : (
                        results.map((p, i) => (
                            <li
                                key={p.id}
                                id={`${listId}-${p.id}`}
                                role="option"
                                aria-selected={i === active}
                                aria-disabled={!selectable(p)}
                                className={`px-[12px] py-[8px] cursor-pointer ${i === active ? 'bg-primary-50 dark:bg-[#15203c]' : ''} ${selectable(p) ? '' : 'opacity-50 cursor-not-allowed'}`}
                                onMouseEnter={() => setActive(i)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    pick(p);
                                }}
                            >
                                <div className="flex items-center justify-between gap-[8px]">
                                    <span className="font-medium text-black dark:text-white">{p.name}</span>
                                    <DrugClassBadge value={p.drug_class} />
                                </div>
                                <div className="text-xs text-gray-500">
                                    {[p.generic_name, p.shelf_location && `Rak ${p.shelf_location}`, !selectable(p) && 'tidak melacak stok'].filter(Boolean).join(' · ') || ' '}
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
};

export default ProductPicker;
