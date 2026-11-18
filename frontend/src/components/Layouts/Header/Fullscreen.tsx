import { useEffect, useState } from 'react';

const Fullscreen = () => {
    const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

    // Also tracks leaving fullscreen with Esc/F11.
    useEffect(() => {
        const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const handleToggle = async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            /* fullscreen not allowed (e.g. iframe or browser policy) */
        }
    };

    return (
        <div className="relative mx-[8px] md:mx-[10px] lg:mx-[12px] first:ml-0 last:mr-0">
            <button
                type="button"
                className="leading-none inline-block transition-all relative top-[2px] hover:text-primary-500"
                onClick={handleToggle}
                aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
                title={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
            >
                <i className="material-symbols-outlined !text-[22px] md:!text-[24px]">{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</i>
            </button>
        </div>
    );
};

export default Fullscreen;
