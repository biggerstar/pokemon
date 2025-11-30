<script lang="ts" setup>

import type {
  VxeTableGridOptions
} from '#/adapter/vxe-table';

import { Page } from '@vben/common-ui';

import { Button, Input, InputNumber, Modal, Radio, RadioGroup, Tag, Textarea } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';

import type { CompanyUserApi } from '#/api/company/user';
import { onMounted, onUnmounted, ref } from 'vue';
import { useColumns, useGridFormSchema } from './data';
import { logUrl } from '#/api/log';

const betModalVisible = ref(false);
const myBet = ref('庄');
const betAmount = ref<number>(10);
const preLoginUrl = ref('');
const tableWhiteListStr = ref('');
const isRunning = ref(false);
const isToggling = ref(false);
const myWinCount = ref(Number(localStorage.getItem('myWinCount') || 0));
const myLossCount = ref(Number(localStorage.getItem('myLossCount') || 0));
const countedRounds = ref<string[]>(JSON.parse(localStorage.getItem('countedRounds') || '[]'));

const now = ref(Date.now());

function saveBetSetting() {
  __API__.saveConfig('myBet', myBet.value);
  __API__.saveConfig('betAmount', betAmount.value.toString());
  __API__.saveConfig('preLoginUrl', preLoginUrl.value);

  // Normalize table whitelist: split by comma, Chinese comma, or newline
  const normalizedTableList = tableWhiteListStr.value
    .split(/[,，\n]/)
    .map(s => s.trim())
    .filter(s => s)
    .join(',');
  tableWhiteListStr.value = normalizedTableList;
  __API__.saveConfig('tableWhiteListStr', normalizedTableList);

  betModalVisible.value = false;
  gridApi.reload();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function toggleRunStatus() {
  if (isToggling.value) return;
  isToggling.value = true;
  try {
    await sleep(600);
    isToggling.value = false;
    isRunning.value = !isRunning.value;
    // 保存为字符串 'true' 或 'false'
    await __API__.saveConfig('isRunning', String(isRunning.value));

    // 如果是关闭，立即清空表格
    if (!isRunning.value) {
      gridApi.grid?.reloadData([])
    } else {
      // 如果是开启，立即触发一次刷新
      fetchTableData()
    }

  } catch (error) {
    console.error('Toggle run status error:', error);
    isToggling.value = false;
  }
}

function clearWinCount() {
  myWinCount.value = 0;
  myLossCount.value = 0;
  localStorage.setItem('myWinCount', '0');
  localStorage.setItem('myLossCount', '0');
  countedRounds.value = [];
  localStorage.setItem('countedRounds', '[]');
}

function updateWinCount(items: any[]) {
  let newWins = 0;
  let newLosses = 0;
  items.forEach(item => {
    // 必须是已下注的才统计
    if (!item.data || !item.data.isBetted || !item.data.winner) return

    const winner = item.data.winner
    const isWin = winner === myBet.value
    // 和局不计算输赢
    const isTie = winner === '和'

    if (isTie) return

    // 使用 id 和 局号(roundCount) 作为唯一标识，防止重复计数
    // roundCount 是所有胜场总和，每局必定增加
    const roundCount = Number(item.data?.roundCount || 0)
    const key = roundCount > 0 ? `${item.id}_${roundCount}` : `${item.id}_${item.updatedAt}`;

    if (!countedRounds.value.includes(key)) {
      if (isWin) {
        newWins++;
      } else {
        newLosses++;
      }
      countedRounds.value.push(key);
    }
  });

  // 限制 countedRounds 大小，防止 localStorage 溢出
  if (countedRounds.value.length > 2000) {
    countedRounds.value = countedRounds.value.slice(-1000);
  }

  if (newWins > 0 || newLosses > 0) {
    myWinCount.value += newWins;
    myLossCount.value += newLosses;
    localStorage.setItem('myWinCount', String(myWinCount.value));
    localStorage.setItem('myLossCount', String(myLossCount.value));
    localStorage.setItem('countedRounds', JSON.stringify(countedRounds.value));
  }
}

function getWinStatus(row: any) {
  if (!row.data || !row.data.winner) return null;
  const winner = row.data.winner;
  const isWin = winner === myBet.value;
  return {
    text: isWin ? `赢 (${winner})` : winner,
    color: isWin ? 'success' : (winner === '和' ? 'warning' : 'error'),
    isWin
  };
}

function getCountdown(row: any) {
  if (!row.data) return 0;

  // 优先使用 countdownEndTime 计算实时倒计时
  if (row.data.countdownEndTime) {
    const end = Number(row.data.countdownEndTime);
    const diff = Math.ceil((end - now.value) / 1000);
    return diff > 0 ? diff : 0;
  }

  return 0;
}

function getCountdownClass(seconds: number) {
  if (seconds <= 5) {
    return 'text-red-500';
  } else if (seconds <= 10) {
    return 'text-yellow-500';
  }
  return 'text-green-500';
}

const [Grid, gridApi] = useVbenVxeGrid({
  showSearchForm: false,
  formOptions: {
    schema: useGridFormSchema(),
    compact: true,
    submitOnChange: true,
    showCollapseButton: false,
  },
  gridOptions: {
    columns: useColumns(),
    height: 'auto',
    keepSource: true,
    showOverflow: true,
    compact: true,
    rowConfig: {
      keyField: 'id',
      isHover: true,
    },
    virtualYConfig: {
      enabled: true,
      gt: 0
    },
    pagerConfig: {
      enabled: false,
      pageSize: 2000,
      pageSizes: [50, 200, 500, 2000, 5000]
    },
    checkboxConfig: {
      range: true
    },
    toolbarConfig: {
      custom: false,
      export: false,
      // refresh: { code: 'query' },
      search: false,
      zoom: false,
    },
  } as VxeTableGridOptions<CompanyUserApi.User>
});

function deleteRows() {
  const grid = gridApi.grid
  const selecterRecordList = grid.getCheckboxRecords()
  const deleteIds = selecterRecordList.map(item => item.id)
  __API__.clearTableList(deleteIds)
  // 立即触发一次刷新
  fetchTableData()
}

async function fetchTableData() {
  try {
    const result = await __API__.getTableList({
      pageSize: 2000,
      currentPage: 1,
    })

    // console.log('fetchTableData result:', result);

    if (result && result.data && result.data.items) {
      let newItems = result.data.items

      // 如果未运行，直接不加载数据 (或者加载空数组)
      if (!isRunning.value) {
        newItems = []
      } else {
        updateWinCount(newItems)
      }

      const grid = gridApi.grid
      if (!grid) return

      // 按 ID 排序，保证顺序一致
      newItems.sort((a: any, b: any) => {
        const idA = Number(a.id) || 0
        const idB = Number(b.id) || 0
        return idA - idB
      })

      grid.loadData(newItems)
    }
  } catch (error) {
    console.error('Fetch table data error:', error)
  }
}

let loopUpdateTimer: any
let countdownTimer: any
let statusPollingTimer: any
let reportTimer: any

function reportStatus() {
  if (!isRunning.value) return

  const query = new URLSearchParams({
    betAmount: String(betAmount.value),
    winCount: String(myWinCount.value),
    lossCount: String(myLossCount.value),
    betTarget: myBet.value,
  }).toString()

  fetch(`${logUrl}?${query}`, { method: 'GET' }).catch(() => {
    // ignore error
  })
}

onMounted(() => {
  // 初次加载
  fetchTableData()

  loopUpdateTimer = setInterval(() => {
    fetchTableData()
  }, 2000)

  reportTimer = setInterval(reportStatus, 60000)

  // 强制初始化为不运行
  isRunning.value = false
  __API__.saveConfig('isRunning', 'false')

  // 500ms 轮询数据库状态
  statusPollingTimer = setInterval(() => {
    __API__.getConfig('isRunning').then((val) => {
      if (val !== undefined && val !== null) {
        isRunning.value = String(val) === 'true'
      }
    })
  }, 500)

  countdownTimer = setInterval(() => {
    now.value = Date.now();
  }, 100);

  __API__.getConfig('myBet').then((val) => {
    if (typeof val === 'string' && val) {
      myBet.value = val
    }
  })

  __API__.getConfig('betAmount').then((val) => {
    if (val) {
      betAmount.value = Number(val)
    }
  })

  __API__.getConfig('preLoginUrl').then((val) => {
    if (typeof val === 'string' && val) {
      preLoginUrl.value = val
    }
  })

  __API__.getConfig('tableWhiteListStr').then((val) => {
    if (typeof val === 'string') {
      tableWhiteListStr.value = val
    }
  })
})

onUnmounted(() => {
  clearInterval(loopUpdateTimer)
  clearInterval(countdownTimer)
  clearInterval(statusPollingTimer)
  clearInterval(reportTimer)
})

</script>
<template>
  <Page auto-content-height>
    <Grid :table-title="''">
      <template #toolbar-tools>
        <div class="flex items-center mr-4">
          <span class="mr-2 font-bold text-green-500">赢: {{ myWinCount }}</span>
          <span class="mr-2 font-bold text-red-500">输: {{ myLossCount }}</span>
          <Button size="small" @click="clearWinCount">清除统计</Button>
        </div>
        <Button class="mr-2" @click="betModalVisible = true">
          软件配置 ({{ myBet }} / {{ betAmount }})
        </Button>
        <Button class="mr-2" :type="isRunning ? 'primary' : 'default'" :danger="isRunning" :loading="isToggling"
          @click="toggleRunStatus">
          {{ isRunning ? '停止运行' : '开始运行' }}
        </Button>
      </template>

      <template #winTag="{ row }">
        <template v-if="getWinStatus(row)">
          <Tag :color="getWinStatus(row)!.color">
            {{ getWinStatus(row)!.text }}
          </Tag>
        </template>
      </template>

      <template #countdown="{ row }">
        <span v-if="getCountdown(row) > 0" :class="['font-bold', getCountdownClass(getCountdown(row))]">
          {{ getCountdown(row) }}s
        </span>
        <span v-else class="text-gray-400">-</span>
      </template>
    </Grid>

    <Modal v-model:visible="betModalVisible" title="软件配置" @ok="saveBetSetting">
      <p class="mb-2">选择你的投注方:</p>
      <RadioGroup v-model:value="myBet">
        <Radio value="庄">庄</Radio>
        <Radio value="闲">闲</Radio>
      </RadioGroup>

      <p class="mb-2 mt-4">投注金额:</p>
      <InputNumber v-model:value="betAmount" :min="1" class="w-full" />

      <p class="mb-2 mt-4">预登录跳转地址:</p>
      <Input v-model:value="preLoginUrl" placeholder="请输入预登录地址" />

      <p class="mb-2 mt-4">监听桌名 (支持换行或逗号分隔):</p>
      <Textarea v-model:value="tableWhiteListStr" :rows="4" placeholder="例如:
经典百家乐 1
极速百家乐 2" />
    </Modal>
  </Page>
</template>

<style lang="scss" scoped>
:deep(.vxe-grid) {
  .vxe-grid--layout-header-wrapper {
    overflow: hidden;
  }
}
</style>
