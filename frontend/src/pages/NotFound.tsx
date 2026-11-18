import { Link } from 'react-router';

/** Ported from Trezo app/not-found.tsx. */
const NotFound = () => (
    <div className="bg-white dark:bg-[#0a0e19] py-[30px] min-h-screen overflow-x-hidden flex items-center">
        <div className="mx-auto max-w-[960px] text-center px-[15px]">
            <img src="/images/error.png" className="inline-block" alt="" width={400} height={400} />
            <h4 className="!text-[19px] md:!text-[21px] !mt-[25px] md:!mt-[33px] !mb-[13px]">Halaman tidak ditemukan</h4>
            <p>Alamat yang Anda buka tidak ada atau sudah dipindah.</p>
            <Link to="/" className="inline-block font-medium rounded-md md:text-md mt-[2px] md:mt-[10px] py-[12px] px-[25px] text-white bg-primary-500 transition-all hover:bg-primary-400">
                Kembali ke Kasir
            </Link>
        </div>
    </div>
);

export default NotFound;
