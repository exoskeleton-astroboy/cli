import chalk from "chalk";
import childProcess, { ChildProcess, spawn } from "child_process";
import * as chokidar from "chokidar";
import fs from "fs";
// @ts-ignore no typings
import kill = require("kill-port");
import get from "lodash/get";
import throttle from "lodash/throttle";
import path from "path";
import ts from "typescript";
import { ICommandPlugin, IIntergradeOptions } from "../base";
import { CancellationToken } from "../utils/cancellation-token";
import { loadConfig } from "../utils/load-config";
import { NormalizedMessage } from "../utils/normalized-msg";
import { TRANSFROM } from "../utils/transform";
import { runConfigCompile } from "./config";
import { runMiddlewareCompile } from "./middleware";
import { runRoutersBuilder } from "./routers";

// tslint:disable: no-console

const STATR_BASH = "🎩 - START APP BASH";
const WATCHING = "👀 - WATCHING";
const IGNORED = "🐒 - IGNORED";
const ENVS = "🏠 - ENVS";
const BOOTSTRAP = "🚚 - APP STARTING";
const TYPE_CHECK = "👮 - TYPE CHECKING";
const TYPE_GOOD = "👌 - TS CHECK GOOD";
const TYPE_OVER = "🏁 - TS CHECK OVER";
const CONF_RELOAD = "🐔 - CONFIGS RE-COMPILE";
const MIDDLES_RELOAD = "🦆 - MIDDLEWARES RE-COMPILE";
const FILES_CHANGED = "😱 - FILES CHANGED";

export interface IDevCmdOptions {
  config: string;
  debug: string | boolean;
  env: string;
  port: number | string;
  mock: string | boolean;
  tsconfig: string;
  inspect: boolean;
  compile: boolean;
}

interface IForkCmdOptions {
  command: string;
  args: string[];
  env: any;
  check: boolean;
  cwd: string;
  tsconfig?: string;
  token: CancellationToken;
  checkProcess?: ChildProcess;
  mainProcess?: ChildProcess;
  changes: string[];
}

export const DevPlugin: ICommandPlugin = {
  name: "dev",
  description: "本地开发，开启后端服务",
  options: [
    ["-C, --config [exoskeletonConfig]", "使用自定义的exoskeleton.config.js配置文件"],
    ["-D, --debug [debugName]", "开启 debug 模式"],
    ["-E, --env [NODE_ENV]", "设置 NODE_ENV 环境变量，默认 development"],
    ["-P, --port [NODE_PORT]", "设置 NODE_PORT 环境变量，默认 8201"],
    ["-M, --mock [proxyUrl]", "开启 mock 模式，默认 proxy 地址为 http://127.0.0.1:8001"],
    ["-T, --tsconfig [config]", "使用自定义的ts编译配置文件"],
    ["-I, --inspect [inspect]", "启用inspector，开启编辑器断点调试"],
    ["--compile", "启用编译"],
  ],
  help: () => {
    console.log("");
    console.log("  Examples:");
    console.log("");
    console.log("    $ exoskeleton dev");
    console.log("    $ exoskeleton dev --debug");
    console.log("    $ exoskeleton dev --debug koa:application");
    console.log("    $ exoskeleton dev --debug --mock");
    console.log("    $ exoskeleton dev --mock http://127.0.0.1:8001");
    console.log("    $ exoskeleton dev --mock");
    console.log("    $ exoskeleton dev --env pre");
    console.log("    $ exoskeleton dev --port 8201");
    console.log("    $ exoskeleton dev --env development --port 8201");
    console.log("    $ exoskeleton dev --tsconfig app/tsconfig.json");
    console.log("    $ exoskeleton dev --inspect");
    console.log();
  },
  async action(_, command: IDevCmdOptions) {
    if (_ !== "dev") return;
    return action(false, command);
  },
};

export async function action(onlyCompile: boolean, command: IDevCmdOptions) {
  console.log(chalk.green("========= [Exoskeleton CLI] <==> DEVTOOL ========\n"));
  const projectRoot = process.cwd();
  if (!fs.existsSync(`${projectRoot}/app/app.ts`)) {
    console.log(chalk.yellow("PROJECT INIT FAILED\n"));
    console.log(chalk.red(`NO FILE [${projectRoot}/app/app.ts] EXIST`));
    return;
  }
  const fileName = command.config || "exoskeleton.config.js";
  console.log(`${chalk.white("🤨 - TRY LOAD FILE : ")}${chalk.yellow(fileName)}`);
  const config = loadConfig(projectRoot, fileName);

  if (config.env) {
    config.env = {
      ...config.env,
      NODE_ENV: command.env ? command.env : config.env.NODE_ENV || "development",
      NODE_PORT: command.port ? command.port : config.env.NODE_PORT || 8201,
    };
  } else {
    config.env = {
      NODE_ENV: command.env ? command.env : "development",
      NODE_PORT: command.port ? command.port : 8201,
    };
  }
  if (config.watch === false) {
    config.watch = [];
  } else if (!config.watch) {
    config.watch = [
      path.join(projectRoot, "app/**/*.*"),
      path.join(projectRoot, "config/**/*.*"),
      path.join(projectRoot, "plugins/**/*.*"),
    ];
  }
  if (config.ignore === false) {
    config.ignore = [];
  } else if (!config.ignore) {
    config.ignore = [];
  }
  if (config.verbose === undefined) config.verbose = true;
  if (config.inspect === undefined) config.inspect = true;
  if (command.debug) config.debug = command.debug;
  if (command.tsconfig) config.tsconfig = command.tsconfig;
  if (command.mock) config.mock = command.mock;
  config.inspect = String(config.inspect) === "true";
  const checkStr = String(config.typeCheck);
  const transpile = String(config.transpile);
  const compile = String(config.compile);
  config.typeCheck = checkStr === "undefined" ? true : checkStr === "true";
  config.transpile = transpile === "undefined" ? true : transpile === "true";
  config.compile = compile === "undefined" ? false : compile === "true";

  const defaultC = TRANSFROM.configs({});
  const defaultM = TRANSFROM.middlewares({});
  const defaultR = TRANSFROM.routers({});

  let useConfigCompile = false;
  let useConfigHMR = false;
  let configWatchRoot = "";
  if (config.configCompiler) {
    const { enabled = false, configroot = "", increment = true } = {
      ...defaultC,
      ...config.configCompiler,
    };
    useConfigHMR = increment;
    configWatchRoot = path.resolve(projectRoot, configroot);
    if (enabled && (config.compile || onlyCompile)) useConfigCompile = true;
  }

  let useMiddlewareCompile = false;
  let useMiddlewareHMR = false;
  let middleWatchRoot = "";
  if (config.middlewareCompiler) {
    const { enabled = false, root = "", increment = true } = {
      ...defaultM,
      ...config.middlewareCompiler,
    };
    useMiddlewareHMR = increment;
    middleWatchRoot = path.resolve(projectRoot, root);
    if (enabled && (config.compile || onlyCompile)) useMiddlewareCompile = true;
  }

  let useRouterBuilds = false;
  let ctorRoot = "app/controllers";
  if (config.routers) {
    const { enabled = false } = {
      ...defaultR,
      ...config.routers,
    };
    ctorRoot = path.resolve(projectRoot, ctorRoot);
    if (enabled && (config.compile || onlyCompile)) useRouterBuilds = true;
  }

  // ts-node register
  config.env.__TSCONFIG = config.tsconfig || "-";
  // fix: for tsconfig-paths support
  config.env.TS_NODE_PROJECT = config.tsconfig || "tsconfig.json";
  config.env.__TRANSPILE = config.typeCheck && !config.transpile ? "false" : "true";

  if (config.debug && config.debug === true) {
    config.env.DEBUG = "*";
  } else if (config.debug && String(config.debug) !== "true") {
    config.env.DEBUG = config.debug;
  }

  const node = `node${!!config.inspect ? " --inspect" : ""}`;

  let tscPathMap = "";
  let tsNode = "";
  try {
    const tsnode = require.resolve("ts-node");
    const registerFile = path.resolve(__dirname, "../register");
    tsNode = `-r ${registerFile}`;
    tscPathMap = `-r ${require.resolve("tsconfig-paths").replace("/lib/index.js", "")}/register`;
    config.env.APP_EXTENSIONS = JSON.stringify(["js", "ts"]);
    config.exec = `${node} ${tsNode} ${tscPathMap} ${path.join(projectRoot, "app/app.ts")}`;
  } catch (error) {
    if ((<string>error.message || "").includes("ts-node")) {
      console.log(chalk.red("NEED TS-NODE"));
      return;
    } else {
      console.log(chalk.red(error));
      return;
    }
  }

  if (config.mock) {
    const url = config.mock === true ? "http://127.0.0.1:8001" : config.mock;
    config.env.HTTP_PROXY = url;
    config.env.HTTPS_PROXY = url;
  }

  async function runConfigs(options: IIntergradeOptions<CancellationToken> = {}, throws = false) {
    try {
      if (useConfigCompile) {
        const conf = config.configCompiler || {};
        const compileConf = {
          ...defaultC,
          ...conf,
          tsconfig: conf.tsconfig || config.tsconfig,
        };
        await doActionAwait(runConfigCompile, projectRoot, compileConf, options);
      }
    } catch (error) {
      if(throws) {
        throw error;
      } else {
        console.log(chalk.red(error));
        return;
      }
    }
  }

  async function runMiddlewares(options: IIntergradeOptions<CancellationToken> = {}, throws = false) {
    try {
      if (useMiddlewareCompile) {
        const conf = config.middlewareCompiler || {};
        const compileConf = {
          ...defaultM,
          ...conf,
          tsconfig: conf.tsconfig || config.tsconfig,
        };
        await doActionAwait(runMiddlewareCompile, projectRoot, compileConf, options);
      }
    } catch (error) {
      if(throws) {
        throw error;
      } else {
        console.log(chalk.red(error));
        return;
      }
    }
  }

  async function runRouters(options: IIntergradeOptions<CancellationToken> = {}, throws = false) {
    try {
      if (useRouterBuilds) {
        const conf = config.routers || {};
        const compileConf = {
          ...defaultR,
          ...conf,
          tsconfig: conf.tsconfig || config.tsconfig,
          env: config.env,
        };
        await doActionAwait(runRoutersBuilder, projectRoot, compileConf, options);
      }
    } catch (error) {
      if(throws) {
        throw error;
      } else {
        console.log(chalk.red(error));
        return;
      }
    }
  }

  await runConfigs({}, true);
  await runMiddlewares({}, true);
  await runRouters({}, true);

  if (onlyCompile) {
    console.log("");
    console.log(chalk.magenta("😄 - COMPILE WORK ALL DONE"));
    console.log("");
    return;
  }

  const tsnodeHost = tsNode.split(" ")[1];
  const tspathHost = tscPathMap.split(" ")[1];

  const forkConfig: IForkCmdOptions = {
    command: path.join(projectRoot, "app/app.ts"),
    args: [...(!!config.inspect ? ["--inspect"] : []), "-r", tsnodeHost, "-r", tspathHost],
    env: config.env,
    tsconfig: config.tsconfig,
    check: config.transpile && config.typeCheck,
    cwd: projectRoot,
    token: refreshToken(),
    checkProcess: undefined,
    mainProcess: undefined,
    changes: [],
  };

  const { watch = [], ignore: ignored = [] } = config;
  // 1.5s变更内重复视为无效
  const onFilesChanged = throttle(invokeWhenFilesCHanged, 1500, {
    trailing: false,
  });
  chokidar.watch(watch, { ignored }).on("change", onFilesChanged);

  const ROOT_REGEXP = new RegExp(projectRoot, "g");

  console.log("");
  console.log(chalk.yellow(STATR_BASH));
  console.log("");
  const script = config.exec.replace(ROOT_REGEXP, ".");
  console.log(`script ==> ${chalk.grey(script)}`);
  console.log("");
  console.log(chalk.green(ENVS));
  console.log("");
  console.log(chalk.cyan(`NODE_ENV: \t${config.env.NODE_ENV}`));
  console.log(chalk.cyan(`NODE_PORT: \t${config.env.NODE_PORT}`));
  if (config.env.DEBUG) {
    console.log(chalk.yellow(`DEBUG: \t${config.env.DEBUG}`));
  }
  if (config.env.HTTP_PROXY) {
    console.log(chalk.cyan(`HTTP_PROXY: \t${config.env.HTTP_PROXY}`));
  }
  if (config.env.HTTPS_PROXY) {
    console.log(chalk.cyan(`HTTPS_PROXY: \t${config.env.HTTPS_PROXY}`));
  }
  const LENGTH = config.watch && config.watch.length;
  if (LENGTH > 0) {
    console.log("");
    console.log(chalk.green(WATCHING));
    console.log("");
    for (let i = 0; i < LENGTH; i++) {
      console.log(`${i + 1} - ${chalk.yellow(config.watch[i].replace(ROOT_REGEXP, "."))}`);
    }
  } else {
    console.log("");
    console.log(chalk.green(`${WATCHING} : ${chalk.yellow("nothing here...")}`));
  }
  const LENGTH_2 = config.ignore && config.ignore.length;
  if (LENGTH_2 > 0) {
    console.log("");
    console.log(chalk.green(IGNORED));
    console.log("");
    for (let i = 0; i < LENGTH_2; i++) {
      console.log(`${i + 1} - ${chalk.cyanBright(config.ignore[i].replace(ROOT_REGEXP, "."))}`);
    }
  } else {
    console.log("");
    console.log(chalk.green(`${IGNORED} : ${chalk.cyanBright("nothing here...")}`));
  }
  startMainProcess(forkConfig);

  async function invokeWhenFilesCHanged(paths: string | string[]) {
    forkConfig.token = refreshToken(forkConfig.token);
    forkConfig.changes = [];
    if (typeof paths === "string") {
      forkConfig.changes.push(paths);
    } else {
      forkConfig.changes.push(...paths);
    }
    console.log("");
    console.log(chalk.yellow(FILES_CHANGED));
    console.log("");
    forkConfig.changes.forEach((each) => {
      console.log(chalk.magenta(path.relative(projectRoot, each)));
    });
    console.log("");

    const { mainProcess, checkProcess } = forkConfig;
    if (mainProcess) {
      try {
        if (checkProcess) {
          checkProcess.kill();
        }
        process.kill(forkConfig.mainProcess!.pid);
      } catch (error) {
        console.log(chalk.red(error));
      } finally {
        // 暂不支持controller热编译, 意义不大
        await reCompile();
        startMainProcess(forkConfig);
      }
    }
  }

  async function reCompile() {
    if (useConfigHMR) {
      const changedConfigs = forkConfig.changes.filter((i) => i.startsWith(configWatchRoot));
      if (changedConfigs.length > 0) {
        console.log("");
        console.log(chalk.yellow(CONF_RELOAD));
        console.log("");
        changedConfigs.forEach((eh, index) => {
          console.log(`${index + 1} - ${path.relative(projectRoot, eh)}`);
        });
        await runConfigs({
          // 暂时不做取消逻辑
          // type: "fork",
          changes: changedConfigs,
          // token: forkConfig.token,
          // defineCancel(child: ChildProcess, token: CancellationToken) {
          //   child.on("message", data => console.log(data));
          //   child.send(forkConfig.token);
          // }
        });
      }
    }
    if (useMiddlewareHMR) {
      const changedMiddles = forkConfig.changes.filter((i) => i.startsWith(middleWatchRoot));
      if (changedMiddles.length > 0) {
        console.log("");
        console.log(chalk.yellow(MIDDLES_RELOAD));
        console.log("");
        changedMiddles.forEach((eh, index) => {
          console.log(`${index + 1} - ${path.relative(projectRoot, eh)}`);
        });
        await runMiddlewares({ changes: changedMiddles });
      }
    }
  }
}

async function startMainProcess(config: IForkCmdOptions) {
  try {
    if (config.check) {
      config.checkProcess = startTypeCheck(config.cwd, config, config.token);
    }
  } catch (error) {
    console.warn(error);
  }
  console.log(chalk.green(BOOTSTRAP));
  console.log("");
  try {
    await kill(get(config, "env.NODE_PORT", 8201));
  } catch (error) {
    console.log(chalk.red(error));
  } finally {
    config.mainProcess = spawn("node", [...config.args, config.command], {
      env: {
        ...process.env,
        ...config.env,
      },
      stdio: ["pipe", process.stdout, process.stderr],
    });
  }
  return config.mainProcess;
}

function doActionAwait<T>(
  method: (p: string, c: T, pl?: IIntergradeOptions<CancellationToken>, f?: (s: boolean, e?: Error) => void) => void,
  projectRoot: string,
  config: T,
  payload: IIntergradeOptions<CancellationToken>
): Promise<void> {
  return new Promise((resolve, reject) => {
    method(projectRoot, config, payload || {}, (success, error) => {
      if (success) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function startTypeCheck(projectRoot: string, config: IForkCmdOptions, token: CancellationToken) {
  console.log("");
  console.log(chalk.blue(TYPE_CHECK));
  console.log("");
  const script = path.resolve(__dirname, "../process/check");
  console.log(chalk.gray(`script ==> ${script}`));
  console.log("");
  const child = childProcess.fork(script, [], {
    env: {
      TSCONFIG: path.resolve(projectRoot, config.tsconfig || "tsconfig.json"),
    },
  });
  child.on("message", (message: { diagnostics?: NormalizedMessage[] }) => {
    const { diagnostics } = message;
    if (diagnostics) {
      if (diagnostics.length === 0) {
        console.log("");
        console.log(chalk.blue(TYPE_GOOD));
        console.log("");
        child.kill();
        return;
      }
      console.log(chalk.blue(`Type Syntax Errors : ${diagnostics.length}\n`));
      diagnostics.forEach((item) => {
        const { type: _, code, severity, content, file, line, character } = item;
        console.log(
          chalk[severity === "error" ? "red" : "yellow"](
            `${String(severity).toUpperCase()} in ${file}[${line},${character}] \nts${code || 0} : ${content}\n`
          )
        );
      });
      child.kill();
    } else {
      console.log(message);
    }
  });
  child.on("exit", () => console.log(TYPE_OVER));
  child.send(token);
  return child;
}

function refreshToken(token?: CancellationToken) {
  if (token && !token.isCancellationRequested()) token.cleanupCancellation();
  return (token = new CancellationToken(ts));
}
