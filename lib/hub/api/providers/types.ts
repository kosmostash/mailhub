export type ParamsT3794129943 = {};
export type ResponseTGET1408890526 = {
  providers: Array<{
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
  }>;
  types: Array<{
    type: string;
    label: string;
    implemented: boolean
  }>
};
export type JsonTPOST2858948958 = {
  name: VRefine<string, {
    minLength: 1;
    maxLength: 120
  }>;
  type: VRefine<string, {
    minLength: 1;
    maxLength: 40
  }>;
  config: {
    [k: string]: ((string) | (number) | (boolean) | (null))
  }
};
export type ResponseTPOST2909280444 = {
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
