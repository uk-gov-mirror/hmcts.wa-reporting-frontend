import { constants as http } from 'node:http2';

import config from 'config';
import { RedisStore } from 'connect-redis';
import { Application, Request, Response } from 'express';
import { Session, SessionStore, auth } from 'express-openid-connect';
import session from 'express-session';
import { jwtDecode } from 'jwt-decode';
import FileStoreFactory from 'session-file-store';

import { HTTPError } from '../../app/errors/HttpError';
import { User } from '../../interfaces/User';
import { getRedisClient } from '../redis';

export class OidcMiddleware {
  private readonly clientId: string = config.get('services.idam.clientID');
  private readonly clientSecret: string = config.get('secrets.wa.wa-reporting-frontend-client-secret');
  private readonly clientScope: string = config.get('services.idam.scope');
  private readonly baseUrl: string = config.get('services.idam.url.wa');
  private readonly idamBaseUrl: string = config.get('services.idam.url.public');
  private readonly sessionSecret: string = config.get('secrets.wa.wa-reporting-frontend-session-secret');
  private readonly accessRole: string = config.get('RBAC.access');
  private readonly sessionCookieName: string = config.get('session.cookie.name');

  public enableFor(app: Application): void {
    app.use(
      auth({
        issuerBaseURL: this.idamBaseUrl + '/o',
        baseURL: this.baseUrl,
        httpTimeout: 15099,
        clientID: this.clientId,
        secret: this.sessionSecret,
        clientSecret: this.clientSecret,
        clientAuthMethod: 'client_secret_post',
        idpLogout: true,
        authorizationParams: {
          response_type: 'code',
          scope: this.clientScope,
        },
        session: {
          name: this.sessionCookieName,
          rollingDuration: 60 * 60,
          cookie: {
            httpOnly: true,
          },
          rolling: true,
          store: this.getSessionStore(app),
        },
        afterCallback: (req: Request, res: Response, oidcSession: Session) => {
          if (res.statusCode === http.HTTP_STATUS_OK && oidcSession.id_token) {
            const tokenUser = jwtDecode(oidcSession.id_token) as {
              uid: string;
              email: string;
              roles: string[];
            };
            if (!tokenUser.roles.includes(this.accessRole)) {
              throw new HTTPError(http.HTTP_STATUS_FORBIDDEN);
            }
            const user = {
              id: tokenUser.uid,
              email: tokenUser.email,
              roles: tokenUser.roles,
            } as User;
            return { ...oidcSession, user };
          } else {
            throw new HTTPError(http.HTTP_STATUS_FORBIDDEN);
          }
        },
      })
    );

    app.use((req, _res, next) => {
      if (!req.oidc?.isAuthenticated?.()) {
        throw new HTTPError(http.HTTP_STATUS_FORBIDDEN);
      }

      const roles = req.oidc?.user?.roles ?? [];
      if (!roles.includes(this.accessRole)) {
        throw new HTTPError(http.HTTP_STATUS_FORBIDDEN);
      }

      next();
    });
  }

  private getSessionStore(app: Application): SessionStore {
    const fileStore = FileStoreFactory(session);

    const client = getRedisClient(app);

    if (client) {
      return new RedisStore({
        client,
        prefix: 'wa-reporting-frontend:',
      }) as unknown as SessionStore;
    }

    return new fileStore({ path: '/tmp' }) as unknown as SessionStore;
  }
}
