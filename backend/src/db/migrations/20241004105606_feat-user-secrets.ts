import { Knex } from "knex";

import { TableName } from "../schemas";

enum CredentialTypes {
  WebLogin = "web_login",
  CreditCard = "credit_card",
  SecureNote = "secure_note"
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserSecrets))) {
    await knex.schema.createTable(TableName.UserSecrets, (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.uuid("userId").notNullable();
      table.uuid("orgId").notNullable();
      table.timestamp("createdAt").defaultTo(knex.fn.now());
      table.timestamp("updatedAt").defaultTo(knex.fn.now());

      table.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      table.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      table.unique(["userId", "orgId"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.UserSecretCredentials))) {
    await knex.schema.createTable(TableName.UserSecretCredentials, (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.uuid("secretId").notNullable();
      table.enum("credentialType", Object.values(CredentialTypes)).notNullable();
      table.string("title").notNullable();
      table.text("fields").notNullable();
      table.timestamp("createdAt").defaultTo(knex.fn.now());
      table.timestamp("updatedAt").defaultTo(knex.fn.now());

      table.foreign("secretId").references("id").inTable(TableName.UserSecrets).onDelete("CASCADE");
      table.unique(["secretId", "title"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables
  await knex.schema.dropTableIfExists(TableName.UserSecretCredentials);
  await knex.schema.dropTableIfExists(TableName.UserSecrets);
}
