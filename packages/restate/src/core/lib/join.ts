/** @internal */
export const join = (...parts: (string | number)[]) => {
  let joined = "";

  let i = 0;
  for (let part of parts) {
    part = "" + part;
    if (part.endsWith("/")) part = part.slice(0, -1);
    if (part.startsWith("/")) {
      part = part.slice(1);
      if (i > 0) {
        if (("" + parts[0]).startsWith("/")) {
          joined = "";
        } else {
          joined = "" + parts[0];
          if (joined.endsWith("/")) joined = joined.slice(0, -1);
        }
      }
    }

    joined += "/" + part;

    i++;
  }

  return joined;
};
