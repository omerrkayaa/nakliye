import { Global, Module } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export const DB = Symbol("DB");
export type Db = NodePgDatabase<typeof schema>;
/** Db.transaction içindeki işlem nesnesi */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Db => {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
