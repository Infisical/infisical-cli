import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessApprovalPoliciesSchema, TableName, TAccessApprovalPolicies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

export type TAccessApprovalPolicyDALFactory = ReturnType<typeof accessApprovalPolicyDALFactory>;

export const accessApprovalPolicyDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyOrm = ormify(db, TableName.AccessApprovalPolicy);

  const accessApprovalPolicyFindQuery = async (
    tx: Knex,
    filter: TFindFilter<TAccessApprovalPolicies>,
    customFilter?: {
      policyId?: string;
    }
  ) => {
    const result = await tx(TableName.AccessApprovalPolicy)
      // eslint-disable-next-line
      .where(buildFindFilter(filter))
      .where((qb) => {
        if (customFilter?.policyId) {
          void qb.where(`${TableName.AccessApprovalPolicy}.id`, "=", customFilter.policyId);
        }
      })
      .join(TableName.Environment, `${TableName.AccessApprovalPolicy}.envId`, `${TableName.Environment}.id`)
      .leftJoin(
        TableName.AccessApprovalPolicyApprover,
        `${TableName.AccessApprovalPolicy}.id`,
        `${TableName.AccessApprovalPolicyApprover}.policyId`
      )
      .leftJoin(TableName.Users, `${TableName.AccessApprovalPolicyApprover}.approverUserId`, `${TableName.Users}.id`)
      .select(
        tx.ref("approverUserId").withSchema(TableName.AccessApprovalPolicyApprover),
        tx.ref("username").withSchema(TableName.Users).as("approverUsername")
      )
      .select(tx.ref("name").withSchema(TableName.Environment).as("envName"))
      .select(tx.ref("slug").withSchema(TableName.Environment).as("envSlug"))
      .select(tx.ref("id").withSchema(TableName.Environment).as("envId"))
      .select(tx.ref("projectId").withSchema(TableName.Environment))
      .select(selectAllTableCols(TableName.AccessApprovalPolicy));

    return result;
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      const doc = await accessApprovalPolicyFindQuery(tx || db.replicaNode(), {
        [`${TableName.AccessApprovalPolicy}.id` as "id"]: id
      });
      const formattedDoc = sqlNestRelationships({
        data: doc,
        key: "id",
        parentMapper: (data) => ({
          environment: {
            id: data.envId,
            name: data.envName,
            slug: data.envSlug
          },
          projectId: data.projectId,
          ...AccessApprovalPoliciesSchema.parse(data)
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "userApprovers" as const,
            mapper: ({ approverUserId }) => ({
              userId: approverUserId
            })
          }
        ]
      });

      return formattedDoc?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const find = async (
    filter: TFindFilter<TAccessApprovalPolicies & { projectId: string }>,
    customFilter?: {
      policyId?: string;
    },
    tx?: Knex
  ) => {
    try {
      const docs = await accessApprovalPolicyFindQuery(tx || db.replicaNode(), filter, customFilter);

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ({
          environment: {
            id: data.envId,
            name: data.envName,
            slug: data.envSlug
          },
          projectId: data.projectId,
          ...AccessApprovalPoliciesSchema.parse(data)
          // secretPath: data.secretPath || undefined,
        }),
        childrenMapper: [
          {
            key: "approverUserId",
            label: "userApprovers" as const,
            mapper: ({ approverUserId, approverUsername }) => ({
              userId: approverUserId,
              username: approverUsername
            })
          }
        ]
      });

      return formattedDocs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  };

  return { ...accessApprovalPolicyOrm, find, findById };
};
