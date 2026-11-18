import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tokenStorage } from '@/services/api.service';

export type PaperWidth = '58' | '80';

const WIDTH_KEY = 'pos_receipt_width';

/** Printable width inside the paper's margins. */
const CONTENT_WIDTH: Record<PaperWidth, string> = { '58': '48mm', '80': '72mm' };

export const readPaperWidth = (): PaperWidth => (tokenStorage.get(WIDTH_KEY) === '58' ? '58' : '80');

// Scoped to the print root: while it exists, printing shows only it. Screen rendering keeps it hidden.
const PRINT_CSS = `
#print-root { display: none; }
@media print {
    @page { margin: 0; }
    html, body { background: #fff !important; }
    body > *:not(#print-root) { display: none !important; }
    #print-root { display: block !important; color: #000; }
}`;

/** Waits until the images in `el` (store logo) are loaded, at most 1.5 s, so they are not missing on paper. */
const imageLoaded = (img: HTMLImageElement) =>
    img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
          });

const imagesReady = (el: HTMLElement) => Promise.race([Promise.all(Array.from(el.querySelectorAll('img')).map(imageLoaded)), new Promise((r) => setTimeout(r, 1500))]);

/**
 * Prints a receipt-sized node via window.print() and @media print (F13): 58 or 80 mm thermal paper.
 * Render `portal` once in the component; call `print(node)` to print.
 */
export const usePrint = () => {
    const [width, setWidthState] = useState<PaperWidth>(readPaperWidth);
    const [job, setJob] = useState<ReactNode>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const setWidth = useCallback((w: PaperWidth) => {
        setWidthState(w);
        tokenStorage.set(WIDTH_KEY, w);
    }, []);

    useEffect(() => {
        if (!job || !rootRef.current) return;
        let cancelled = false;
        const done = () => setJob(null);
        window.addEventListener('afterprint', done, { once: true });
        imagesReady(rootRef.current).then(() => {
            if (!cancelled) window.print();
        });
        return () => {
            cancelled = true;
            window.removeEventListener('afterprint', done);
        };
    }, [job]);

    const print = useCallback((node: ReactNode) => setJob(node), []);

    const portal = job
        ? createPortal(
              <div id="print-root" ref={rootRef} style={{ width: CONTENT_WIDTH[width], margin: '0 auto', padding: '2mm 0', fontSize: width === '58' ? '10px' : '12px' }}>
                  <style>{PRINT_CSS}</style>
                  {job}
              </div>,
              document.body,
          )
        : null;

    return { print, portal, width, setWidth, printing: job !== null };
};

export const CONTENT_WIDTHS = CONTENT_WIDTH;
