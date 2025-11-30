import { ipcRenderer } from 'electron';
import { hookSocket, SocketHandle } from './hook-socket';
import { sleep } from '@/utils/time';
import PQueue from 'p-queue';

const taskQueue = new PQueue({ concurrency: 1 });
const blackList = new Set<number>();
type BetState = 'NONE' | 'BETTING' | 'BETTED';
const tableBetStateMap = new Map<number, BetState>();
const tableBettedRoundMap = new Map<number, number>();
const seenBetMap = new Set<number>();
let tableWhiteList: number[] = [];

// 全局配置对象
let appConfig = {
  myBet: '庄',
  betAmount: 1,
  isRunning: false,
};

const BET_POINT_ID_MAP = {
  庄: 3001,
  闲: 3002,
  和: 3003,
};

function inDbPersonUrl(): boolean {
  return location.href.includes('pc.next.');
}

export function inDbPersonPage(): boolean {
  return !!(window['SDKManager'] && window['DataHandle']);
}

// 轮询更新配置
function startConfigPolling() {
  const updateConfig = async () => {
    try {
      // 批量获取配置，减少 IPC 调用次数
      const configs = await ipcRenderer.invoke('get-configs', [
        'myBet',
        'betAmount',
        'isRunning',
        'tableWhiteListStr',
      ]);
      // console.log(configs)

      appConfig = {
        myBet: configs['myBet'] || '庄',
        betAmount: Number(configs['betAmount']) || 1,
        isRunning:
          configs['isRunning'] === '1' ||
          configs['isRunning'] === 'true' ||
          configs['isRunning'] === true,
      };

      const listStr = configs['tableWhiteListStr'] || '';
      tableWhiteList = listStr
        .split(/[,，\n]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s);

      // 挂载到全局，方便调试和查看
      window['appConfig'] = appConfig;
    } catch (error) {
      console.error('Update appConfig error:', error);
    }
  };

  // 立即执行一次
  updateConfig();

  // 500ms 轮询
  setInterval(updateConfig, 500);
}

export async function useDBPersonPage() {
  if (!inDbPersonUrl()) {
    return;
  }
  console.info('DB 真人页面加载成功!');
  // checkInCurrentPage();
  // 启动配置轮询
  startConfigPolling();

  const socketHandle = new SocketHandle();
  hookSocket(socketHandle);
  preocessHandle(socketHandle);
  processBetPoint();
  window['socketHandle'] = socketHandle;
  await requireBetManager();
}

function checkInCurrentPage() {
  const timer = setInterval(() => {
    const inPage = !!document.querySelector('.table-num');
    if (!inPage) return;
    clearInterval(timer);
    alert('登录成功! 将自动关闭窗口.');
    ipcRenderer.invoke('hide-window');
  }, 500);
}

function preocessHandle(socketHandle: SocketHandle) {
  socketHandle.onmessage((data: any) => {
    if (!appConfig.isRunning) return;
    try {
      const jsonData = JSON.parse(data.jsonData);
      if (typeof jsonData.data === 'string') {
        jsonData.data = JSON.parse(jsonData.data) || {};
      }
      // if (jsonData.id === 10052) console.log('Received table list', Object.keys(jsonData.data?.gameTableMap || {}).length);
      processMessage(jsonData);
    } catch (error) {
      console.error('processMessage error', error);
    }
  });
}

const recordMap = new Map();

function getWiner(tableId: number, items: any[]): string {
  const recordInfoItems = recordMap.get(tableId);
  if (!recordInfoItems) return '';

  const getWinCount = (list: any[], id: number) => {
    return list.find((i: any) => i.betPointId === id)?.winCount || 0;
  };

  // 3001: 庄, 3002: 闲, 3003: 和
  const curZhuang = getWinCount(items, BET_POINT_ID_MAP['庄']);
  const prevZhuang = getWinCount(recordInfoItems, BET_POINT_ID_MAP['庄']);

  const curXian = getWinCount(items, BET_POINT_ID_MAP['闲']);
  const prevXian = getWinCount(recordInfoItems, BET_POINT_ID_MAP['闲']);

  const curHe = getWinCount(items, BET_POINT_ID_MAP['和']);
  const prevHe = getWinCount(recordInfoItems, BET_POINT_ID_MAP['和']);

  if (curZhuang > prevZhuang) return '庄';
  if (curXian > prevXian) return '闲';
  if (curHe > prevHe) return '和';

  return '';
}

const TABLE_STATUS = {
  0: { code: 'READY', text: '已准备' },
  1: { code: 'SHUFFLE', text: '洗牌中...' },
  2: { code: 'BET', text: '下注中...' },
  3: { code: 'OPEN', text: '开牌中...' },
  4: { code: 'COUNT', text: '结算中...' },
  6: { code: 'MANTAIN', text: '维护中...' },
  7: { code: 'PAUSED', text: '暂停中...' },
};

// 104 下注   countdownEndTime 下注截止时间
// 107 开牌结果
// 161 结算
function processMessage(result: Record<string, any>) {
  const { id, data } = result;
  // console.log(result)
  if (id === 10052) {
    // 收到当前所有牌桌
    const gameTableMap = {};
    // console.log('gameTableMap', data?.gameTableMap[2622])
    Object.keys(data?.gameTableMap || {}).forEach(async (key: any, index) => {
      key = Number(key);
      // if (index >= 1) return
      const element = data?.gameTableMap[key];
      if (
        !element.tableName.includes('经典百家乐') &&
        !element.tableName.includes('极速百家乐')
      )
        return;
      if (
        tableWhiteList.length > 0 &&
        !tableWhiteList.includes(element.tableName)
      ) {
        // console.log('Skip table not in whitelist:', element.tableName);
        return;
      }

      if (blackList.has(key)) {
        delete gameTableMap[key];
        return;
      }

      // Capture previous state before updating global map
      const prevElement = gameTableMap[key];
      gameTableMap[key] = element;

      // 这里的roundCount是当前牌桌已完成的轮数，用于唯一标识当前游戏状态
      const roundCount =
        element.bootReport?.items?.reduce(
          (sum: number, item: any) => sum + (item.winCount || 0),
          0,
        ) || 0;
      element.roundCount = roundCount;

      if (element.gameStatus === 2) {
        // 标记该牌桌已进入过下注阶段
        seenBetMap.add(key);

        // 检测新的一轮下注开始 (状态变为2，且之前不是2，或者之前是2但没有下注记录且不处于下注过程中)
        // 这里主要处理 4->2 或 0/1->2 的转换
        if (prevElement && prevElement.gameStatus !== 2) {
          tableBetStateMap.set(key, 'NONE');
        }

        // Check if we already betted on this specific round ID
        const lastBettedRound = tableBettedRoundMap.get(key);
        if (lastBettedRound === roundCount) {
          // Ensure UI reflects BETTED state if we recovered from reload
          if (tableBetStateMap.get(key) !== 'BETTED') {
            tableBetStateMap.set(key, 'BETTED');
          }
        }

        if ((tableBetStateMap.get(key) || 'NONE') === 'NONE') {
          tableBetStateMap.set(key, 'BETTING');
          console.log(
            'Start betting on table:',
            key,
            element.tableName,
            'Round:',
            roundCount,
          );

          // 异步执行下注，不阻塞当前循环，以便立即发送"下注中..."状态
          pushChip(Number(key), appConfig.myBet, appConfig.betAmount)
            .then((isSuccess) => {
              if (isSuccess) {
                tableBetStateMap.set(key, 'BETTED');
                tableBettedRoundMap.set(key, roundCount);
                // 下注成功后，手动更新状态并通知主进程
                const currentTable = gameTableMap[key];
                if (currentTable && currentTable.gameStatus === 2) {
                  currentTable.isBetted = true;
                  const statusText =
                    TABLE_STATUS[currentTable.gameStatus]?.text || '';
                  currentTable.statusText = `${statusText} (已下注)`;

                  ipcRenderer.invoke('update-table-status', {
                    id: key,
                    status: currentTable.statusText,
                    data: currentTable,
                  });
                }
              } else {
                tableBetStateMap.set(key, 'NONE');
              }
            })
            .catch(() => {
              tableBetStateMap.set(key, 'NONE');
            });
        }
      } else if (element.gameStatus === 0 || element.gameStatus === 1) {
        // 新一轮开始（准备或洗牌）时重置下注状态
        tableBetStateMap.set(key, 'NONE');
      }

      // 重新获取 isBetted
      const isBetted = tableBetStateMap.get(key) === 'BETTED';
      const statusText = TABLE_STATUS[element.gameStatus].text || '';
      element.statusText = isBetted ? `${statusText} (已下注)` : statusText;

      // 只有经历过下注阶段的牌桌才显示结果
      if (seenBetMap.has(key)) {
        const detectedWinner = getWiner(key, element.bootReport.items);

        // 这里的逻辑是为了保证 winner 在结算阶段持久化，防止 polling 漏掉
        if (detectedWinner) {
          element.winner = detectedWinner;
        } else if (
          (element.gameStatus === 4 || element.gameStatus === 3) &&
          prevElement?.winner
        ) {
          // 如果还在开牌或结算中，且没有检测到新变化（因为变化只发生一瞬间），保持上一次的 winner
          element.winner = prevElement.winner;
        } else {
          element.winner = '';
        }
      } else {
        element.winner = '';
      }

      element.isBetted = isBetted;
      recordMap.set(key, element.bootReport.items);
    });
    ipcRenderer.invoke('update-table-list', gameTableMap);
  }
}

async function pushChip(tableId: number, betType: string, amount: number) {
  return false;
  if (!window['BetManager']) return false;
  const applyList = [
    tableId,
    BET_POINT_ID_MAP[betType],
    amount,
    true,
    0,
    0,
    false,
    false,
    false,
    false,
    false,
    undefined,
    undefined,
    undefined,
    false,
  ];

  try {
    await sleep(5000);
    await window['BetManager'].pushChip(...applyList);
    return true;
  } catch (error) {
    if (error?.message?.includes('玩法不可用')) {
      blackList.add(tableId);
    }
    console.error('pushChip error', error);
    return false;
  }
}

function requireBetManager() {
  const scriptEl = document.createElement('script');
  scriptEl.type = 'module';
  scriptEl.textContent = `
    import * as module from './egret/js/assets-GH5N_v0.0.0.0.2025112610593434.release.js'
    window.BetManager = module.A.BetManager
  `;
  document.head.appendChild(scriptEl);
  return new Promise((resolve, reject) => {
    scriptEl.onload = () => resolve(window['BetManager']);
    scriptEl.onerror = reject;
  });
}

async function processBetPoint() {
  async function processTableItem(el: Element) {
    const id = el.id.split('-').pop();
    const listTimeEL = el.querySelector<HTMLElement>('.listTime');
    if (!id || !listTimeEL) return;
    const remandTime = +(listTimeEL as HTMLElement).innerText;
    const tableName =
      el.querySelector<HTMLElement>('.table-name')?.innerText || '';
    const xianEl = el.querySelector<HTMLElement>('.bet-panel-chip-item-3002');
    const zhuangEl = el.querySelector<HTMLElement>('.bet-panel-chip-item-3001');
    const isBeted = !!el.querySelector<HTMLElement>('.bet-chip-group');
    if (isBeted) {
      return;
    }
    // if (tableName !== '经典百家乐H08') return
    // console.log(tableName, remandTime)
    if (Number(remandTime) <= 1) return;
    // console.log('可投注: ', tableName, '剩余时间: ', remandTime);

    if (appConfig.myBet === '庄' && zhuangEl) {
      zhuangEl.click();
    } else if (appConfig.myBet === '闲' && xianEl) {
      xianEl.click();
    }
    await sleep(400);
  }

  function colloctTableElement(el: HTMLElement) {
    Array.from(el.querySelectorAll('.table-item')).forEach((el) => {
      if (taskQueue.size >= 100) return;
      taskQueue.add(async () => await processTableItem(el));
    });
  }

  async function goToPositionAndLoadElements(top) {
    if (location.pathname !== '/egret/multi') return;
    const scrollEl = document.querySelector('.vue-recycle-scroller.ready');
    if (!scrollEl) return;
    scrollEl.scrollTo({ top, behavior: 'smooth' });
    await sleep(1200);
    colloctTableElement(scrollEl as HTMLElement);
  }

  async function intevalScroll() {
    if (!appConfig.isRunning) return;
    await goToPositionAndLoadElements(1000);
    await goToPositionAndLoadElements(2000);
    await goToPositionAndLoadElements(3000);
    await goToPositionAndLoadElements(4000);
    await goToPositionAndLoadElements(0);
  }

  intevalScroll();
  setInterval(intevalScroll, 6000);
}
