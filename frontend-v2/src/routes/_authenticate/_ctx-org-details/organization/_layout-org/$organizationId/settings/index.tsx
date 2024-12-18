import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OrgTabGroup } from "./-components";

const SettingsOrg = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 py-6 text-white">
        <div className="w-full max-w-4xl px-6">
          <div className="mb-4">
            <p className="text-3xl font-semibold text-gray-200">{t("settings.org.title")}</p>
          </div>
          <div className="flex w-full justify-center bg-bunker-800 py-6 text-white">
            <div className="w-full max-w-4xl px-6">
              <div className="mb-4">
                <p className="text-3xl font-semibold text-gray-200">{t("settings.org.title")}</p>
              </div>
              <OrgTabGroup />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const SettingsOrgQueryParams = z.object({
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/$organizationId/settings/"
)({
  component: SettingsOrg,
  validateSearch: zodValidator(SettingsOrgQueryParams)
});