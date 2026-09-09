export type ParamsT4251240752 = {
  "id": VRefine<string, {
    minLength: 4;
    maxLength: 64
  }>
};
export type ResponseTGET3126483566 = {
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
};
export type JsonTPUT1485796998 = {
  name?: VRefine<string, {
    minLength: 1;
    maxLength: 120
  }>;
  scheduleMode?: (("after_review") | ("immediate"));
  providerId?: ((VRefine<string, {
    format: "uuid"
  }>) | (null))
};
export type ResponseTPUT3126483566 = {
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
};
export type ResponseTDELETE3529178931 = {
  ok: true
};
