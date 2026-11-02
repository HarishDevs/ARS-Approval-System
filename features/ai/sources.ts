// D-168 (AI module branch): the data sources the AI module is designed for.
// Nothing is connected yet: each needs the owner's approval and a read-only
// identity first (docs/ai-module/architecture.md §6). Shown as they are,
// never with made-up figures.
export interface PlannedSource {
  key: "ars" | "salesforce" | "oracle" | "powerbi";
  name: string;
  what: string;
  needs: string;
}

export const PLANNED_SOURCES: readonly PlannedSource[] = [
  { key: "ars", name: "ARS CMS (this app)", what: "Approvals, tasks and information, limited to what each person may see.", needs: "Built with the AI engine (next phase); no approval needed, it's this app's own data." },
  { key: "salesforce", name: "Salesforce", what: "Dealers, leads, opportunities, orders, attendance, products: only the objects and fields the Super Admin allows.", needs: "The Super Admin connects Salesforce (OAuth with PKCE; a sandbox first) and lists the allowed objects and fields; each person needs a Salesforce scope." },
  { key: "oracle", name: "Oracle ERP", what: "Receivables, overdue balances, inventory, order fulfilment.", needs: "A read-only reporting account on approved views, reachable from the server." },
  { key: "powerbi", name: "Power BI datasets", what: "Approved reporting datasets already used by ARS.", needs: "The owner chooses which datasets, and a read-only service identity." },
];
