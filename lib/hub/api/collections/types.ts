export type ParamsT3542471662 = {};
export type JsonTPOST3852567927 = {
  name: VRefine<string, {
    minLength: 1;
    maxLength: 120
  }>;
  scheduleMode: (("after_review") | ("immediate"));
  providerId?: ((VRefine<string, {
    format: "uuid"
  }>) | (null))
};
export type ResponseTPOST3325353673 = {
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
  admin: (({
    id: string;
    email: string;
    role: (("superadmin") | ("admin") | ("operator"))
  }) | (null));
  counters: {
    total: number;
    pending: number;
    ready: number;
    sent: number;
    delivered: number;
    bounced: number
  }
};
