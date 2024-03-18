import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  useDeleteIntegration,
  useDeleteIntegrationAuths,
  useGetCloudIntegrations,
  useGetUserWsKey,
  useGetWorkspaceAuthorizations,
  useGetWorkspaceBot,
  useGetWorkspaceIntegrations,
  useUpdateBotActiveStatus
} from "@app/hooks/api";
import { IntegrationAuth, TCloudIntegration } from "@app/hooks/api/types";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

import { CloudIntegrationSection } from "./components/CloudIntegrationSection";
import { FrameworkIntegrationSection } from "./components/FrameworkIntegrationSection";
import { type FilterIntegrationData, IntegrationsSection } from "./components/IntegrationsSection";
import { generateBotKey, redirectForProviderAuth } from "./IntegrationPage.utils";

type Props = {
  frameworkIntegrations: Array<{ name: string; slug: string; image: string; docsLink: string }>;
};

export const IntegrationsPage = withProjectPermission(
  ({ frameworkIntegrations }: Props) => {
    const { t } = useTranslation();
    const { createNotification } = useNotificationContext();

    const [slugMapIntegration, setSlugMapIntegration] = useState<Record<string, TCloudIntegration>>(
      {}
    );
    const [filterEnvironment, setFilterEnvironment] = useState<string>();
    const [filterIntegrationSlug, setFilterIntegrationSlug] = useState<string>();
    const [sortIntegration, setSortIntegration] = useState<string>();

    const { currentWorkspace } = useWorkspace();
    const workspaceId = currentWorkspace?.id || "";
    const environments = currentWorkspace?.environments || [];

    const { data: latestWsKey } = useGetUserWsKey(workspaceId);

    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "activeBot"
    ] as const);

    const { data: cloudIntegrations, isLoading: isCloudIntegrationsLoading } =
      useGetCloudIntegrations();

    const {
      data: integrationAuths,
      isLoading: isIntegrationAuthLoading,
      isFetching: isIntegrationAuthFetching
    } = useGetWorkspaceAuthorizations(
      workspaceId,
      useCallback((data: IntegrationAuth[]) => {
        const groupBy: Record<string, IntegrationAuth> = {};
        data.forEach((el) => {
          groupBy[el.integration] = el;
        });
        return groupBy;
      }, [])
    );

    useEffect(() => {
      const newSlugMapIntegration: Record<string, TCloudIntegration> = {};
      cloudIntegrations?.forEach((int) => {
        newSlugMapIntegration[int.slug] = int;
      });

      setSlugMapIntegration(newSlugMapIntegration);
    }, [cloudIntegrations]);

    // mutation
    const {
      data: integrations,
      isLoading: isIntegrationLoading,
      isFetching: isIntegrationFetching
    } = useGetWorkspaceIntegrations({
      workspaceId,
      envId: filterEnvironment,
      slug: filterIntegrationSlug,
      sort: sortIntegration
    });

    const { data: bot } = useGetWorkspaceBot(workspaceId);

    // mutation
    const { mutateAsync: updateBotActiveStatus, mutate: updateBotActiveStatusSync } =
      useUpdateBotActiveStatus();
    const { mutateAsync: deleteIntegration } = useDeleteIntegration();
    const {
      mutateAsync: deleteIntegrationAuths,
      isSuccess: isDeleteIntegrationAuthSuccess,
      reset: resetDeleteIntegrationAuths
    } = useDeleteIntegrationAuths();

    const isIntegrationsAuthorizedEmpty = !Object.keys(integrationAuths || {}).length;
    const isIntegrationsEmpty = !integrations?.length;
    // summary: this use effect is trigger when all integration auths are removed thus deactivate bot
    // details: so on successfully deleting an integration auth, immediately integration list is refetched
    // After the refetch is completed check if its empty. Then set bot active and reset the submit hook for isSuccess to go back to false
    useEffect(() => {
      if (
        isDeleteIntegrationAuthSuccess &&
        !isIntegrationFetching &&
        !isIntegrationAuthFetching &&
        isIntegrationsAuthorizedEmpty &&
        isIntegrationsEmpty
      ) {
        if (bot?.id && currentWorkspace?.version === ProjectVersion.V1)
          updateBotActiveStatusSync({
            isActive: false,
            botId: bot.id,
            workspaceId
          });
        resetDeleteIntegrationAuths();
      }
    }, [
      isIntegrationFetching,
      isDeleteIntegrationAuthSuccess,
      isIntegrationAuthFetching,
      isIntegrationsAuthorizedEmpty,
      isIntegrationsEmpty
    ]);

    const handleProviderIntegration = async (provider: string) => {
      const selectedCloudIntegration = cloudIntegrations?.find(({ slug }) => provider === slug);
      if (!selectedCloudIntegration) return;

      try {
        if (bot && !bot.isActive && currentWorkspace?.version === ProjectVersion.V1) {
          const botKey = generateBotKey(bot.publicKey, latestWsKey!);
          await updateBotActiveStatus({
            workspaceId,
            botKey,
            isActive: true,
            botId: bot.id
          });
        }

        redirectForProviderAuth(selectedCloudIntegration);
      } catch (error) {
        console.error(error);
      }
    };

    // function to start integration for a provider
    // confirmation to user passing the bot key for provider to get secret access
    const handleProviderIntegrationStart = (provider: string) => {
      if (!bot?.isActive) {
        handlePopUpOpen("activeBot", { provider });
        return;
      }
      handleProviderIntegration(provider);
    };

    const handleUserAcceptBotCondition = () => {
      const { provider } = popUp.activeBot?.data as { provider: string };
      handleProviderIntegration(provider);
      handlePopUpClose("activeBot");
    };

    const handleIntegrationDelete = async (integrationId: string, cb: () => void) => {
      try {
        await deleteIntegration({ id: integrationId, workspaceId });
        if (cb) cb();
        createNotification({
          type: "success",
          text: "Deleted integration"
        });
      } catch (err) {
        console.error(err);
        createNotification({
          type: "error",
          text: "Failed to delete integration"
        });
      }
    };

    const handleIntegrationAuthRevoke = async (provider: string, cb?: () => void) => {
      const integrationAuthForProvider = integrationAuths?.[provider];
      if (!integrationAuthForProvider) return;

      try {
        await deleteIntegrationAuths({
          integration: provider,
          workspaceId
        });
        if (cb) cb();
        createNotification({
          type: "success",
          text: "Revoked provider authentication"
        });
      } catch (err) {
        console.error(err);
        createNotification({
          type: "error",
          text: "Failed to revoke provider authentication"
        });
      }
    };

    function handleFilterIntegration(data: FilterIntegrationData) {
      setFilterEnvironment(data.environment);
      setFilterIntegrationSlug(data.integration);
      setSortIntegration(data.sort);
    }

    return (
      <div className="container mx-auto max-w-7xl pb-12 text-white">
        <IntegrationsSection
          isLoading={isIntegrationLoading}
          cloudIntegrations={cloudIntegrations}
          slugMapIntegration={slugMapIntegration}
          integrations={integrations}
          environments={environments}
          onFilterChange={(data) => handleFilterIntegration(data)}
          onIntegrationDelete={({ id }, cb) => handleIntegrationDelete(id, cb)}
          isBotActive={bot?.isActive}
          workspaceId={workspaceId}
        />
        <CloudIntegrationSection
          isLoading={isCloudIntegrationsLoading || isIntegrationAuthLoading}
          cloudIntegrations={cloudIntegrations}
          integrationAuths={integrationAuths}
          onIntegrationStart={handleProviderIntegrationStart}
          onIntegrationRevoke={handleIntegrationAuthRevoke}
        />
        <Modal
          isOpen={popUp.activeBot?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("activeBot", isOpen)}
        >
          <ModalContent
            title={t("integrations.grant-access-to-secrets") as string}
            footerContent={
              <div className="flex items-center space-x-2">
                <Button onClick={() => handleUserAcceptBotCondition()}>
                  {t("integrations.grant-access-button") as string}
                </Button>
                <Button
                  onClick={() => handlePopUpClose("activeBot")}
                  variant="outline_bg"
                  colorSchema="secondary"
                >
                  Cancel
                </Button>
              </div>
            }
          >
            {t("integrations.why-infisical-needs-access")}
          </ModalContent>
        </Modal>
        <FrameworkIntegrationSection frameworks={frameworkIntegrations} />
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Integrations }
);
