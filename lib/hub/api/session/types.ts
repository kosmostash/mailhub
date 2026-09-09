export type ParamsT3494172116 = {};
export type ResponseTGET3867457522 = {
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
export type JsonTPOST3608539142 = {
  email: VRefine<string, {
    format: "email";
    maxLength: 320
  }>;
  password: VRefine<string, {
    minLength: 1;
    maxLength: 512
  }>
};
export type ResponseTPOST3867457522 = {
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
export type ResponseTDELETE3867457522 = {
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
