// Seed safety guard, in its own file so it can be tested without running the seeder.
/** The seeder DELETES every store, application, admin, product, order and review, then creates demo accounts
 *  with published passwords. It therefore refuses to run unless it is clearly pointed at a local or test database. */
export function assertSafeToSeed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed: NODE_ENV is production. The seeder deletes all data.')
  if (env.ALLOW_SEED !== 'yes') throw new Error('Refusing to seed: set ALLOW_SEED=yes to confirm you mean to wipe this database.')
  const uri = env.MONGODB_MASTER_URI || 'mongodb://localhost:27017/orvexatech_master'
  const hostAndDb = uri.replace(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?/, '')   // drop the scheme and any credentials: never inspect them
  const safe = /^(localhost|127\.0\.0\.1)(:\d+)?\//.test(hostAndDb) || /(?:^|[/._-])(?:test|staging|dev|local)(?:[/._-]|$)/i.test(hostAndDb)
  if (!safe) throw new Error('Refusing to seed: the database address does not look like a local, test, dev or staging database.')
}
