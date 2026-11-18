import { Link } from 'react-router';
import Card from '@/components/ui/Card';

/** Shown inside the app layout when the user lacks the permission flag for a page. */
const Forbidden = () => (
    <Card>
        <div className="text-center py-[40px]">
            <i className="material-symbols-outlined !text-[56px] text-danger-500" aria-hidden="true">
                lock
            </i>
            <h4 className="!mt-[10px]">Akses ditolak</h4>
            <p>Anda tidak punya izin untuk membuka halaman ini. Minta admin menambahkan izin pada akun Anda.</p>
            <Link to="/app" className="inline-block font-medium rounded-md mt-[10px] py-[10px] px-[22px] text-white bg-primary-500 transition-all hover:bg-primary-400">
                Kembali ke Kasir
            </Link>
        </div>
    </Card>
);

export default Forbidden;
