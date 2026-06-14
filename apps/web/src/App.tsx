import { useCallback, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { WorkerSessionProvider } from "./contexts/WorkerSessionContext";
import WorkerSessionStatus from "./components/WorkerSessionStatus";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import AuditReportsPage from "./pages/AuditReportsPage";
import type { AuditReportsTab } from "./pages/AuditReportsPage";
import AssetsPage from "./pages/AssetsPage";
import ConfigurationErrorPage from "./pages/ConfigurationErrorPage";
import Dashboard from "./pages/Dashboard";
import LoadingScreen from "./pages/LoadingScreen";
import LogisticsPage from "./pages/LogisticsPage";
import type { LogisticsTab } from "./pages/LogisticsPage";
import NetworkInventoryPage from "./pages/NetworkInventoryPage";
import type { NetworkTab } from "./pages/NetworkInventoryPage";
import LoginPage from "./pages/LoginPage";
import OrganizationSetupPage from "./pages/OrganizationSetupPage";
import ScannerPage from "./pages/ScannerPage";
import SettingsPage from "./pages/SettingsPage";
import UserManagementPage from "./pages/UserManagementPage";
import UserPortalPage from "./pages/UserPortalPage";
import SmartCapturePage from "./pages/SmartCapturePage";
import SupportMaintenancePage from "./pages/SupportMaintenancePage";
import type { SupportTab } from "./pages/SupportMaintenancePage";

export type OrganizationContext = {
  organizationId: string;
  organizationName: string;
  tradeName: string | null;
  legalName: string | null;
  cnpj: string | null;
  logoUrl: string | null;
  logoPath: string | null;
  role: string;
};

type AuthenticatedView =
  | "dashboard"
  | "settings"
  | "assets"
  | "scanner"
  | "support"
  | "logistics"
  | "network"
  | "capture"
  | "auditReports"
  | "users";

function AppContent() {
  const { user, isLoading } = useAuth();
  const deepLinkHandledRef = useRef(false);

  const [organization, setOrganization] =
    useState<OrganizationContext | null>(null);
  const [view, setView] = useState<AuthenticatedView>("dashboard");
  const [initialAssetId, setInitialAssetId] = useState<string | null>(null);
  const [scannerInitialCode, setScannerInitialCode] = useState<string | null>(
    null,
  );
  const [supportInitialTab, setSupportInitialTab] =
    useState<SupportTab>("tickets");
  const [logisticsInitialTab, setLogisticsInitialTab] =
    useState<LogisticsTab>("loans");
  const [networkInitialTab, setNetworkInitialTab] =
    useState<NetworkTab>("overview");
  const [auditReportsInitialTab, setAuditReportsInitialTab] =
    useState<AuditReportsTab>("audits");
  const [isLoadingOrganization, setIsLoadingOrganization] = useState(false);
  const [organizationError, setOrganizationError] = useState<string | null>(
    null,
  );

  const loadOrganization = useCallback(async () => {
    if (!user) {
      setOrganization(null);
      return;
    }

    setIsLoadingOrganization(true);
    setOrganizationError(null);

    try {
      const { data, error } = await supabase
        .from("organization_memberships")
        .select(
          "organization_id, role, organizations!inner(id, name, trade_name, legal_name, cnpj, logo_url, logo_path, status)",
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .eq("organizations.status", "active")
        .limit(1)
        .maybeSingle();

      if (error) {
        setOrganizationError(error.message);
        setOrganization(null);
        return;
      }

      if (!data) {
        setOrganization(null);
        return;
      }

      const organizationData = Array.isArray(data.organizations)
        ? data.organizations[0]
        : data.organizations;

      setOrganization({
        organizationId: data.organization_id,
        organizationName: organizationData?.name ?? "Empresa",
        tradeName: organizationData?.trade_name ?? null,
        legalName: organizationData?.legal_name ?? null,
        cnpj: organizationData?.cnpj ?? null,
        logoUrl: organizationData?.logo_url ?? null,
        logoPath: organizationData?.logo_path ?? null,
        role: data.role,
      });

      void (supabase as any).rpc("mark_my_invitation_accepted", {
        target_organization_id: data.organization_id,
      });
    } finally {
      setIsLoadingOrganization(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOrganization();
  }, [loadOrganization]);

  useEffect(() => {
    if (!organization || deepLinkHandledRef.current) {
      return;
    }

    const parameters = new URLSearchParams(window.location.search);

    if (parameters.get("asset") || parameters.get("token")) {
      deepLinkHandledRef.current = true;
      setScannerInitialCode(window.location.href);
      setView("scanner");
    }
  }, [organization]);

  const openAssets = () => {
    setInitialAssetId(null);
    setView("assets");
  };

  const openAssetById = (assetId: string) => {
    setInitialAssetId(assetId);
    setView("assets");
  };

  const openScanner = () => {
    setScannerInitialCode(null);
    setView("scanner");
  };

  const openCapture = () => {
    setView("capture");
  };

  const openSupport = (tab: SupportTab = "tickets") => {
    setSupportInitialTab(tab);
    setView("support");
  };

  const openLogistics = (tab: LogisticsTab = "loans") => {
    setLogisticsInitialTab(tab);
    setView("logistics");
  };

  const openNetwork = (tab: NetworkTab = "overview") => {
    setNetworkInitialTab(tab);
    setView("network");
  };

  const openAuditReports = (
    tab: AuditReportsTab = "audits",
  ) => {
    setAuditReportsInitialTab(tab);
    setView("auditReports");
  };

  if (supabaseConfigurationError) {
    return <ConfigurationErrorPage message={supabaseConfigurationError} />;
  }

  if (isLoading || (user && isLoadingOrganization)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (organizationError) {
    return (
      <main className="configuration-shell">
        <section className="configuration-card">
          <span className="configuration-icon">!</span>
          <h1>Não foi possível consultar a empresa</h1>
          <p>{organizationError}</p>
          <button
            className="auth-submit"
            type="button"
            onClick={() => void loadOrganization()}
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  }

  if (!organization) {
    return <OrganizationSetupPage onCreated={loadOrganization} />;
  }

  if (organization.role === "user") {
    return (
      <UserPortalPage organization={organization} />
    );
  }

  if (
    view === "users" &&
    ["owner", "admin"].includes(organization.role)
  ) {
    return (
      <UserManagementPage
        organization={organization}
        onBack={() => setView("dashboard")}
      />
    );
  }

  if (view === "settings") {
    return (
      <SettingsPage
        organization={organization}
        onBack={() => setView("dashboard")}
        onOrganizationUpdated={loadOrganization}
      />
    );
  }

  if (view === "assets") {
    return (
      <AssetsPage
        organization={organization}
        initialAssetId={initialAssetId}
        onBack={() => setView("dashboard")}
        onOpenScanner={openScanner}
      />
    );
  }

  if (view === "support") {
    return (
      <SupportMaintenancePage
        organization={organization}
        initialTab={supportInitialTab}
        onBack={() => setView("dashboard")}
        onOpenAsset={openAssetById}
      />
    );
  }

  if (view === "logistics") {
    return (
      <LogisticsPage
        organization={organization}
        initialTab={logisticsInitialTab}
        onBack={() => setView("dashboard")}
        onOpenAsset={openAssetById}
      />
    );
  }

  if (view === "network") {
    return (
      <NetworkInventoryPage
        organization={organization}
        initialTab={networkInitialTab}
        onBack={() => setView("dashboard")}
        onOpenAsset={openAssetById}
      />
    );
  }

  if (view === "auditReports") {
    return (
      <AuditReportsPage
        organization={organization}
        initialTab={auditReportsInitialTab}
        onBack={() => setView("dashboard")}
        onOpenAsset={openAssetById}
      />
    );
  }

  if (view === "capture") {
    return (
      <SmartCapturePage
        organization={organization}
        onBack={() => setView("dashboard")}
        onOpenAsset={openAssetById}
      />
    );
  }

  if (view === "scanner") {
    return (
      <ScannerPage
        organization={organization}
        initialCode={scannerInitialCode}
        onBack={() => setView("dashboard")}
        onOpenAsset={openAssetById}
      />
    );
  }

  return (
    <Dashboard
      organization={organization}
      onOpenSettings={() => setView("settings")}
      onOpenUsers={() => setView("users")}
      onOpenAssets={openAssets}
      onOpenScanner={openScanner}
      onOpenSupport={openSupport}
      onOpenLogistics={openLogistics}
      onOpenNetwork={openNetwork}
      onOpenCapture={openCapture}
      onOpenAuditReports={openAuditReports}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkerSessionProvider>
        <WorkerSessionStatus />
        <AppContent />
      </WorkerSessionProvider>
    </AuthProvider>
  );
}
