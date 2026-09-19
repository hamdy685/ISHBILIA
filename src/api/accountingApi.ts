import apiClient from './client';
import {
    Account,
    CostCenter,
    AccountsApiResponse,
    CostCentersApiResponse,
    ContractorInvoice,
    ContractorInvoicesApiResponse,
    CreateContractorInvoicePayload,
    UpdateContractorInvoicePayload,
    PettyCashSettlement,
    PettyCashSettlementsApiResponse,
    CreatePettyCashSettlementPayload,
    UpdatePettyCashSettlementPayload,
    CostCenterReportSummaryData,
    CostCentersReportApiResponse,
    CostCenterStatementData,
    CostCenterStatementApiResponse,
} from '../types/accounting';

/**
 * Fetch Chart of Accounts tree structure or filtered list.
 * Default returns hierarchical tree of root accounts with nested children.
 */
export const getAccountsTreeApi = async (params?: {
    type?: string;
    search?: string;
    flat?: boolean;
}): Promise<Account[]> => {
    const response = await apiClient.get<AccountsApiResponse>('/accounting/accounts', {
        params,
    });
    return response.data.data;
};

/**
 * Fetch a single account by ID with parent and children.
 */
export const getAccountByIdApi = async (id: number): Promise<Account> => {
    const response = await apiClient.get<{ data: Account }>(`/accounting/accounts/${id}`);
    return response.data.data;
};

/**
 * Fetch cost centers list.
 * Default returns only active cost centers unless all is true.
 */
export const getCostCentersApi = async (params?: {
    all?: boolean;
    search?: string;
}): Promise<CostCenter[]> => {
    const response = await apiClient.get<CostCentersApiResponse>('/accounting/cost-centers', {
        params,
    });
    return response.data.data;
};

/**
 * Fetch a single cost center by ID.
 */
export const getCostCenterByIdApi = async (id: number): Promise<CostCenter> => {
    const response = await apiClient.get<{ data: CostCenter }>(`/accounting/cost-centers/${id}`);
    return response.data.data;
};

/**
 * Fetch contractor invoices list with optional filters.
 */
export const getContractorInvoicesApi = async (params?: {
    status?: string;
    cost_center_id?: number;
    search?: string;
}): Promise<ContractorInvoice[]> => {
    const response = await apiClient.get<ContractorInvoicesApiResponse>('/accounting/contractor-invoices', {
        params,
    });
    return response.data.data;
};

/**
 * Fetch a single contractor invoice by ID.
 */
export const getContractorInvoiceByIdApi = async (id: number): Promise<ContractorInvoice> => {
    const response = await apiClient.get<{ data: ContractorInvoice }>(`/accounting/contractor-invoices/${id}`);
    return response.data.data;
};

/**
 * Create a new contractor invoice.
 */
export const createContractorInvoiceApi = async (
    payload: CreateContractorInvoicePayload
): Promise<ContractorInvoice> => {
    const response = await apiClient.post<{ data: ContractorInvoice; message: string }>(
        '/accounting/contractor-invoices',
        payload
    );
    return response.data.data;
};

/**
 * Update an existing contractor invoice (allowed only before approval).
 */
export const updateContractorInvoiceApi = async (
    id: number,
    payload: UpdateContractorInvoicePayload
): Promise<ContractorInvoice> => {
    const response = await apiClient.put<{ data: ContractorInvoice; message: string }>(
        `/accounting/contractor-invoices/${id}`,
        payload
    );
    return response.data.data;
};

/**
 * Delete a draft contractor invoice.
 */
export const deleteContractorInvoiceApi = async (id: number): Promise<void> => {
    await apiClient.delete(`/accounting/contractor-invoices/${id}`);
};

/**
 * Approve a contractor invoice, generating a balanced Journal Entry automatically.
 */
export const approveContractorInvoiceApi = async (id: number): Promise<ContractorInvoice> => {
    const response = await apiClient.post<{ data: ContractorInvoice; message: string }>(
        `/accounting/contractor-invoices/${id}/approve`
    );
    return response.data.data;
};

/**
 * Fetch petty cash settlements list with optional filters.
 */
export const getPettyCashSettlementsApi = async (params?: {
    status?: string;
    cost_center_id?: number;
    search?: string;
}): Promise<PettyCashSettlement[]> => {
    const response = await apiClient.get<PettyCashSettlementsApiResponse>('/accounting/petty-cash-settlements', {
        params,
    });
    return response.data.data;
};

/**
 * Fetch a single petty cash settlement by ID.
 */
export const getPettyCashSettlementByIdApi = async (id: number): Promise<PettyCashSettlement> => {
    const response = await apiClient.get<{ data: PettyCashSettlement }>(`/accounting/petty-cash-settlements/${id}`);
    return response.data.data;
};

/**
 * Create a new petty cash settlement.
 */
export const createPettyCashSettlementApi = async (
    payload: CreatePettyCashSettlementPayload
): Promise<PettyCashSettlement> => {
    const response = await apiClient.post<{ data: PettyCashSettlement; message: string }>(
        '/accounting/petty-cash-settlements',
        payload
    );
    return response.data.data;
};

/**
 * Update a draft/pending petty cash settlement.
 */
export const updatePettyCashSettlementApi = async (
    id: number,
    payload: UpdatePettyCashSettlementPayload
): Promise<PettyCashSettlement> => {
    const response = await apiClient.put<{ data: PettyCashSettlement; message: string }>(
        `/accounting/petty-cash-settlements/${id}`,
        payload
    );
    return response.data.data;
};

/**
 * Delete a draft petty cash settlement.
 */
export const deletePettyCashSettlementApi = async (id: number): Promise<void> => {
    await apiClient.delete(`/accounting/petty-cash-settlements/${id}`);
};

/**
 * Approve a petty cash settlement, generating a balanced Journal Entry automatically.
 */
export const approvePettyCashSettlementApi = async (id: number): Promise<PettyCashSettlement> => {
    const response = await apiClient.post<{ data: PettyCashSettlement; message: string }>(
        `/accounting/petty-cash-settlements/${id}/approve`
    );
    return response.data.data;
};

/**
 * Fetch project costs & cost centers report summary.
 */
export const getCostCentersReportSummaryApi = async (params?: {
    search?: string;
}): Promise<CostCenterReportSummaryData> => {
    const response = await apiClient.get<CostCentersReportApiResponse>('/accounting/reports/cost-centers', {
        params,
    });
    return response.data.data;
};

/**
 * Fetch detailed statement of movements for a cost center.
 */
export const getCostCenterStatementApi = async (
    costCenterId: number,
    params?: { from_date?: string; to_date?: string }
): Promise<CostCenterStatementData> => {
    const response = await apiClient.get<CostCenterStatementApiResponse>(
        `/accounting/reports/cost-centers/${costCenterId}/statement`,
        { params }
    );
    return response.data.data;
};

