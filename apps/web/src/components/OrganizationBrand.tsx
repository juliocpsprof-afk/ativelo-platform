import type { OrganizationContext } from "../App";

type Props = {
  organization: OrganizationContext;
  compact?: boolean;
  showLegalName?: boolean;
  logoOnly?: boolean;
};

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0]?.toUpperCase() ?? "",
    )
    .join("");
}

export default function OrganizationBrand({
  organization,
  compact = false,
  showLegalName = false,
  logoOnly = false,
}: Props) {
  const displayName =
    organization.tradeName ||
    organization.organizationName ||
    "Empresa";

  return (
    <div
      className={[
        "organization-brand",
        compact ? "compact" : "",
        logoOnly ? "logo-only" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        logoOnly
          ? `Marca ${displayName}`
          : undefined
      }
    >
      {organization.logoUrl ? (
        <img
          src={organization.logoUrl}
          alt={`Logo ${displayName}`}
        />
      ) : (
        <div className="organization-brand-placeholder">
          {getInitials(displayName) || "EM"}
        </div>
      )}

      {!logoOnly && (
        <div>
          <strong>{displayName}</strong>

          {showLegalName &&
            organization.legalName &&
            organization.legalName !==
              displayName && (
              <span>
                {organization.legalName}
              </span>
            )}

          {organization.cnpj && (
            <small>
              CNPJ {organization.cnpj}
            </small>
          )}
        </div>
      )}
    </div>
  );
}