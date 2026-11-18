import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import { errorMessage } from '@/services/api.service';
import { settingService } from '@/services/setting.service';
import type { StoreSetting } from '@/types/setting.types';
import StoreSettingForm from './StoreSettingForm';
import TillSection from './TillSection';

/** F17: store settings (one row) and tills. Basis: Trezo Settings/AccountSettingsForm. */
const SettingsPage = () => {
    const [setting, setSetting] = useState<StoreSetting | null | undefined>(undefined);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        settingService
            .get()
            .then((res) => setSetting(res.data ?? null))
            .catch((err) => setLoadError(errorMessage(err)));
    }, []);

    return (
        <>
            <PageHeader title="Pengaturan" breadcrumbs={[{ label: 'Sistem' }, { label: 'Pengaturan' }]} />
            {loadError ? (
                <Card>
                    <p className="text-danger-500 !mb-0">{loadError}</p>
                </Card>
            ) : setting === undefined ? (
                <Card>
                    <p className="!mb-0">Memuat pengaturan…</p>
                </Card>
            ) : (
                <>
                    {setting === null && (
                        <div className="mb-[25px] rounded-md bg-info-50 dark:bg-info-900/30 text-info-900 dark:text-info-200 px-[20px] py-[15px] flex items-start gap-[10px]" role="status">
                            <i className="material-symbols-outlined">info</i>
                            <span>Pengaturan toko belum diisi. Lengkapi data di bawah agar struk dan laporan menampilkan identitas apotek.</span>
                        </div>
                    )}
                    <StoreSettingForm setting={setting} onSaved={setSetting} />
                    <TillSection />
                </>
            )}
        </>
    );
};

export default SettingsPage;
