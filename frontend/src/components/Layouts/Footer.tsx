import { useAppSelector } from '@/store';

const Footer = () => {
    const storeName = useAppSelector((s) => s.setting.store?.store_name);
    return (
        <>
            <div className="grow" />
            <footer className="bg-white dark:bg-[#0c1427] rounded-t-md px-[20px] md:px-[25px] py-[15px] md:py-[20px] text-center">
                <p>
                    © {new Date().getFullYear()} <span className="text-primary-500">{storeName || 'POS Apotek'}</span>
                </p>
            </footer>
        </>
    );
};

export default Footer;
