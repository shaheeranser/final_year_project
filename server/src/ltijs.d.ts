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

  /** Mongoose connection options forwarded to mongoose.connect(). */
  export interface DatabaseConnectionOptions {
    family?: 4 | 6;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
    heartbeatFrequencyMS?: number;
    connectTimeoutMS?: number;
    maxPoolSize?: number;
    minPoolSize?: number;
    retryWrites?: boolean;
    retryReads?: boolean;
    /** @deprecated Ignored in Mongoose 7+. */
    useNewUrlParser?: boolean;
    /** @deprecated Ignored in Mongoose 7+. */
    useUnifiedTopology?: boolean;
    /** Escape hatch for any other Mongoose ConnectOptions field. */
    [key: string]: unknown;
  }

  export interface DatabaseConfig {
    url: string;
    connection?: DatabaseConnectionOptions;
    /** Custom database plugin instance (replaces built-in Mongoose store). */
    plugin?: unknown;
    /** Enable Mongoose query debugging. */
    debug?: boolean;
  }

  export interface ProviderSetupOptions {
    appRoute?: string;
    loginRoute?: string;
    keysetRoute?: string;
    devMode?: boolean;
    [key: string]: unknown;
  }

  type OnConnectCallback = (
    token: IdToken,
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;

  type ErrorHookCallback = (
    req: Request,
    res: Response,
  ) => unknown;

  export class Provider {
    static setup(
      encryptionKey: string,
      database: DatabaseConfig,
      options?: ProviderSetupOptions
    ): void;

    static deploy(options?: { serverless?: boolean; port?: number; silent?: boolean }): Promise<boolean>;

    static close(options?: { serverless?: boolean }): Promise<boolean>;

    static registerPlatform(config: PlatformConfig): Promise<unknown>;

    static onConnect(callback: OnConnectCallback): void;

    static onInvalidToken(callback: ErrorHookCallback): void;

    static onUnregisteredPlatform(callback: ErrorHookCallback): void;

    static app: Express;
  }

  const lti: { Provider: typeof Provider };
  export default lti;
}
