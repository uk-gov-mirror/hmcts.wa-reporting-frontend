import config from 'config';
import { RedisStore } from 'connect-redis';
import { Application } from 'express';
import session from 'express-session';
import FileStoreFactory from 'session-file-store';

import { getRedisClient } from '../redis';

export class AppSession {
  private readonly sessionSecret: string = config.get('secrets.wa.wa-reporting-frontend-session-secret');
  private readonly cookieName: string = config.get('session.appCookie.name');

  public enableFor(app: Application): void {
    const store = this.createSessionStore(app);

    app.use(
      session({
        name: this.cookieName,
        secret: this.sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        store,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
        },
      })
    );
  }

  private createSessionStore(app: Application) {
    const client = getRedisClient(app);

    if (client) {
      return new RedisStore({
        client,
        prefix: 'wa-reporting-frontend:',
      });
    }

    const FileStore = FileStoreFactory(session);
    return new FileStore({ path: '/tmp' });
  }
}
