import { Cascade } from "@koreanwglasses/cascade";
import { Client, clientIn, view, action } from "@koreanwglasses/restate";
import { HTTPError } from "@koreanwglasses/restate/server";
import mongoose from "mongoose";
import { model, MongoRestate } from "./lib/mongo-helper";

import { User } from "./user";

///////////////////////
// TYPE DECLARATIONS //
///////////////////////

export type Card = `${
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A"}${"C" | "H" | "S" | "D"}`;

type GameData = {
  players: {
    id: string;
    cards: Card[];
  }[];
  activePlayerId: string;
  cardAliases: Partial<Record<Card, string>>;
};

const schema = new mongoose.Schema<GameData>({
  players: [
    {
      id: String,
      cards: [String],
    },
  ],
  activePlayerId: String,
  cardAliases: {},
});

//////////////
// POLICIES //
//////////////

function PLAYERS_ONLY() {}

///////////
// STATE //
///////////

@model("Game", schema)
export class Game extends MongoRestate<GameData> {
  ////////////////
  // DATA MODEL //
  ////////////////

  declare static _model: mongoose.Model<GameData>;

  _players = this._data.pipe((data) => data.players);
  _activePlayerId = this._data.pipe((data) => data.activePlayerId);
  _cardAliases = this._data.pipe((data) => data.cardAliases);

  /////////////////////
  // DYNAMIC QUERIES //
  /////////////////////

  @view
  players(client: Client) {
    return Cascade.all([
      User._getCurrentUser(client),
      this._players,
      this._activePlayerId,
      this._cardAliases,
    ] as const).pipe(([currentUser, players, activePlayerId, cardAliases]) =>
      players.map((player) => ({
        user: new User(player.id),
        cards: player.cards.map((card) => cardAliases[card]!),
        isSelf: player.id === currentUser._id,
        isActive: player.id === activePlayerId,
      }))
    );
  }

  @view
  myCards(client: Client) {
    return Cascade.all([
      User._getCurrentUser(client),
      this._players,
    ] as const).pipe(
      ([currentUser, players]) =>
        players.find((player) => player.id === currentUser._id)!.cards
    );
  }

  //////////////////
  // BASE ACTIONS //
  //////////////////

  @action
  static async _init(playerIds: string[]) {
    const hands = deal();

    const game = new Game._model({
      players: playerIds.map((id, i) => ({ id, cards: hands[i] })),
    });
    await game.save();
    return new Game(String(game._id));
  }

  @action
  async reorderMyCards(cards: Card[], @clientIn client?: Client) {
    const currentUser = await User._getCurrentUser(client!);

    const game = await Game._model.findById(this._id).exec();
    if (!game) throw new HTTPError(404);

    const currentPlayer = game.players.find(
      (player) => player.id === currentUser._id
    );
    if (!currentPlayer) throw new HTTPError(404);

    currentPlayer.cards = cards;
    await game.save();

    this._data.invalidate();
  }
}

////////////////////
// STATIC HELPERS //
////////////////////

function deal() {
  const cards = [..."2345679TJQKA"]
    .map((rank) => [..."CHSD"].map((suit) => rank + suit))
    .flat() as Card[];

  // Shuffle
  for (let i = 0; i < cards.length; i++) {
    const swap = (i: number, j: number) => {
      [cards[i], cards[j]] = [cards[j], cards[i]];
    };

    const j = Math.floor(i + Math.random() * (cards.length - i));
    swap(i, j);
  }

  // Split
  const hands: Card[][] = [];
  for (let i = 0; i < 6; i++) {
    hands.push(cards.slice(i * 8, (i + 1) * 8));
  }
  return hands;
}
