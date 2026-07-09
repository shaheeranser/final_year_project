/**
 * Minimal ambient type declarations for ltijs (no official @types package).
 * Only the API surface used by this project is typed.
 */
declare module "ltijs" {
  import type { Express, Request, Response, NextFunction } from "express";

  export interface IdTokenUserInfo {
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
  }

  export interface IdTokenPlatformContext {
    roles: string[];
    contextId?: string;
    resource?: { id: string };
    endpoint?: {
      lineitem?: string;
      scope?: string[];
    };
  }

  export interface IdToken {
    iss: string;
    user: string;
    userInfo: IdTokenUserInfo;
    platformContext: IdTokenPlatformContext;
  }

  export interface PlatformConfig {
    url: string;
    name: string;
    clientId: string;
    authenticationEndpoint: string;
    accesstokenEndpoint: string;
    authConfig: {
      method: string;
      key: string;
    };
  }

  type OnConnectCallback = (
    token: IdToken,
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;

  export class Provider {
    static setup(
      encryptionKey: string,
      database: { url: string },
      options?: Record<string, unknown>
    ): void;

    static deploy(options?: { serverless?: boolean }): Promise<boolean>;

    static registerPlatform(config: PlatformConfig): Promise<unknown>;

    static onConnect(callback: OnConnectCallback): void;

    static app: Express;
  }

  const lti: { Provider: typeof Provider };
  export default lti;
}
