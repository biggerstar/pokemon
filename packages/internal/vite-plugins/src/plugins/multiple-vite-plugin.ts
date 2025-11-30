import PQueue from 'p-queue';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { build, createServer, preview } from 'vite';

type MultipleVitePluginConfig = MultipleViteConfig[] | MultipleViteConfig;
type RunAtCycle = 'config' | 'writeBundle' | 'buildStart';
type Command = 'build' | 'serve' | 'preview';
type MultipleViteConfig = {
  /**
   * 运行的 command 时机, 默认为 serve
   * */
  apply: Command;
  /**
   * 运行在哪个主 vite 插件中的 周期中， 默认为 writeBundle
   * */
  runAtCycle?: RunAtCycle,
  /**
   * 是否使用队列执行，默认 true, 如果使用队列，在其不同周期中的将会按插件中的定义顺序执行， 但是受插件生命周期影响
   * */
  useQueue?: boolean,
  /**
   * vite 配置,每个 vite配置都会新开一个 vite 任务
   * */
  vite: UserConfig;
};

const queue = new PQueue({ concurrency: 1 });

function getCyclePluginList(allViteConfigList: MultipleViteConfig[], runAtCycle: RunAtCycle): MultipleViteConfig[] {
  return allViteConfigList.filter(v => v.runAtCycle === runAtCycle);
}

async function runCycleVite(command: Command, allViteConfigList: MultipleViteConfig[]) {
  for (const k in allViteConfigList) {
    const config = allViteConfigList[k] as MultipleViteConfig;
    const useQueue = 'useQueue' in config ? config.useQueue : true;

    async function viteRunTask() {
      const { apply, vite } = config;
      if (apply === command && command === 'build') build(vite).then();
      else if (apply === command && command === 'preview') {
        preview(vite).then();
      } else {
        createServer(vite).then(server => {
          server.printUrls();
        });
      }
    }

    if (useQueue) await queue.add(viteRunTask);
    else await viteRunTask();
  }
}

export function multipleViteLoader(viteConfigList: MultipleVitePluginConfig): Plugin {
  if (!Array.isArray(viteConfigList)) {
    viteConfigList = [viteConfigList];
  }
  let command: Command = 'serve';
  return {
    name: 'multiple-vite-plugin-loader',
    config(_, env: ConfigEnv) {
      command = env.command;
      const cyclePlugins = getCyclePluginList(viteConfigList, 'config');
      runCycleVite(command, cyclePlugins).then();

    },
    buildStart() {
      const cyclePlugins = getCyclePluginList(viteConfigList, 'buildStart');
      runCycleVite(command, cyclePlugins).then();
    },
    writeBundle() {
      const cyclePlugins = getCyclePluginList(viteConfigList, 'writeBundle');
      runCycleVite(command, cyclePlugins).then();
    },
  };
}
