import { connect } from "./database";
import MongoDBStoreFactory from "connect-mongodb-session";
import { uri } from "./database";
import next from "next";
import express from "express";
import expressSession, { Session } from "express-session";
import iosession from "express-socket.io-session";
import { Server as IO } from "socket.io";
import { App } from "../resources/app";
import { RestateServer } from "@koreanwglasses/restate/server";
import { User } from "../resources/user";
import { Room } from "../resources/room";

const nextApp = next({ dev: process.env.NODE_ENV === "development" });
const handler = nextApp.getRequestHandler();

const app = express();

const session = expressSession({
  secret: "secret",
  store: new (MongoDBStoreFactory(expressSession))({
    uri,
    collection: "sessions",
  }),
  resave: true,
  saveUninitialized: true,
});
app.use(session);

const io = new IO();

io.of("/restate.io").use(iosession(session, { autoSave: true }) as any);
io.of("/restate.io").on("connect", (socket) => {
  const session = (socket.handshake as any).session;

  if (session?.userId) {
    new User(session.userId)._reconnect();
  }

  socket.on("disconnect", () => {
    const session = (socket.handshake as any).session;
    if (session?.userId) {
      new User(session.userId)._disconnect(Date.now());
    }
  });
});

declare module "@koreanwglasses/restate" {
  interface Client {
    session: Session;
  }
}

const restate = new RestateServer({
  server: io,
  makeClient: (req) => ({ session: req.session }),
});

app.use("/api/app", restate.serve(App));
app.use("/api/room", restate.serve(Room));

(async () => {
  await nextApp.prepare();
  await connect();

  app.all("*", (req, res) => {
    if (!(req.path.startsWith("/_next/") || req.path.startsWith("/__nextjs")))
      console.log("next", req.path);
    return handler(req, res);
  });

  const server = app.listen(3000, () => {
    console.log("> Server listening on http://localhost:3000");
  });
  io.attach(server);
})();
