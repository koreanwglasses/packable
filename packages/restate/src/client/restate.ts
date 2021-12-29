import { Cascade, Managed, Unwrapped } from "@koreanwglasses/cascade";
import { io, Socket } from "socket.io-client";
import jsonpatch from "fast-json-patch";
import hash from "object-hash";
import {
  KW_CLOSE_FROM_CLIENT,
  DEFAULT_SIO_NAMESPACE,
  KW_DIFF,
  KW_ERROR,
  KW_RESTATE,
  SOCKET_ID_KEY,
  KW_VALUE,
  KW_CASCADE_ID,
  KW_RESEND,
  KW_CLOSE_FROM_SERVER,
} from "../core/lib/consts";
import { FetchError } from "./errors";
import { Packed, unpack, Unpacked } from "../core";
import { join } from "../core/lib/join";
import fetch from "isomorphic-unfetch";
import "colors";

export interface RestateClientOpts {
  socket?: Socket;
  resourcePath?: string;
  init?: RequestInit;
  dev?: boolean;
}

export type RestateClient = {
  resolve<T = any>(path: string, ...params: any[]): Cascade<Unpacked<T>>;
};

export default function RestateClient(
  host: string,
  opts?: RestateClientOpts
): RestateClient;
export default function RestateClient(opts?: RestateClientOpts): RestateClient;
export default function RestateClient(
  host_opts: string | RestateClientOpts = {},
  opts_?: RestateClientOpts
) {
  // Parse out overloaded params
  const [host, { socket: _socket, init, dev = false }] =
    typeof host_opts === "string"
      ? [host_opts, opts_ ?? {}]
      : ["", host_opts as RestateClientOpts];

  const debug = (...args: any) => {
    if (dev) console.log(...args);
  };

  // Connect to socket
  const socket = _socket ?? io(join(host, DEFAULT_SIO_NAMESPACE));

  const connect = new Promise<void>((res, rej) => {
    socket.once("connect", res);
    socket.once("connect_error", rej);
  });
  connect.catch((e) => {
    console.error("Failed to connect to socket --", e);
  });

  // Fetches packed data from server
  const remote = (
    path: string,
    params: any[],
    { subscribe = true }: { subscribe?: boolean } = {}
  ) => {
    let url = path.startsWith("/") ? join(host, path) : path;

    // Add query params
    if (!url.includes("?")) url += "?";
    else if (!url.endsWith("&")) url += "&";
    url += `params=${encodeURIComponent(JSON.stringify(params))}`;
    const { pathname } = new URL(url, "http://localhost");

    if (!subscribe) {
      // If subscribe is false (e.g. for calling an action) then
      // do a simple fetch

      return (async () => {
        try {
          const response = await fetch(url, init);
          if (!response.ok)
            throw new FetchError(response.statusText, await response.text());

          let retval: any;
          try {
            retval = await response.clone().json();
          } catch {
            retval = await response.text();
          }

          debug(`> Received response from ${pathname.yellow}:`, retval);
        } catch (e) {
          console.error("Could not fetch --", e);
          throw e;
        }
      })();
    }

    // subscribe === true
    return Cascade.resolve(connect)
      .pipe(async () => {
        debug(`> Sending request to ${pathname.yellow}`);

        try {
          // Append socket id to query
          url += `&${SOCKET_ID_KEY}=${socket.id}`;
          const response = await fetch(url, init);
          if (!response.ok)
            throw new FetchError(response.statusText, await response.text());

          const { [KW_VALUE]: value, [KW_CASCADE_ID]: cascadeId } =
            await response.json();

          debug(
            `> Received ${
              cascadeId ? "cascade" : "static".underline + " value"
            } from ${pathname.yellow}`
          );

          return Cascade.all([cascadeId, value] as const);
        } catch (e) {
          console.error("Could not fetch --", e);
          throw e;
        }
      })
      .pipe(([cascadeId, value]) => {
        // Static value
        if (!cascadeId) return value;

        // Set up a managed cascade and listen to socket events
        const packed = new Managed<Packed>(value);

        socket.on(`${KW_RESTATE}:${cascadeId}:${KW_ERROR}`, (error) =>
          packed.error(error)
        );

        const lastPacked = { value: value };

        socket.on(`${KW_RESTATE}:${cascadeId}:${KW_VALUE}`, (value) => {
          lastPacked.value = value;
          packed.value(value);
        });

        socket.on(
          `${KW_RESTATE}:${cascadeId}:${KW_DIFF}`,
          (diff, expectedHash) => {
            // Apply JSON patch on deep copy of diffBase
            const received = JSON.parse(JSON.stringify(lastPacked));
            jsonpatch.applyPatch(received, diff);

            const value = received.value;
            const actualHash = hash(value);
            if (expectedHash !== actualHash) {
              debug(
                `> Hash mismatch (expected: ${expectedHash}, got: ${actualHash}). Requesting server for un-diffed data.`
              );
              socket.emit(`${KW_RESTATE}:${cascadeId}:${KW_RESEND}`);
            } else {
              lastPacked.value = value;
              packed.value(value);
            }
          }
        );

        const close = () => packed.close();
        socket.once("disconnect", close);
        socket.once(
          `${KW_RESTATE}:${cascadeId}:${KW_CLOSE_FROM_SERVER}`,
          close
        );

        packed.onClose(() => {
          socket.off(`disconnect`, close);
          socket.off(`${KW_RESTATE}:${cascadeId}:${KW_CLOSE_FROM_SERVER}`);
          socket.off(`${KW_RESTATE}:${cascadeId}:${KW_ERROR}`);
          socket.off(`${KW_RESTATE}:${cascadeId}:${KW_VALUE}`);
          socket.off(`${KW_RESTATE}:${cascadeId}:${KW_DIFF}`);

          socket.emit(`${KW_RESTATE}:${cascadeId}:${KW_CLOSE_FROM_CLIENT}`);

          debug(`> Cascade from ${pathname.yellow} closed`);
        });

        return packed;
      })
      .pipe((packed) => {
        debug(`> Packed response from ${pathname.yellow}\n`, packed);
        return packed as Packed;
      });
  };

  // Fetch + unpack (i.e. hydrate) data
  const resolve = <T>(path: string, ...params: any[]): Cascade<Unpacked<T>> =>
    (remote(path, params, { subscribe: true }) as Cascade<Packed>).pipe(
      (packed) => unpack<T>(path, packed, remote),
      {
        notify: "always",
      }
    ) as any;

  return { resolve };
}
