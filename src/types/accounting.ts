export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
    id: number;
    code: string;
    name: string;
    type: AccountType;
    parent_id: number | null;
    is_active: boolean;
    children?: Account[];
    parent?: Account | null;
    created_at?: string;
    updated_at?: string;
}

export interface CostCenter {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface AccountsApiResponse {
    data: Account[];
    count: number;
}

export interface CostCentersApiResponse {
    data: CostCenter[];
    count: number;
}

export type ContractorInvoiceStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAID';

export interface JournalEntryLineSummary {
    id: number;
    account_id: number;
    cost_center_id: number | null;
    debit: string | number;
    credit: string | number;
    description: string | null;
    account?: {
        id: number;
        code: string;
        name: string;
    };
}

export interface JournalEntrySummary {
    id: number;
    date: string;
    description: string | null;
    reference_number: string | null;
    status: 'DRAFT' | 'POSTED';
    lines?: JournalEntryLineSummary[];
}

export interface ContractorInvoice {
    id: number;
    cost_center_id: number;
    contractor_name: string;
    invoice_number: string;
    date: string;
    amount: string | number;
    description: string | null;
    status: ContractorInvoiceStatus;
    journal_entry_id: number | null;
    cost_center?: CostCenter;
    journal_entry?: JournalEntrySummary;
    created_at?: string;
    updated_at?: string;
}

export interface ContractorInvoicesApiResponse {
    data: ContractorInvoice[];
    count: number;
}

export interface CreateContractorInvoicePayload {
    cost_center_id: number;
    contractor_name: string;
    invoice_number: string;
    date: string;
    amount: number;
    description?: string;
    status?: 'DRAFT' | 'PENDING_APPROVAL';
}

export interface UpdateContractorInvoicePayload {
    cost_center_id?: number;
    contractor_name?: string;
    invoice_number?: string;
    date?: string;
    amount?: number;
    description?: string;
    status?: 'DRAFT' | 'PENDING_APPROVAL';
}

export type PettyCashSettlementStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED';

export interface PettyCashSettlement {
    id: number;
    cost_center_id: number;
    employee_name: string;
    settlement_number: string;
    date: string;
    amount: string | number;
    description: string | null;
    status: PettyCashSettlementStatus;
    journal_entry_id: number | null;
    cost_center?: CostCenter;
    journal_entry?: JournalEntrySummary;
    created_at?: string;
    updated_at?: string;
}

export interface PettyCashSettlementsApiResponse {
    data: PettyCashSettlement[];
    count: number;
}

export interface CreatePettyCashSettlementPayload {
    cost_center_id: number;
    employee_name: string;
    settlement_number: string;
    date: string;
    amount: number;
    description?: string;
    status?: 'DRAFT' | 'PENDING_APPROVAL';
}

export interface UpdatePettyCashSettlementPayload {
    cost_center_id?: number;
    employee_name?: string;
    settlement_number?: string;
    date?: string;
    amount?: number;
    description?: string;
    status?: 'DRAFT' | 'PENDING_APPROVAL';
}

// ── Project Costs & Cost Centers Report Types ──────────────────────────────
export interface CostCenterCostSummaryItem {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    total_cost: number;
    movements_count: number;
}

export interface CostCenterReportSummaryData {
    summary: {
        total_projects: number;
        total_expenditure: number;
        average_project_cost: number;
        highest_project: {
            id: number;
            code: string;
            name: string;
            total_cost: number;
        } | null;
    };
    cost_centers: CostCenterCostSummaryItem[];
}

export interface CostCentersReportApiResponse {
    success: boolean;
    data: CostCenterReportSummaryData;
}

export interface CostCenterStatementMovement {
    id: number;
    journal_entry_id: number;
    date: string | null;
    reference_number: string | null;
    entry_description: string | null;
    line_description: string | null;
    account_id: number;
    account_code: string | null;
    account_name: string | null;
    account_type: string | null;
    debit: number;
    credit: number;
    net_amount: number;
}

export interface CostCenterStatementData {
    cost_center: {
        id: number;
        code: string;
        name: string;
        is_active: boolean;
    };
    totals: {
        total_debit: number;
        total_credit: number;
        net_cost: number;
        movements_count: number;
    };
    movements: CostCenterStatementMovement[];
}

export interface CostCenterStatementApiResponse {
    success: boolean;
    data: CostCenterStatementData;
}

