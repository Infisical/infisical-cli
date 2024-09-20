export type TUserSecret = {
  id: string;
  userId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
  name: string | null;
  encryptedValue: string;
  iv: string;
  secretType?: UserSecretType;
};

export type TCreateUserSecretRequest = {
  name?: string;
  encryptedValue: string;
  hashedHex: string;
  iv: string;
  secretType?: UserSecretType;
};

export type TViewUserSecretResponse = {
  secret: {
    encryptedValue: string;
    iv: string;
    secretType: UserSecretType;
  };
};

export type TDeleteUserSecretRequest = {
  userSecretId: string;
};

export enum UserSecretType {
  Login = "login",
  CreditCard = "cc",
  SecureNote = "secure-note"
}
