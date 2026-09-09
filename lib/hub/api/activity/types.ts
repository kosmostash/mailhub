export type ParamsT2893285722 = {};
export type QueryTGET697339557 = {
  operatorId?: VRefine<string, {
    format: "uuid"
  }>;
  adminId?: VRefine<string, {
    format: "uuid"
  }>;
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
export type ResponseTGET3593059769 = {
  entries: Array<{
    id: number;
    action: string;
    objectType: string;
    objectId: ((string) | (null));
    objectLabel: ((string) | (null));
    actorKind: (("user") | ("sender") | ("smtp"));
    actorEmail: ((string) | (null));
    actorRole: ((string) | (null));
    impersonatorEmail: ((string) | (null));
    detail: (({
      [k: string]: ((string) | (number) | (boolean) | (null))
    }) | (null));
    createdAt: string
  }>;
  total: number;
  limit: number;
  offset: number;
  operators: Array<{
    id: string;
    email: string
  }>;
  admins: Array<{
    id: string;
    email: string
  }>
};
