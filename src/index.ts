import commander from "commander";
import { CompilePlugin } from "./actions/compile";
import { ConfigPlugin } from "./actions/config";
import { DevPlugin } from "./actions/dev";
import { MiddlewarePlugin } from "./actions/middleware";
import { RouterPlugin } from "./actions/routers";
import { ICommandPlugin } from "./base";

let pkg;
try {
  // tslint:disable-next-line: no-var-requires
  pkg = require("./package.json");
} catch (e) {
  /** ignore */
  pkg = {};
}

function initCommand(plugin: ICommandPlugin) {
  const program = commander.name(plugin.name).description(plugin.description);
  if (plugin.options) {
    for (const plu of plugin.options) {
      program.option(plu[0], plu[1]);
    }
  }
  program.action(plugin.action).on("--help", plugin.help);
}

[DevPlugin, CompilePlugin, RouterPlugin, ConfigPlugin, MiddlewarePlugin].forEach(i => initCommand(i));

commander.version(pkg.version || "1.0.0-rc.1").parse(process.argv);

if (commander.args.length === 0) {
  commander.outputHelp();
}
