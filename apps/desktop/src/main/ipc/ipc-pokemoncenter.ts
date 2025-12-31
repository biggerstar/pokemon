/**
 * Pokemon Center IPC 处理器
 * 此文件已重构，所有功能已拆分到 pokemoncenter 文件夹中的各个模块
 * 此文件保留作为向后兼容的入口点
 */
import { registerPokemonCenterHandlers } from './pokemoncenter';

// 注册所有 Pokemon Center 相关的 IPC 处理器
registerPokemonCenterHandlers();
