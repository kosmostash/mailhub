export type ParamsT2055526591 = {
  "provider": VRefine<string, {
    minLength: 1;
    maxLength: 40;
    pattern: "^[a-z0-9_-]+$"
  }>
};
export type RawTPOST86264359 = VRefine<string, {
  maxLength: 1000000
}>;
export type ResponseTPOST3544324176 = {
  matched: number;
  received: number
};
