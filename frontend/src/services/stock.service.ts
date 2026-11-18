import { apiService } from './api.service';
import type { ListParams } from '@/types/api.types';
import type {
    AdjustmentPayload,
    BatchListData,
    BatchListParams,
    MarkPaidPayload,
    OpnameCreatePayload,
    OpnameDetail,
    OpnameItemsPayload,
    OpnameListData,
    OpnameStatus,
    PayableListParams,
    Purchase,
    PurchaseListData,
    PurchaseListParams,
    PurchasePayload,
} from '@/types/stock.types';
import type { ProductBatch } from '@/types/master.types';

export const purchaseService = {
    list: (params: ListParams & PurchaseListParams, signal?: AbortSignal) => apiService.get<PurchaseListData>('/purchases', { ...params }, signal),
    /** Unpaid purchases ordered by due date, with totals in `summary`. */
    payables: (params: ListParams & PayableListParams, signal?: AbortSignal) => apiService.get<PurchaseListData>('/purchases/payables', { ...params }, signal),
    detail: (id: number, signal?: AbortSignal) => apiService.get<Purchase>(`/purchases/${id}`, undefined, signal),
    /** Posting: adds batches and stock, creates the payable. Cannot be edited afterwards. */
    create: (body: PurchasePayload) => apiService.post<Purchase>('/purchases', body),
    markPaid: (id: number, body: MarkPaidPayload) => apiService.post<Purchase>(`/purchases/${id}/mark-paid`, body),
};

export const batchService = {
    list: (params: ListParams & BatchListParams, signal?: AbortSignal) => apiService.get<BatchListData>('/batches', { ...params }, signal),
    export: (params: BatchListParams, filename: string) => apiService.download('/batches/export', filename, { ...params }),
    adjust: (id: number, body: AdjustmentPayload) => apiService.post<ProductBatch>(`/batches/${id}/adjustment`, body),
};

export const opnameService = {
    list: (params: ListParams & { status?: OpnameStatus | '' }, signal?: AbortSignal) => apiService.get<OpnameListData>('/stock-opnames', { ...params }, signal),
    detail: (id: number, signal?: AbortSignal) => apiService.get<OpnameDetail>(`/stock-opnames/${id}`, undefined, signal),
    create: (body: OpnameCreatePayload) => apiService.post<OpnameDetail>('/stock-opnames', body),
    saveItems: (id: number, body: OpnameItemsPayload) => apiService.put<OpnameDetail>(`/stock-opnames/${id}/items`, body),
    post: (id: number) => apiService.post<OpnameDetail>(`/stock-opnames/${id}/post`),
    remove: (id: number) => apiService.delete<null>(`/stock-opnames/${id}`),
};
