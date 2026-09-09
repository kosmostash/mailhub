export type ParamsT668020972 = {
  "id": VRefine<string, {
    format: "uuid"
  }>
};
export type ResponseTGET176077592 = {
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
