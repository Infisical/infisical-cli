import { useMemo } from "react";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { IconButton, Tag, Td, Tooltip, Tr } from "@app/components/v2";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { TabSections } from "@app/types/org";

type Props = {
  membership: TWorkspaceUser;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeUserFromProject"]>,
    data?: object
  ) => void;
};

const formatRoleName = (role: string, customRoleName?: string) => {
  if (role === ProjectMembershipRole.Custom) return customRoleName;
  if (role === ProjectMembershipRole.Admin) return "Admin";
  if (role === ProjectMembershipRole.Member) return "Developer";
  if (role === ProjectMembershipRole.Viewer) return "Viewer";
  if (role === ProjectMembershipRole.NoAccess) return "No Access";
  return role;
};

export const UserProjectRow = ({
  membership: { id, project, user, roles },
  handlePopUpOpen
}: Props) => {
  const { data: workspaces = [] } = useGetUserWorkspaces();
  const navigate = useNavigate();

  const isAccessible = useMemo(() => {
    const workspaceIds = new Map();

    workspaces?.forEach((workspace) => {
      workspaceIds.set(workspace.id, true);
    });

    return workspaceIds.has(project.id);
  }, [workspaces, project]);

  return (
    <Tr
      className="group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
      key={`user-project-membership-${id}`}
      onClick={() => {
        if (isAccessible) {
          navigate({
            to: `/${project.type}/$projectId/access` as const,
            params: {
              projectId: project.id
            },
            search: {
              selectedTab: TabSections.Member
            }
          });
          return;
        }

        createNotification({
          text: "Unable to access project",
          type: "error"
        });
      }}
    >
      <Td className="max-w-0 truncate">{project.name}</Td>
      <Td>
        <Tag size="xs">{project.type}</Tag>
      </Td>
      <Td>{`${formatRoleName(roles[0].role, roles[0].customRoleName)}${
        roles.length > 1 ? ` (+${roles.length - 1})` : ""
      }`}</Td>
      <Td>
        {isAccessible && (
          <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Tooltip content="Remove">
              <IconButton
                colorSchema="danger"
                ariaLabel="copy icon"
                variant="plain"
                className="group relative"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePopUpOpen("removeUserFromProject", {
                    username: user.username,
                    projectId: project.id,
                    projectName: project.name
                  });
                }}
              >
                <FontAwesomeIcon icon={faTrash} />
              </IconButton>
            </Tooltip>
          </div>
        )}
      </Td>
    </Tr>
  );
};