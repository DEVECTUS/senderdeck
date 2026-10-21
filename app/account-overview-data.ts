export type EmailConnection = { id: string; provider: string; email: string; label: string; senderIdentities?: { email: string; isPrimary: boolean }[]; senderDiscoveryError?: string };
export type OverviewBrand = { id: string; name: string; customer_id: string };
export type SocialConnection = { id: string; provider: string; name: string; asset_id: string; status: string; capabilities: { messages?: string; comments?: string }; brand: OverviewBrand };
export type OverviewWorkspace = { customers: { id: string; name: string }[]; brands: OverviewBrand[] };

// Read through the existing authenticated APIs; never infer or widen account scope.
export async function loadAccountOverview(signal: AbortSignal, request: typeof fetch = fetch): Promise<{ emails: EmailConnection[]; accounts: SocialConnection[]; workspace: OverviewWorkspace | null; emailAvailable: boolean; socialComplete: boolean; errors: string[]; failedBrandIds: string[] }> {
  let emails: EmailConnection[] = [], accounts: SocialConnection[] = [], workspace: OverviewWorkspace | null = null;
  let emailAvailable = false, socialComplete = true;
  const errors: string[] = [];
  const failedBrandIds: string[] = [];
  async function social<T>(action: string, args: Record<string, unknown>): Promise<T> {
    const response = await request("/api/social", { method: "POST", cache: "no-store", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ action, args }) });
    if (!response.ok) throw new Error();
    return response.json();
  }
  await Promise.all([
    (async () => {
      try {
        const response = await request("/api/accounts", { cache: "no-store", signal });
        if (!response.ok) throw new Error();
        emails = (await response.json()).accounts;
        emailAvailable = true;
      } catch { errors.push("Email accounts could not be loaded. Refresh to try again."); }
    })(),
    (async () => {
      try {
        const result = await social<OverviewWorkspace>("social_workspace_list", {});
        workspace = result;
        // Bound concurrency for large workspaces and stop work on navigation.
        for (let i = 0; i < result.brands.length && !signal.aborted; i += 4) {
          await Promise.all(result.brands.slice(i, i + 4).map(async brand => {
            try {
              const data = await social<{ accounts: Omit<SocialConnection, "brand">[] }>("social_account_list", { brandId: brand.id });
              accounts.push(...data.accounts.filter(a => a.provider !== "email").map(a => ({ ...a, brand })));
            } catch { socialComplete = false; failedBrandIds.push(brand.id); errors.push(`Connections for ${brand.name} could not be loaded.`); }
          }));
        }
      } catch { socialComplete = false; errors.push("Brands and social accounts could not be loaded. Refresh to try again."); }
    })(),
  ]);
  accounts = accounts.sort((a, b) => a.name.localeCompare(b.name));
  return { emails, accounts, workspace, emailAvailable, socialComplete, errors, failedBrandIds };
}

export function groupAccountHierarchy(workspace: OverviewWorkspace, accounts: SocialConnection[], query = "", failedBrandIds: string[] = []) {
  const needle = query.trim().toLowerCase();
  const customers = [...workspace.customers];
  for (const brand of workspace.brands) if (!customers.some(c => c.id === brand.customer_id)) customers.push({ id: brand.customer_id, name: "Customer details unavailable" });
  return customers.map(customer => ({ ...customer, brands: workspace.brands.filter(b => b.customer_id === customer.id).map(brand => {
    const parentMatches = `${customer.name} ${brand.name}`.toLowerCase().includes(needle);
    const connections = accounts.filter(a => a.brand.id === brand.id && (parentMatches || `${a.name} ${a.provider} ${a.asset_id}`.toLowerCase().includes(needle)));
    return { ...brand, accounts: connections, loadFailed: failedBrandIds.includes(brand.id), matches: parentMatches || connections.length > 0 };
  }).filter(b => b.matches) })).filter(c => c.brands.length || !needle || c.name.toLowerCase().includes(needle));
}
