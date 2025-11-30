import { globalMainPathParser } from "@/global/global-main-path-parser";
import { mainWindow } from "@/main/windows";
import { setupTitlebar } from "custom-electron-titlebar/main";
import { Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'process';
import '../orm/data-source';
import "./hotkey";
import "./ipc";
import "./windows/app/auth";

async function bootstrap() {
  globalMainPathParser.serAppWorkRoot(path.resolve(fileURLToPath(import.meta!.url), '../../'))
  // 初始化环境相关
  mainWindow.initApplication()
  // 初始化主窗口
  mainWindow.initAppWindow()

  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  setupTitlebar()
}

bootstrap().then()



