export type ParamsT1283582034 = {};
export type JsonTPOST2963885276 = {
  from: {
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  };
  to: VRefine<Array<{
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  }>, {
    minItems: 1;
    maxItems: 100
  }>;
  cc?: VRefine<Array<{
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  }>, {
    maxItems: 100
  }>;
  bcc?: VRefine<Array<{
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  }>, {
    maxItems: 100
  }>;
  subject: VRefine<string, {
    maxLength: 998
  }>;
  text?: string;
  html?: string
};
export type ResponseTPOST297009178 = {
  id: string;
  collectionId: string;
  from: {
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  };
  to: Array<{
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  }>;
  cc: Array<{
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  }>;
  bcc: Array<{
    address: VRefine<string, {
      format: "email"
    }>;
    name?: VRefine<string, {
      maxLength: 200
    }>
  }>;
  subject: string;
  text: ((string) | (null));
  html: ((string) | (null));
  state: (("pending") | ("ready") | ("sent"));
  deliveryStatus: (("unknown") | ("sent") | ("delivered") | ("bounced"));
  attempts: number;
  lastError: ((string) | (null));
  providerMessageId: ((string) | (null));
  source: (("http") | ("smtp"));
  createdAt: string;
  reviewedAt: ((string) | (null));
  sentAt: ((string) | (null))
};
