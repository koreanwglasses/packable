import { Client, clientIn, getter, Got } from "@koreanwglasses/restate";
import { Game } from "./game";
import { Room } from "./room";
import { User } from "./user";

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type AppState = {
  user: User;
  room: Got<Room, "players"> | null;
  game: Got<Game, "players" | "myCards"> | null;
};

//////////////////////
// MODEL DEFINITION //
//////////////////////

export class App {
  @getter
  static state(@clientIn client: Client) {
    return User._getCurrentUser(client)
      .pipeAll((user) => [user, user._roomId] as const)
      .pipeAll(([user, roomId]) => {
        const room = typeof roomId === "string" ? new Room(roomId) : null;
        return [user, room, room?._gameId] as const;
      })
      .pipe(([user, room, gameId]) => {
        const game = typeof gameId === "string" ? new Game(gameId) : null;

        return {
          user,
          room,
          game,
        } as AppState;
      });
  }
}
