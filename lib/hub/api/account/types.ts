export type ParamsT2100713124 = {};
export type ResponseTGET2583793379 = {
  id: string;
  email: string;
  role: (("superadmin") | ("admin") | ("operator"));
  pendingChange: (({
    purpose: (("email") | ("password"));
    sentTo: string;
    expiresAt: string;
    via: string
  }) | (null));
  testAddresses: Array<{
    id: string;
    address: string;
    label: ((string) | (null));
    createdAt: string
  }>;
  impersonationTargets: Array<{
    id: string;
    email: string;
    role: string
  }>
};
