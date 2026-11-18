import { apiService } from './api.service';
import type { ListParams } from '@/types/api.types';
import type {
    HeldListData,
    HeldListParams,
    HeldUpdatePayload,
    PayHeldPayload,
    ReturnPayload,
    SalesReturn,
    SalesReturnListData,
    SalesReturnListParams,
    SalesSummary,
    Shift,
    ShiftClosePayload,
    ShiftDetail,
    ShiftListData,
    ShiftListParams,
    Transaction,
    TransactionFilters,
    TransactionListData,
    TransactionPayload,
    VoidPayload,
} from '@/types/sales.types';

export const shiftService = {
    /** The caller's open shift; `data` is null when none is open. */
    current: (signal?: AbortSignal) => apiService.get<Shift | null>('/shifts/current', undefined, signal),
    open: (till_id: number, opening_cash: number) => apiService.post<Shift>('/shifts/open', { till_id, opening_cash }),
    /** Own shifts only, unless the user has perm_transactions. */
    list: (params: ListParams & ShiftListParams, signal?: AbortSignal) => apiService.get<ShiftListData>('/shifts', { ...params }, signal),
    detail: (id: number, signal?: AbortSignal) => apiService.get<ShiftDetail>(`/shifts/${id}`, undefined, signal),
    close: (id: number, body: ShiftClosePayload) => apiService.post<ShiftDetail>(`/shifts/${id}/close`, body),
};

export const transactionService = {
    /** Checkout (status paid) or hold (status held). */
    create: (body: TransactionPayload) => apiService.post<Transaction>('/transactions', body),
    detail: (id: number, signal?: AbortSignal) => apiService.get<Transaction>(`/transactions/${id}`, undefined, signal),
    held: (params: ListParams & HeldListParams, signal?: AbortSignal) => apiService.get<HeldListData>('/transactions/held', { ...params }, signal),
    updateHeld: (id: number, body: HeldUpdatePayload) => apiService.put<Transaction>(`/transactions/${id}`, body),
    payHeld: (id: number, body: PayHeldPayload) => apiService.post<Transaction>(`/transactions/${id}/pay`, body),
    removeHeld: (id: number) => apiService.delete<null>(`/transactions/${id}`),
    list: (params: ListParams & TransactionFilters, signal?: AbortSignal) => apiService.get<TransactionListData>('/transactions', { ...params }, signal),
    summary: (params: TransactionFilters, signal?: AbortSignal) => apiService.get<SalesSummary>('/transactions/summary', { ...params }, signal),
    export: (params: TransactionFilters, filename: string) => apiService.download('/transactions/export', filename, { ...params }),
    void: (id: number, body: VoidPayload) => apiService.post<Transaction>(`/transactions/${id}/void`, body),
    createReturn: (id: number, body: ReturnPayload) => apiService.post<SalesReturn>(`/transactions/${id}/returns`, body),
};

export const salesReturnService = {
    list: (params: ListParams & SalesReturnListParams, signal?: AbortSignal) => apiService.get<SalesReturnListData>('/sales-returns', { ...params }, signal),
    detail: (id: number, signal?: AbortSignal) => apiService.get<SalesReturn>(`/sales-returns/${id}`, undefined, signal),
};
