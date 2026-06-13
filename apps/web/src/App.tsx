import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { supabase, supabaseConfigurationError } from "./lib/supabase";
import AssetCatalogPage from "./pages/AssetCatalogPage";
import ConfigurationErrorPage from "./pages/ConfigurationErrorPage";
import Dashboard from "./pages/Dashboard";
import LoadingScreen from "./pages/LoadingScreen";
import LocationsPage from "./pages/LocationsPage";
import LoginPage from "./pages/LoginPage";
import OrganizationSetupPage from "./pages/OrganizationSetupPage";

type OrganizationContext = {
  organizationId: string;
  organizationName: string;
  role: string;
};

type AuthenticatedView = "dashboard" | "locations" | "catalog";

function AppContent() {
  const { user, isLoading } = useAuth();

  const [organization, setOrganization] =
    useState<OrganizationContext | null>(null);
  const [view, setView] = useState<AuthenticatedView>("dashboard");
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
          "organization_id, role, organizations!inner(id, name, status)",
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
        role: data.role,
      });
    } finally {
      setIsLoadingOrganization(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOrganization();
  }, [loadOrganization]);

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

  if (view === "locations") {
    return (
      <LocationsPage
        organization={organization}
        onBack={() => setView("dashboard")}
      />
    );
  }

  if (view === "catalog") {
    return (
      <AssetCatalogPage
        organization={organization}
        onBack={() => setView("dashboard")}
      />
    );
  }

  return (
    <Dashboard
      organizationName={organization.organizationName}
      onOpenLocations={() => setView("locations")}
      onOpenCatalog={() => setView("catalog")}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
