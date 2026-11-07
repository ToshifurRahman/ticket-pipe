import pg from 'pg';

import { getConfig } from './config.js';

const { Pool } = pg;

let instance: pg.Pool | undefined;

// Created on first use, so importing this module never needs DATABASE_URL: the entry points
// validate the environment before they touch the pool.
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, property) {
    instance ??= new Pool({ connectionString: getConfig().DATABASE_URL });
    const value: unknown = Reflect.get(instance, property, instance);
    return typeof value === 'function' ? (value as () => unknown).bind(instance) : value;
  },
});
