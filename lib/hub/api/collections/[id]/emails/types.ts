export type ParamsT3756010019 = {
  "id": VRefine<string, {
    minLength: 4;
    maxLength: 64
  }>
};
export type QueryTGET3570308899 = {
  state?: (("pending") | ("ready") | ("sent"));
  deliveryStatus?: (("unknown") | ("sent") | ("delivered") | ("bounced"));
  limit?: VRefine<number, {
    minimum: 1;
    maximum: 200;
    multipleOf: 1
  }>;
  offset?: VRefine<number, {
    minimum: 0;
    multipleOf: 1
  }>
};
export type ResponseTGET75641126 = {
  emails: Array<{
    id: string;
    subject: string;
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
    state: (("pending") | ("ready") | ("sent"));
    deliveryStatus: (("unknown") | ("sent") | ("delivered") | ("bounced"));
    attempts: number;
    lastError: ((string) | (null));
    createdAt: string;
    sentAt: ((string) | (null))
  }>;
  total: number;
  limit: number;
  offset: number
};
