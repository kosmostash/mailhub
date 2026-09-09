export type ParamsT1553268728 = {};
export type ResponseTGET861866862 = {
  collections: Array<{
    id: string;
    name: string;
    scheduleMode: (("after_review") | ("immediate"));
    providerId: ((string) | (null));
    providerName: ((string) | (null));
    owner: {
      id: string;
      email: string;
      role: (("superadmin") | ("admin") | ("operator"))
    };
    counters: {
      total: number;
      pending: number;
      ready: number;
      sent: number;
      delivered: number;
      bounced: number
    }
  }>;
  providerChoices: Array<{
    id: string;
    name: string;
    type: string
  }>
};
