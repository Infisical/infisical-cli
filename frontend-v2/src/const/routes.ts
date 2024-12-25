import { FileRouteTypes } from "@app/routeTree.gen";

const setRoute = <TFull extends FileRouteTypes["fullPaths"], TId extends FileRouteTypes["id"]>(
  full: TFull,
  id: TId
) => ({ full, id }) as const;

export const ROUTE_PATHS = Object.freeze({
  ProviderSuccessPage: setRoute(
    "/login/provider/success",
    "/_restrict-login-signup/login/provider/success"
  ),
  SignUpSsoPage: setRoute("/signup/sso", "/_restrict-login-signup/signup/sso/"),
  PasswordResetPage: setRoute("/password-reset", "/_restrict-login-signup/password-reset"),
  OrgGroupDetailsByIDPage: setRoute(
    "/organization/groups/$groupId",
    "/_authenticate/_ctx-org-details/organization/_layout-org/groups/$groupId/"
  ),
  OrgIdentityDetailsByIDPage: setRoute(
    "/organization/identities/$identityId",
    "/_authenticate/_ctx-org-details/organization/_layout-org/identities/$identityId/"
  ),
  OrgUserDetailsByIDPage: setRoute(
    "/organization/memberships/$membershipId",
    "/_authenticate/_ctx-org-details/organization/_layout-org/memberships/$membershipId/"
  ),
  OrgAccessControlPage: setRoute(
    "/organization/members",
    "/_authenticate/_ctx-org-details/organization/_layout-org/members/"
  ),
  OrgRoleByIDPage: setRoute(
    "/organization/roles/$roleId",
    "/_authenticate/_ctx-org-details/organization/_layout-org/roles/$roleId/"
  ),
  ProductAccessControlPage: setRoute(
    "/secret-manager/$projectId/access",
    "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/access/"
  ),
  SecretDashboardPage: setRoute(
    "/secret-manager/$projectId/secrets/$envSlug",
    "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/secrets/$envSlug/"
  ),
  CertAuthDetailsByIDPage: setRoute("cert-auth", "cert-auth"),
  CertCertificatesPage: setRoute("cert-list", "cert-list"),
  CertPkiCollectionDetailsByIDPage: setRoute("cert-pki-collection", "cert-pki-collection")
});
