import pg from 'pg';

import { pickConfig } from './config.js';

const { Pool } = pg;

let instance: pg.Pool | undefined;

// Created on first use, so importing this module never needs DATABASE_URL: the entry points
// validate the environment before they touch the pool. Only DATABASE_URL is read, so a script
// that needs the database alone (purge) does not need the rest of the environment.
function current(): pg.Pool {
  instance ??= new Pool({ connectionString: pickConfig(['DATABASE_URL']).DATABASE_URL });
  return instance;
}

// A stand-in for the pool that behaves like it: methods are bound to the real pool, and
// `instanceof pg.Pool` and `in` answer for the real pool too.
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, property) {
    const value: unknown = Reflect.get(current(), property, current());
    return typeof value === 'function' ? (value as () => unknown).bind(current()) : value;
  },
  has: (_target, property) => Reflect.has(current(), property),
  getPrototypeOf: () => Reflect.getPrototypeOf(current()),
});
