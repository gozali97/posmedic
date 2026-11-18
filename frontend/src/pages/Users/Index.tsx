import { Link } from 'react-router';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { userService } from '@/services/user.service';
import { useAppSelector } from '@/store';
import { ADMIN_USER_ID, PERMISSIONS, type User } from '@/types/auth.types';
import type { UserListData } from '@/types/user.types';
import { formatDateTime } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';

const iconBtn = 'inline-flex items-center justify-center w-[32px] h-[32px] rounded-md transition-all';

const UserIndex = () => {
    const currentUserId = useAppSelector((s) => s.auth.user!.id);
    const list = usePaginatedList<User, UserListData>({
        fetcher: (params, signal) => userService.list(params, signal),
        select: (d) => d.users,
    });

    const handleDelete = async (user: User) => {
        const ok = await confirmDialog({
            title: `Hapus user ${user.username}?`,
            text: 'User yang sudah punya riwayat aktivitas tidak bisa dihapus; nonaktifkan saja.',
            confirmText: 'Hapus',
            danger: true,
        });
        if (!ok) return;
        try {
            const res = await userService.remove(user.id);
            toast.success(res.message);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<User>[] = [
        {
            key: 'username',
            header: 'Username',
            render: (u) => (
                <div>
                    <span className="font-medium">{u.username}</span>
                    {u.id === ADMIN_USER_ID && (
                        <Badge color="purple" className="ml-[6px]">
                            Admin bawaan
                        </Badge>
                    )}
                    {u.id === currentUserId && (
                        <Badge color="gray" className="ml-[6px]">
                            Anda
                        </Badge>
                    )}
                </div>
            ),
        },
        { key: 'fullname', header: 'Nama lengkap' },
        {
            key: 'perms',
            header: 'Izin',
            render: (u) => {
                const perms = PERMISSIONS.filter((p) => u[p.key]);
                if (perms.length === PERMISSIONS.length) return <Badge color="primary">Semua izin</Badge>;
                if (perms.length === 0) return <span className="text-gray-500">Kasir saja</span>;
                return (
                    <div className="flex flex-wrap gap-[4px] max-w-[360px] whitespace-normal">
                        {perms.map((p) => (
                            <Badge key={p.key} color="info">
                                {p.label}
                            </Badge>
                        ))}
                    </div>
                );
            },
        },
        {
            key: 'status',
            header: 'Status',
            render: (u) => (u.is_active ? <Badge color="success">Aktif</Badge> : <Badge color="danger">Nonaktif</Badge>),
        },
        { key: 'last_login_at', header: 'Login terakhir', render: (u) => formatDateTime(u.last_login_at) },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (u) => (
                <div className="flex justify-end gap-[6px]">
                    <Link to={`/users/${u.id}/edit`} className={`${iconBtn} text-primary-500 hover:bg-primary-50 dark:hover:bg-[#15203c]`} aria-label={`Ubah ${u.username}`} title="Ubah">
                        <i className="material-symbols-outlined !text-[20px]">edit</i>
                    </Link>
                    {u.id !== ADMIN_USER_ID && u.id !== currentUserId && (
                        <button
                            type="button"
                            className={`${iconBtn} text-danger-500 hover:bg-danger-50 dark:hover:bg-[#15203c]`}
                            onClick={() => handleDelete(u)}
                            aria-label={`Hapus ${u.username}`}
                            title="Hapus"
                        >
                            <i className="material-symbols-outlined !text-[20px]">delete</i>
                        </button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="User" breadcrumbs={[{ label: 'Sistem' }, { label: 'User' }]} />
            <Card
                title="Daftar user"
                actions={
                    <>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari username atau nama…" />
                        <Link
                            to="/users/create"
                            className="inline-flex items-center gap-[6px] whitespace-nowrap font-medium rounded-md py-[7px] px-[16px] bg-primary-500 text-white transition-all hover:bg-primary-400"
                        >
                            <i className="material-symbols-outlined !text-[20px]">add</i>
                            Tambah user
                        </Link>
                    </>
                }
            >
                <DataTable columns={columns} rows={list.rows} rowKey={(u) => u.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="User tidak ditemukan" />
            </Card>
        </>
    );
};

export default UserIndex;
