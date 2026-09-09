export type ParamsT3821716503 = {
  "id": VRefine<string, {
    format: "uuid"
  }>
};
export type ResponseTGET3325429738 = {
  id: string;
  name: string;
  type: string;
  implemented: boolean;
  config: {
    [k: string]: ((string) | (number) | (boolean) | (null))
  };
  collections: number;
  createdAt: string;
  updatedAt: string
};
export type JsonTPUT3118411284 = {
  name?: VRefine<string, {
    minLength: 1;
    maxLength: 120
  }>;
  type?: VRefine<string, {
    minLength: 1;
    maxLength: 40
  }>;
  config?: {
    [k: string]: ((string) | (number) | (boolean) | (null))
  }
};
export type ResponseTPUT3325429738 = {
  id: string;
  name: string;
  type: string;
  implemented: boolean;
  config: {
    [k: string]: ((string) | (number) | (boolean) | (null))
  };
  collections: number;
  createdAt: string;
  updatedAt: string
};
export type ResponseTDELETE2254060522 = {
  ok: true
};
