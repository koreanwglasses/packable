import { Policy } from ".";

// By default, if any parents are private
// then this resource will not be accessible
// In addition, fields prefixed with _ will be private by default
export const DEFAULT: Policy<any> = (_1, _2, key) =>
  typeof key === "undefined" ||
  !(
    typeof key === "symbol" ||
    key.toString().startsWith("_") ||
    key === "constructor" ||
    key === "prototype"
  );

export const PUBLIC = () => true;

export const PRIVATE = () => false;
