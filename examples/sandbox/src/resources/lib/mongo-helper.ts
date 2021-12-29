import { Cascade } from "@koreanwglasses/cascade";
import mongoose from "mongoose";

const Class = (_this: MongoRestate<any>) =>
  _this.constructor as typeof MongoRestate;

export abstract class MongoRestate<T> {
  private declare static _instances: Record<string, MongoRestate<any>>;
  declare static _model: mongoose.Model<any>;

  _data = new Cascade(() =>
    Class(this)._model.findById(this._id).lean().exec()
  ) as Cascade<T>;

  constructor(readonly _id: string) {
    // Use interning to maintain consistent refs to
    // cascades`
    if (_id in Class(this)._instances) {
      return Class(this)._instances[_id];
    } else {
      Class(this)._instances[_id] = this;
    }
  }
}

export function model<T>(name: string, schema: mongoose.Schema<T>) {
  return function <S extends new (...args: any) => any>(constructor: S) {
    return class extends constructor {
      static _instances: Record<string, MongoRestate<any>> = {};
      static _model: mongoose.Model<T> =
        mongoose.models[name] ?? mongoose.model(name, schema);
    };
  };
}
