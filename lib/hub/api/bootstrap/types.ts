export type ParamsT1369654896 = {};
export type JsonTPOST1435842669 = {
  email: VRefine<string, {
    format: "email";
    maxLength: 320
  }>;
  password: VRefine<string, {
    minLength: 10;
    maxLength: 512
  }>
};
export type ResponseTPOST3332056247 = {
  actor: (({
    account: {
      id: string;
      email: string;
      role: (("superadmin") | ("admin") | ("operator"))
    };
    identity: {
      id: string;
      email: string;
      role: (("superadmin") | ("admin") | ("operator"))
    };
    impersonating: boolean;
    capabilities: {
      manageCollections: boolean;
      manageProviders: boolean;
      manageOperators: boolean;
      manageAdmins: boolean;
      impersonate: boolean
    }
  }) | (null));
  needsBootstrap: boolean
};
