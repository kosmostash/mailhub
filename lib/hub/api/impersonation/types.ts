export type ParamsT99609533 = {};
export type JsonTPOST1315299790 = {
  userId: VRefine<string, {
    format: "uuid"
  }>
};
export type ResponseTPOST3593803427 = {
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
export type ResponseTDELETE3593803427 = {
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
