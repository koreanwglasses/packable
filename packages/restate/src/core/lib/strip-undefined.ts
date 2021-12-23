/** @internal */
export const stripUndefined = (target: any): any => {
  if (Array.isArray(target)) {
    return target.map((v) =>
      typeof v === "undefined" ? null : stripUndefined(v)
    );
  } else if (
    target &&
    (typeof target === "object" || typeof target === "function")
  ) {
    return Object.fromEntries(
      Object.entries(target)
        .filter(([, value]) => typeof value !== "undefined")
        .map(([key, value]) => [key, stripUndefined(value)])
    );
  } else {
    return target;
  }
};
