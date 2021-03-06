import { ChildProcess } from "child_process";
import get from "lodash/get";

export interface IIntergradeOptions<C> {
  changes?: string[];
  type?: "spawn" | "fork" | "exec";
  token?: C;
  defineCancel?: (child: ChildProcess, token: C) => void;
}

export interface ICommandPlugin {
  name: string;
  description: string;
  options: Array<[string, string]>;
  action: (...args: any[]) => void;
  help: (...args: any[]) => void;
}

export interface IENV {
  NODE_ENV?: string;
  NODE_PORT?: number | string;
  [key: string]: any;
}

export interface IRouterConfig {
  enabled?: boolean;
  always?: boolean;
  approot?: string;
  filetype?: "js" | "ts";
  details?: boolean;
  tsconfig?: string;
}

export interface IConfigCompilerCmdConfig {
  enabled?: boolean;
  force?: boolean;
  configroot?: string;
  outputroot?: string;
  tsconfig?: string;
  increment?: boolean;
}

export interface IMiddlewareCompilerCmdConfig {
  enabled?: boolean;
  force?: boolean;
  root?: string;
  output?: string;
  tsconfig?: string;
  increment?: boolean;
}

export interface ICmdConfig {
  tsconfig?: string;
  inspect?: boolean;
  env?: IENV;
  watch?: string[] | false;
  ignore?: string[] | false;
  verbose?: boolean;
  debug?: boolean | string;
  mock?: boolean | string;
  typeCheck?: boolean;
  transpile?: boolean;
  routers?: IRouterConfig;
  compile?: boolean;
  configCompiler?: IConfigCompilerCmdConfig & { hmr?: boolean };
  middlewareCompiler?: IMiddlewareCompilerCmdConfig & { hmr?: boolean };
}

export type Env<T> = { env?: Record<string, string> } & T;

export interface IInnerCmdConfig extends ICmdConfig {
  env?: IENV & { __TSCONFIG?: any; __TRANSPILE?: any };
  exec?: string;
}

export function createCmdConfig(config: ICmdConfig): ICmdConfig {
  return config;
}

export function mergeCmdConfig(config: ICmdConfig, merge: ICmdConfig): ICmdConfig {
  const watch = get(merge, "watch", undefined);
  const ignore = get(merge, "ignore", undefined);
  const oldEnvs = get(merge, "env", {});
  const newEnvs = get(merge, "env", {});
  return {
    tsconfig: get(merge, "tsconfig", config.tsconfig),
    inspect: get(merge, "inspect", config.inspect),
    env: {
      ...oldEnvs,
      ...newEnvs,
    },
    watch: !watch ? config.watch : config.watch !== false ? [...(config.watch || []), ...watch] : [],
    ignore: !ignore ? config.ignore : config.ignore !== false ? [...(config.ignore || []), ...ignore] : [],
    verbose: get(merge, "verbose", config.verbose),
    debug: get(merge, "debug", config.debug),
    mock: get(merge, "mock", config.mock),
    typeCheck: get(merge, "typeCheck", config.typeCheck),
    transpile: get(merge, "transpile", config.transpile),
    compile: get(merge, "compile", config.compile),
    routers: {
      ...get(config, "routers", {}),
      ...get(merge, "routers", {}),
    },
    configCompiler: {
      ...get(config, "configCompiler", {}),
      ...get(merge, "configCompiler", {}),
    },
    middlewareCompiler: {
      ...get(config, "middlewareCompiler", {}),
      ...get(merge, "middlewareCompiler", {}),
    },
  };
}
