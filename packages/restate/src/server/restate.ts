import { Cascade } from "@koreanwglasses/cascade";

import asyncHandler from "express-async-handler";
import express, { Request, Response, Router } from "express";
import { Server, Namespace } from "socket.io";
import hash from "object-hash";
import jsonpatch from "fast-json-patch";
import { nanoid } from "nanoid";
import { Client } from "../core";
import {
  KW_CLOSE_FROM_CLIENT,
  DEFAULT_SIO_NAMESPACE,
  KW_DIFF,
  KW_ERROR,
  KW_RESTATE,
  KW_RESEND,
  SOCKET_ID_KEY,
  KW_VALUE,
  KW_CASCADE_ID,
  KW_CLOSE_FROM_SERVER,
} from "../core/consts";
import { BAD_REQUEST, FORBIDDEN, NOT_FOUND, NOT_IMPLEMENTED } from "./errors";
import { join } from "../core/lib/join";
import { getRestateMetadata } from "../core/metadata";
import "colors";
import { pack } from "../core/pack";

const DEV = process.env.NODE_ENV === "development";
if (DEV) {
  require("@koreanwglasses/cascade/debug");
}

const debug = (...args: any) => {
  if (DEV) console.log(...args);
};

export class RestateServer {
  private io: Namespace;
  private makeClient: (req: Request) => Client;

  constructor({
    server,
    namespace = DEFAULT_SIO_NAMESPACE,
    makeClient,
  }: {
    server: Server;
    namespace?: string;
    makeClient: (req: Request) => Client;
  }) {
    this.io = server.of(namespace);
    this.makeClient = makeClient;

    this.io.on("connect", (socket) => {
      debug(`> Socket ${socket.id.yellow} connected`);

      socket.on("disconnect", () => {
        debug(`> Socket ${socket.id.yellow} disconnected`);
      });
    });
  }

  /**
   * Resolves nested routes ot the appropriate data endpoint
   */
  private async resolve(
    client: Client,
    target: any,
    path: string[] = [],
    params: any[],
    _debugPath = ""
  ): Promise<{ value: any; isResponseFromAction: boolean }> {
    if (target instanceof Cascade) {
      const result = target.pipe((target) =>
        this.resolve(client, target, path, params, _debugPath)
      );
      // Get metadata from cascade
      const { isResponseFromAction } = await result.get();
      return {
        value: result.pipe((result) => result.value),
        isResponseFromAction,
      };
    }

    const isObject = target && typeof target === "object";
    const isFunction = typeof target === "function";

    // Check permissions
    if (isObject || isFunction) {
      const { policy } = getRestateMetadata(target);
      const clientHasAccess = await Cascade.resolve(
        policy(client, target)
      ).get();

      if (!clientHasAccess)
        throw FORBIDDEN(`You do not have access to ${join(_debugPath)}`);
    }

    if (path.length === 0) {
      // Fully resolved. Return target
      return { value: target, isResponseFromAction: false };
    }

    // Parse remaining path
    if (isObject || isFunction) {
      const key = path[0];

      if (!(key in target)) {
        throw NOT_FOUND(
          `Failed to resolve resource at ${join(
            _debugPath,
            key
          )}: Resource does not exist`
        );
      }

      const { policy, clientIn, isView, isAction } = getRestateMetadata(
        target,
        key
      );

      // Check access
      const clientHasAccess = await Cascade.resolve(
        policy(client, target, key)
      ).get();

      if (!clientHasAccess)
        throw FORBIDDEN(`You do not have access to ${join(_debugPath, key)}`);

      // Resolve next piece
      let nextTarget = target[key];
      if (typeof nextTarget === "function") {
        if (isView) {
          // If next target is a getter, evalute and continue resolving
          nextTarget = await target[key](client);
        } else if (path.length === 1) {
          // If next target is a function and the end of the path has been reached,
          // invoke the function on the target (ensures the function's `this` is
          // properly bound)

          // Add client to params (if specified) and attempt to call function
          // (may fail if function is a constructor)
          if (typeof clientIn === "number") {
            while (params.length <= clientIn) params.push(undefined);
            params[clientIn] = client;
          }

          try {
            return {
              value: await target[key](...params),
              isResponseFromAction: isAction,
            };
          } catch (e) {
            if (e instanceof TypeError) {
              // We may have tried to invoke a non-callable constructor
              // Until there's a better way to tell, we'll just carry on
              // assuming its a class.
            } else {
              throw e;
            }
          }
        }
      }

      return await this.resolve(
        client,
        nextTarget,
        path.splice(1),
        params,
        join(_debugPath, key)
      );
    }

    throw NOT_FOUND(`Failed to resolve resource at ${_debugPath}`);
  }

  private pipeToSocket(req: Request, cascade: Cascade<any>) {
    const socketId = req.query[SOCKET_ID_KEY];
    if (typeof socketId !== "string") throw BAD_REQUEST("Invalid socket id");

    const socket = this.io.sockets.get(socketId);
    if (!socket) throw BAD_REQUEST("Could not find socket");

    const cascadeId = nanoid();

    const devDebugInfo = `for ${req.originalUrl.split("?")[0].yellow} (cid: ${
      cascadeId.slice(0, 4).yellow
    }${"...".yellow}) to socket ${socket.id.yellow}`;
    debug(`> Opening cascade ${devDebugInfo}`);

    const lastPacked: { value: any } = { value: undefined };

    socket.on(`${KW_RESTATE}:${cascadeId}:${KW_RESEND}`, () => {
      debug(`> Resending ${devDebugInfo}`);
      socket.emit(`${KW_RESTATE}:${cascadeId}:${KW_VALUE}`, lastPacked.value);
    });

    const pipe = cascade
      .pipe((value) => {
        debug(`> Sending diff ${devDebugInfo}`);

        const diff = jsonpatch.compare(lastPacked, { value });
        lastPacked.value = value;

        socket.emit(`${KW_RESTATE}:${cascadeId}:${KW_DIFF}`, diff, hash(value));
      })
      .catch((error) => {
        console.error(
          `Error in cascade ${
            DEV ? devDebugInfo : `from ${req.originalUrl.split("?")[0].yellow}`
          }\n`,
          error
        );

        socket.emit(`${KW_RESTATE}:${cascadeId}:${KW_ERROR}`, {
          name: error.name,
          message: error.message,
          code: error.code,
        });
      });

    const close = () => pipe.close();

    socket.on("disconnect", close);
    socket.on(`${KW_RESTATE}:${cascadeId}:${KW_CLOSE_FROM_CLIENT}`, close);

    pipe.onClose(() => {
      socket.off("disconnect", close);
      socket.off(`${KW_RESTATE}:${cascadeId}:${KW_CLOSE_FROM_CLIENT}`, close);

      socket.emit(`${KW_RESTATE}:${cascadeId}:${KW_CLOSE_FROM_SERVER}`);
      debug(`> Closed cascade ${devDebugInfo}`);
    });

    return {
      cascadeId,
      close,
    };
  }

  private async handler(target: unknown, req: Request, res: Response) {
    debug(`> Received request for ${req.originalUrl.split("?")[0].yellow}`);

    try {
      const client = this.makeClient(req);
      const method = req.method;
      if (!(method === "GET" || method === "POST")) {
        throw NOT_IMPLEMENTED();
      }

      const path = req.params[0].split("/").filter((s) => s);

      const params =
        method === "GET"
          ? JSON.parse((req.query.params as string) ?? "[]")
          : req.body.params ?? [];

      const result = await this.resolve(
        client,
        target,
        path,
        params,
        req.baseUrl
      );

      // Use sockets to stream data if result is Cascade
      const socketId = req.query[SOCKET_ID_KEY];
      if (typeof socketId === "string") {
        const packed = pack(client, result.value);

        // Get the first value
        const first = await packed.get();

        if (
          (result.value instanceof Cascade ||
            Object.values(first.refs).find((ref) => ref.isCascade)) &&
          !result.isResponseFromAction
        ) {
          const pipe = this.pipeToSocket(req, packed);
          res.send({
            [KW_CASCADE_ID]: pipe.cascadeId,
            [KW_VALUE]: first,
          });
        } else {
          packed.close();
          res.send({
            [KW_CASCADE_ID]: null,
            [KW_VALUE]: first,
          });
        }
      } else {
        res.send(await Cascade.resolve(result).get({ keepAlive: false }));
      }
    } catch (e) {
      console.error(
        `Error while handling request for ${req.originalUrl.split("?")[0]}:`,
        e
      );
      if (e instanceof Error) {
        res.statusCode = (e as any).code ?? 500;
        if (DEV) res.send(`${e.stack}`);
        else res.send(`${e.message}`);
      } else {
        res.sendStatus(500);
      }
    }
  }

  serve(target: any) {
    const router = Router();

    router.use(express.json());
    router.get(
      "(/*)?",
      asyncHandler((req, res) =>
        this.handler(target, req as Request, res as Response)
      )
    );
    router.post(
      "(/*)?",
      asyncHandler((req, res) =>
        this.handler(target, req as Request, res as Response)
      )
    );

    return router;
  }
}
