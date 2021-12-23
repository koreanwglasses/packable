import { Cascade, Volatile } from "@koreanwglasses/cascade";
import asyncHandler from "express-async-handler";
import express, { Request, Response, Router } from "express";
import { Server, Namespace } from "socket.io";
import hash from "object-hash";
import jsonpatch from "fast-json-patch";
import { nanoid } from "nanoid";
import { Client, pack } from "../core";
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
} from "../core/lib/consts";
import { BAD_REQUEST, FORBIDDEN, NOT_FOUND, NOT_IMPLEMENTED } from "./errors";
import { join } from "../core/lib/join";
import { getPackOptions } from "../core/metadata";
import "colors";

const DEV = process.env.NODE_ENV === "development";

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
    target: unknown,
    path: string[] = [],
    i = 0,
    ...params: any
  ): Promise<any> {
    if (target instanceof Volatile)
      return Cascade.$({ target }).$(({ target }) =>
        this.resolve(client, target, path, i, ...params)
      );

    const isObject = target && typeof target === "object";
    const isFunction = typeof target === "function";

    if (i < path.length) {
      if (isObject || isFunction) {
        const key = path[i];

        if (!(key in target))
          throw NOT_FOUND(
            `Failed to resolve resource at ${join(
              ...path.slice(0, i + 1)
            )}: Resource does not exist`
          );

        // Check access
        const { policy: resourcePolicy } = getPackOptions(target);
        const { policy: fieldPolicy, clientParamIndex } = getPackOptions(
          target,
          key
        );

        const clientHasAccess =
          (await Cascade.flatten(resourcePolicy(client, target)).next()) &&
          (await Cascade.flatten(fieldPolicy(client, target, key)).next());

        if (!clientHasAccess)
          throw FORBIDDEN(
            `You are not allowed to access ${join(...path.slice(0, i + 1))}`
          );

        // Insert client into params at the specified index this resolves to
        // a function call
        let _params = params;
        if (i === path.length - 1 && typeof clientParamIndex === "number") {
          while (_params.length < clientParamIndex) _params.push(undefined);
          _params[clientParamIndex] = client;
        }

        // Resolve next piece
        const nextTarget = (target as any)[key];
        return await this.resolve(
          client,
          typeof nextTarget === "function"
            ? nextTarget.bind(target)
            : nextTarget,
          path,
          i + 1,
          ..._params
        );
      }
    } else {
      if (isObject || isFunction) {
        // Make sure client has access to resource
        const { policy } = getPackOptions(target);

        if (!(await Cascade.flatten(policy(client, target)).next())) {
          throw FORBIDDEN(`You are not allowed to access ${join(...path)}`);
        }
      }

      if (isFunction) {
        try {
          return await target(...params);
        } catch (e) {
          if (
            e instanceof TypeError &&
            /^Class constructor ([a-zA-Z_$][0-9a-zA-Z_$]*) cannot be invoked without 'new'$/.test(
              e.message.split("\n")[0]
            )
          ) {
            // Handle the specific case where function is actually a class
            return target;
          } else {
            throw e;
          }
        }
      } else {
        return target;
      }
    }

    throw NOT_FOUND(
      `Failed to resolve resource at ${join(...path.slice(0, i + 1))}`
    );
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

      const result = await this.resolve(client, target, path, 0, ...params);

      // Use sockets to stream data from Cascade, if possible
      const socketId = req.query[SOCKET_ID_KEY];
      if (typeof socketId === "string") {
        const packed = pack(client, result);

        // Get the first value
        const next = await packed.get(true);

        if (result instanceof Volatile || Object.values(next.refs).length) {
          // Open a pipe to socket if result is volatile or has refs that can change
          const pipe = this.pipeToSocket(req, packed);
          res.send({
            [KW_CASCADE_ID]: pipe.cascadeId,
            [KW_VALUE]: next,
          });
        } else {
          // Otherwise, just send the data once and close
          packed.close();
          res.send({
            [KW_CASCADE_ID]: null,
            [KW_VALUE]: next,
          });
        }
      } else {
        res.send(result);
      }
    } catch (e) {
      console.error(`Error while handling request for ${req.url}:`, e);
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
