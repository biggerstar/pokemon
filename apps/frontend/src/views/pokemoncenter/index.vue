<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { useColumns } from './data';
import { Modal, Input, InputNumber, Button, message, Popconfirm } from 'ant-design-vue';
import * as XLSX from 'xlsx';

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: useColumns(),
    height: 'auto',
    keepSource: true,
    showOverflow: true,
    scrollbarConfig: {
      width: 10,
      height: 10,
      x: {
        position: 'bottom',
      },
      y: {
        position: 'right',
      },
    },
    rowConfig: {
      keyField: 'mail',
      isHover: true,
    },
    pagerConfig: {
      enabled: true,
      pageSize: 1000,
      pageSizes: [1000, 2000, 5000, 10000]
    },
    toolbarConfig: {
      custom: true,
      export: false,
      refresh: { code: 'query' },
      zoom: false,
      slots: {
        buttons: 'toolbar_buttons'
      }
    },
    proxyConfig: {
      ajax: {
        query: async () => {
          try {
            const data = await __API__.getAccounts();
            // vxe-table expects { items: [], total: number } format
            return {
              items: data || [],
              total: data?.length || 0
            };
          } catch (e) {
            console.error('Error fetching accounts:', e);
            return {
              items: [],
              total: 0
            };
          }
        }
      }
    }
  },
  // formOptions: {
  //   schema: useGridFormSchema(),
  //   compact: true,
  // }
});

const importModalVisible = ref(false);
const importText = ref('');
const autoDetectedHeaders = ref<string[]>([]);
const maxConcurrency = ref(10);
const taskModalVisible = ref(false);
const proxyPoolModalVisible = ref(false);
const proxyPoolList = ref<Array<{ id: string; proxy: string; name?: string; enabled: boolean; created_time: Date; updated_time: Date; checkStatus?: 'checking' | 'success' | 'failed'; checkLatency?: number; checkError?: string }>>([]);
const newProxyText = ref('');
const newProxyName = ref('');
const isCheckingProxies = ref(false);
const captchaConfigModalVisible = ref(false);
const capmonsterToken = ref('');
const twoCaptchaToken = ref('');
const defaultCaptchaService = ref<'capmonster' | '2captcha'>('capmonster');
const developmentMode = ref(false);
// const showWindow = ref(false);
// const enableProxy = ref(true);
const showWindow = ref(true);
const enableProxy = ref(false);
const clearBrowserData = ref(true); // 是否清除浏览器数据
const maxRetryCount = ref(3); // 最大重试次数（默认3）
const addToCartTiming = ref<'beforeLogin' | 'afterLogin'>('afterLogin'); // 添加购物车时机（默认登录前）
const taskStatus = ref({ queueLength: 0, runningCount: 0, maxConcurrency: 0, isProcessing: false });
const totalTasks = ref(0);
const isTaskRunning = ref(false);
const isStarting = ref(false);
let statusTimer: any = null;
let selectionTimer: any = null;

// 响应式的选中记录数量
const selectedRecordsCount = ref(0);
const hasSelectedRecords = computed(() => {
  return selectedRecordsCount.value > 0;
});

// 更新选中记录数量
function updateSelectedRecordsCount() {
  try {
    const records = gridApi.grid?.getCheckboxRecords?.() || [];
    selectedRecordsCount.value = records.length;
  } catch (error) {
    selectedRecordsCount.value = 0;
  }
}

let tableTimer: any = null;

// 定义允许重试的关键词列表
const retryKeywords = [
  'reCaptcha',
  'recaptcha',
  'captcha',
  '验证码',
  'Request failed',
  'verification',
  'timeout',
  '超时',
  'network',
  '网络',
  'error',
  '错误'
];

// 跟踪每个账号的重试次数（使用 Map 存储，key 为 mail）
const retryCountMap = new Map<string, number>();

// 检查 statusText 是否包含允许重试的关键词
function shouldRetry(statusText: string | null | undefined): boolean {
  if (!statusText) return false;
  const text = String(statusText).toLowerCase();
  return retryKeywords.some(keyword => text.includes(keyword.toLowerCase()));
}

// 获取账号的重试次数
function getRetryCount(mail: string): number {
  return retryCountMap.get(mail) || 0;
}

// 增加账号的重试次数
function incrementRetryCount(mail: string): void {
  const current = getRetryCount(mail);
  retryCountMap.set(mail, current + 1);
}

// 重置账号的重试次数
function resetRetryCount(mail: string): void {
  retryCountMap.delete(mail);
}

function openImportModal() {
  importModalVisible.value = true;
  importText.value = '';
  autoDetectedHeaders.value = [];
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0] as string;
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON (array of arrays)
        const json = XLSX.utils.sheet_to_json(worksheet as XLSX.WorkSheet, { header: 1 }) as any[][];

        if (json.length > 0) {
          const [headerRow = [], ...bodyRows] = json;
          autoDetectedHeaders.value = headerRow.map((cell) => String(cell || '').trim().toUpperCase()).filter(Boolean);

          const dataRows = bodyRows.filter((row) =>
            Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''),
          );

          if (dataRows.length > 0) {
            const tsv = dataRows.map((row) => row.map((cell) => String(cell ?? '')).join('\t')).join('\n');
            importText.value = tsv;
            message.success('Excel 文件解析成功，已自动移除表头');
          } else {
            importText.value = '';
            message.warn('Excel 文件未包含有效数据行');
          }
        } else {
          importText.value = '';
          message.warn('Excel file is empty');
        }

      } catch (err: any) {
        console.error(err);
        message.error('Failed to parse Excel: ' + err.message);
        importText.value = '';
      } finally {
        // Clear the input so the same file can be selected again if needed
        target.value = '';
      }
    };
    reader.readAsArrayBuffer(file as Blob);
  }
}

const headerMap: Record<string, string> = {
  RETAILER: 'retailer',
  MODE: 'mode',
  PROXY: 'proxy',
  PROFILETITLE: 'profileTitle',
  LASTNAME: 'lastName',
  FIRSTNAME: 'firstName',
  LASTNAMEKANA: 'lastNameKana',
  FIRSTNAMEKANA: 'firstNameKana',
  COUNTRY: 'country',
  STATE: 'state',
  CITY: 'city',
  ADDRESS1: 'address1',
  ADDRESS2: 'address2',
  PHONENUMBER: 'phoneNumber',
  ZIPCODE: 'zipCode',
  CARDNUMBER: 'cardNumber',
  EXPIREDMONTH: 'expiredMonth',
  EXPIREDYEAR: 'expiredYear',
  SECURITYCODE: 'securityCode',
  LOGINID: 'loginId',
  LOGINPASS: 'loginPass',
  EXTRA1: 'extra1',
  CODEMAIL: 'codeMail',
  SMTP: 'smtp',
  PRODUCTID: 'productId',
  CARDNAME: 'cardName',
};

const orderedHeaderKeys = [
  'RETAILER', 'MODE', 'PROXY', 'PROFILETITLE', 'LASTNAME', 'FIRSTNAME',
  'LASTNAMEKANA', 'FIRSTNAMEKANA', 'COUNTRY', 'STATE', 'CITY', 'ADDRESS1',
  'ADDRESS2', 'PHONENUMBER', 'ZIPCODE', 'CARDNUMBER', 'EXPIREDMONTH',
  'EXPIREDYEAR', 'SECURITYCODE', 'LOGINID', 'LOGINPASS', 'EXTRA1', 'CODEMAIL', 'SMTP', 'PRODUCTID', 'CARDNAME'
];

async function saveImportedAccounts(headers: string[], rows: any[][]) {
  const accounts: any[] = [];

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    // If it's a string (from empty line in text), skip
    if (typeof row === 'string' && !row) continue;

    const rowData: Record<string, any> = {};
    headers.forEach((header, index) => {
      const key = headerMap[header];
      if (key) {
        rowData[key] = row[index] || '';
      }
    });

    if (rowData.loginId) {
      accounts.push({
        mail: rowData.loginId,
        data: rowData
      });
    }
  }

  if (accounts.length > 0) {
    try {
      await __API__.saveAccounts(accounts);
      message.success(`成功导入 ${accounts.length} 个账号`);
      importModalVisible.value = false;

      // Ensure grid reloads - use commitProxy to trigger data refresh
      if (gridApi && gridApi.grid) {
        await fetchTableData();
      }
    } catch (e: any) {
      console.error('Save failed:', e);
      message.error('保存失败: ' + (e.message || String(e)));
    }
  } else {
    message.warn('未找到有效账号。请检查 LOGINID 列是否存在且不为空。');
  }
}

async function handleImport() {
  if (!importText.value) return;

  try {
    const lines = importText.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !!line);
    if (lines.length < 1) {
      message.error('Invalid data: No data found');
      return;
    }

    // Detect separator (tab or comma)
    const firstLine = lines[0] || '';
    const separator = firstLine.includes('\t') ? '\t' : ',';

    // Determine headers: priority order -> auto detected -> first line -> fallback
    let headers: string[] = [];
    let dataRows = lines;

    if (autoDetectedHeaders.value.length > 0) {
      headers = autoDetectedHeaders.value;
    } else {
      const potentialHeaders = firstLine.split(separator).map(h => h.trim().toUpperCase());
      // Check if at least 3 keys match known headers to consider it a header line
      const matchCount = potentialHeaders.filter(h => headerMap[h]).length;

      if (matchCount >= 3) {
        headers = potentialHeaders;
        dataRows = lines.slice(1); // Skip header row
      } else {
        headers = orderedHeaderKeys;
        // Do not skip first row, treat as data
      }
    }

    const rows = dataRows.map(line => {
      const l = line?.trim();
      if (!l) return [];
      return l.split(separator).map(v => v.trim());
    });

    await saveImportedAccounts(headers, rows);
    autoDetectedHeaders.value = [];

  } catch (error: any) {
    console.error('Import error:', error);
    message.error('Import failed: ' + error.message);
  }
}

async function handleDelete() {
  const records = gridApi.grid?.getCheckboxRecords() || [];
  if (records.length === 0) {
    message.warn('Please select accounts to delete');
    return;
  }

  try {
    const mails = records.map((item: any) => item.mail);
    await __API__.deleteAccounts(mails);
    message.success(`Deleted ${mails.length} accounts`);
    fetchTableData();
  } catch (error: any) {
    console.error('Delete error:', error);
    message.error('Delete failed: ' + error.message);
  }
}

async function handleStartTasks() {
  const records = gridApi.grid?.getCheckboxRecords() || [];

  if (records.length === 0) {
    message.warn('请先选择要启动的账号');
    return;
  }

  // 筛选可以启动的账号
  let accountsToStart: string[] = [];
  const accountsToReset: string[] = [];
  let retryCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    const mail = record.mail;
    const status = record.status;
    const statusText = record.statusText;

    // 如果状态是 NONE，直接允许启动
    if (status === 'NONE') {
      accountsToStart.push(mail);
      // 重置重试计数（新任务）
      resetRetryCount(mail);
      continue;
    }

    // 如果状态不是 NONE，检查是否应该重试
    if (shouldRetry(statusText)) {
      const currentRetryCount = getRetryCount(mail);
      // 检查重试次数是否超过限制
      if (currentRetryCount < maxRetryCount.value) {
        accountsToStart.push(mail);
        accountsToReset.push(mail); // 需要重置状态为 NONE
        incrementRetryCount(mail);
        retryCount++;
      } else {
        skippedCount++;
        console.log(`账号 ${mail} 已达到最大重试次数 ${maxRetryCount.value}，跳过`);
      }
    } else {
      // statusText 不包含关键词，不重试
      skippedCount++;
    }
  }

  if (accountsToStart.length === 0) {
    if (skippedCount > 0) {
      message.warn(`选中的账号中没有可以启动的账号。${retryCount > 0 ? `已重试 ${retryCount} 个账号。` : ''}${skippedCount > 0 ? `跳过 ${skippedCount} 个账号（不满足重试条件或已达到重试上限）。` : ''}`);
    } else {
      message.warn('选中的账号中没有待处理的账号');
    }
    return;
  }

  // 如果有需要重置状态的账号，先重置它们
  // 注意：重置状态必须成功，否则这些账号的状态不是 NONE，主进程不会将它们添加到队列
  if (accountsToReset.length > 0) {
    try {
      await __API__.resetAccountsStatus(accountsToReset);
      console.log(`已重置 ${accountsToReset.length} 个账号的状态以便重试`);
    } catch (error: any) {
      console.error('重置账号状态失败:', error);
      message.error('重置账号状态失败，无法启动重试任务');
      // 重置失败时，从待启动列表中移除需要重试的账号
      accountsToStart = accountsToStart.filter(mail => !accountsToReset.includes(mail));
      retryCount = 0; // 重置重试计数

      if (accountsToStart.length === 0) {
        isStarting.value = false;
        return;
      }
      message.warn(`将只启动 ${accountsToStart.length} 个新任务（重试任务因重置失败已跳过）`);
    }
  }

  isStarting.value = true;
  try {
    // 将任务重新添加到主进程队列
    // 主进程会从数据库查询这些账号，筛选出 status === NONE 的账号（包括刚才重置的账号）
    // 然后通过 taskQueue.addTasks() 添加到队列中
    const result = await __API__.startTasks(accountsToStart, maxConcurrency.value, showWindow.value, enableProxy.value, clearBrowserData.value, maxRetryCount.value, addToCartTiming.value, defaultCaptchaService.value);
    if (result.success) {
      const messageText = retryCount > 0
        ? `${result.message}（其中 ${retryCount} 个账号为重试）`
        : result.message;
      message.success(messageText);
      taskModalVisible.value = false;
      fetchTableData();
      updateTaskStatus();
      setTimeout(() => {
        isStarting.value = false;
        isTaskRunning.value = true;
      }, 800);
    } else {
      message.warn(result.message);
      isStarting.value = false;
    }
  } catch (error: any) {
    console.error('Start tasks error:', error);
    message.error('启动任务失败: ' + error.message);
    isStarting.value = false;
  }
}

async function handleStopAllTasks() {
  try {
    const result = await __API__.stopTasks();
    if (result.success) {
      message.success(result.message);
      isTaskRunning.value = false;
      fetchTableData();
      updateTaskStatus();
    }
  } catch (error: any) {
    console.error('Stop all tasks error:', error);
    message.error('停止任务失败: ' + error.message);
  }
}

async function handleStopTasks() {
  const records = gridApi.grid?.getCheckboxRecords() || [];
  if (records.length === 0) {
    message.warn('请选择要停止的账号');
    return;
  }

  try {
    const mails = records.map((item: any) => item.mail);
    const result = await __API__.stopSelectedTasks(mails);
    message.success(result.message);
    fetchTableData();
    updateTaskStatus();
  } catch (error: any) {
    console.error('Stop tasks error:', error);
    message.error('停止任务失败: ' + error.message);
  }
}

async function fetchTableData() {
  try {
    const data = await __API__.getAccounts();
    const grid = gridApi.grid;
    if (!grid) return;

    const newItems = data || [];

    // 当任务成功完成时，重置重试计数
    newItems.forEach((item: any) => {
      if (item.status === 'DONE' || item.status === 'ORDER_SUCCESS') {
        resetRetryCount(item.mail);
      }
    });

    newItems.sort((a: any, b: any) => {
      const mailA = a.mail || '';
      const mailB = b.mail || '';
      return mailA.localeCompare(mailB);
    });

    grid.loadData(newItems);
    totalTasks.value = newItems.length;
  } catch (error: any) {
    console.error('Fetch table data error:', error);
  }
}

async function updateTaskStatus() {
  try {
    const status = await __API__.getTaskQueueStatus();
    taskStatus.value = status;
    isTaskRunning.value = status.isProcessing || status.runningCount > 0;
  } catch (error: any) {
    console.error('Update task status error:', error);
  }
}

onMounted(async () => {
  await updateTaskStatus();
  await fetchTableData();
  statusTimer = setInterval(updateTaskStatus, 3000);
  tableTimer = setInterval(fetchTableData, 3000);
  // 初始化选中记录数量
  updateSelectedRecordsCount();
  // 定期检查选中状态（作为备用方案，确保按钮状态及时更新）
  // 使用更短的间隔以提高响应速度（50ms）
  selectionTimer = setInterval(updateSelectedRecordsCount, 50);
  // 使用 nextTick 确保 grid 已初始化，然后尝试监听选中状态变化
  await nextTick();
  if (gridApi.grid) {
    try {
      // 尝试使用 VXE Table 的事件监听
      const gridInstance = gridApi.grid as any;
      if (gridInstance.$on) {
        gridInstance.$on('checkbox-change', updateSelectedRecordsCount);
        gridInstance.$on('checkbox-all', updateSelectedRecordsCount);
      } else if (gridInstance.on) {
        gridInstance.on('checkbox-change', updateSelectedRecordsCount);
        gridInstance.on('checkbox-all', updateSelectedRecordsCount);
      }
    } catch (error) {
      console.warn('无法监听表格选中事件，将使用定时器更新:', error);
    }
  }
});

onUnmounted(() => {
  if (statusTimer) {
    clearInterval(statusTimer);
  }
  if (tableTimer) {
    clearInterval(tableTimer);
  }
  if (selectionTimer) {
    clearInterval(selectionTimer);
  }
});

async function handleResetStatus() {
  const records = gridApi.grid?.getCheckboxRecords() || [];
  if (records.length === 0) {
    message.warn('请选择要重置的账号');
    return;
  }

  try {
    const mails = records.map((item: any) => item.mail);
    const result = await __API__.resetAccountsStatus(mails);
    message.success(`已重置 ${result.count} 个账号的状态`);
    fetchTableData();
    updateTaskStatus();
  } catch (error: any) {
    console.error('Reset status error:', error);
    message.error('重置状态失败: ' + error.message);
  }
}

// 获取选中的记录
function getSelectedRecords() {
  try {
    return gridApi.grid?.getCheckboxRecords?.() || [];
  } catch (error) {
    return [];
  }
}

// 获取启动任务模态框的统计信息
function getStartTasksInfo(): string {
  const records = getSelectedRecords();
  if (records.length === 0) {
    return '请先选择要启动的账号';
  }
  const noneCount = records.filter((item: any) => item.status === 'NONE').length;
  const retryableCount = records.filter((item: any) => {
    if (item.status === 'NONE') return false;
    return shouldRetry(item.statusText) && getRetryCount(item.mail) < maxRetryCount.value;
  }).length;
  const totalCanStart = noneCount + retryableCount;
  return `已选中 ${records.length} 个账号，其中 ${totalCanStart} 个账号可以启动（${noneCount} 个新任务）`;
}


// 代理格式验证函数
function validateProxyFormat(proxyString: string): { valid: boolean; error?: string; normalized?: string } {
  if (!proxyString || typeof proxyString !== 'string' || !proxyString.trim()) {
    return { valid: false, error: '代理地址不能为空' };
  }

  // 先 trim 首尾空格
  const trimmed = proxyString.trim();

  if (!trimmed) {
    return { valid: false, error: '代理地址不能为空' };
  }

  // 检查是否包含空格（包括中间空格），如果包含则拒绝添加
  if (/\s/.test(trimmed)) {
    return { valid: false, error: '代理地址不能包含空格，请检查输入' };
  }

  try {
    // 支持 host:port:username:password 格式
    const parts = trimmed.split(':');
    if (!trimmed.includes('://') && parts.length === 4) {
      const [host, port] = parts.map((p) => p.trim());
      if (!host || !port) {
        return { valid: false, error: '代理格式错误：缺少主机或端口' };
      }
      if (isNaN(Number(port))) {
        return { valid: false, error: '代理格式错误：端口必须是数字' };
      }
      return { valid: true, normalized: trimmed };
    }

    // 支持 http://username:password@host:port 格式
    let urlString = trimmed;
    if (!urlString.includes('://')) {
      urlString = `http://${urlString}`;
    }

    const urlInfo = new URL(urlString);

    if (!urlInfo.hostname) {
      return { valid: false, error: '代理格式错误：缺少主机名' };
    }

    if (!urlInfo.port && !urlInfo.hostname.includes(':')) {
      return { valid: false, error: '代理格式错误：缺少端口' };
    }

    return { valid: true, normalized: trimmed };
  } catch (error) {
    return { valid: false, error: '代理格式错误：无法解析代理地址' };
  }
}

// 代理池管理相关函数
async function fetchProxyPool() {
  try {
    const data = await __API__.getProxyPool();
    proxyPoolList.value = data || [];
  } catch (error: any) {
    console.error('获取代理池失败:', error);
    message.error('获取代理池失败: ' + error.message);
  }
}

async function handleAddProxy() {
  const proxyText = newProxyText.value.trim();
  if (!proxyText) {
    message.warn('请输入代理地址');
    return;
  }

  // 验证代理格式
  const validation = validateProxyFormat(proxyText);
  if (!validation.valid) {
    message.error(validation.error || '代理格式错误');
    return;
  }

  const normalizedProxy = validation.normalized || proxyText;

  // 检查是否已存在相同的代理地址
  const existingProxy = proxyPoolList.value.find(p => p.proxy === normalizedProxy);
  if (existingProxy) {
    message.warn('该代理地址已存在，无需要重复添加');
    return;
  }

  try {
    // 使用规范化后的代理地址（已 trim 首尾空格，且已验证不包含中间空格）
    await __API__.addProxyToPool(normalizedProxy, newProxyName.value.trim() || undefined);
    message.success('代理添加成功');
    newProxyText.value = '';
    newProxyName.value = '';
    await fetchProxyPool();
  } catch (error: any) {
    console.error('添加代理失败:', error);
    message.error('添加代理失败: ' + error.message);
  }
}

async function handleBatchAddProxies() {
  const proxyText = newProxyText.value.trim();
  if (!proxyText) {
    message.warn('请输入代理地址（每行一个）');
    return;
  }

  const lines = proxyText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length === 0) {
    message.warn('没有有效的代理地址');
    return;
  }

  // 验证每个代理的格式
  const invalidProxies: Array<{ proxy: string; error: string }> = [];
  const validProxies: Array<{ proxy: string; name?: string }> = [];
  const seenProxies = new Set<string>(); // 用于去重输入的代理

  for (const line of lines) {
    const validation = validateProxyFormat(line);
    if (!validation.valid) {
      invalidProxies.push({ proxy: line, error: validation.error || '格式错误' });
    } else {
      const normalizedProxy = validation.normalized || line;
      // 检查输入中是否重复
      if (seenProxies.has(normalizedProxy)) {
        invalidProxies.push({ proxy: line, error: '输入中重复的代理地址' });
        continue;
      }
      seenProxies.add(normalizedProxy);

      // 检查是否已存在于代理池中
      const existingProxy = proxyPoolList.value.find(p => p.proxy === normalizedProxy);
      if (existingProxy) {
        invalidProxies.push({ proxy: line, error: '代理池中已存在' });
        continue;
      }

      // 使用规范化后的代理地址（已 trim 首尾空格，且已验证不包含中间空格）
      validProxies.push({ proxy: normalizedProxy, name: newProxyName.value.trim() || undefined });
    }
  }

  if (invalidProxies.length > 0) {
    const errorMsg = `以下代理已跳过：\n${invalidProxies.map(p => `  - ${p.proxy}: ${p.error}`).join('\n')}`;
    message.warn(errorMsg);
  }

  if (validProxies.length === 0) {
    message.warn('没有可添加的有效代理地址');
    return;
  }

  try {
    await __API__.addProxiesToPool(validProxies);
    const skipCount = invalidProxies.length;
    message.success(`成功添加 ${validProxies.length} 个代理${skipCount > 0 ? `，跳过 ${skipCount} 个（格式错误/重复/已存在）` : ''}`);
    newProxyText.value = '';
    newProxyName.value = '';
    await fetchProxyPool();
  } catch (error: any) {
    console.error('批量添加代理失败:', error);
    message.error('批量添加代理失败: ' + error.message);
  }
}

async function handleToggleProxy(proxy: any) {
  try {
    await __API__.updateProxyInPool(proxy.id, undefined, undefined, !proxy.enabled);
    message.success(proxy.enabled ? '代理已禁用' : '代理已启用');
    await fetchProxyPool();
  } catch (error: any) {
    console.error('更新代理状态失败:', error);
    message.error('更新代理状态失败: ' + error.message);
  }
}

async function handleDeleteProxy(id: string) {
  try {
    await __API__.deleteProxyFromPool(id);
    message.success('代理删除成功');
    await fetchProxyPool();
  } catch (error: any) {
    console.error('删除代理失败:', error);
    message.error('删除代理失败: ' + error.message);
  }
}

function openProxyPoolModal() {
  proxyPoolModalVisible.value = true;
  fetchProxyPool();
}

// 检查单个代理状态
async function handleCheckProxy(proxy: any) {
  const proxyItem = proxyPoolList.value.find(p => p.id === proxy.id);
  if (!proxyItem) return;
  
  proxyItem.checkStatus = 'checking';
  proxyItem.checkLatency = undefined;
  proxyItem.checkError = undefined;
  
  try {
    const result = await __API__.checkProxyStatus(proxy.proxy);
    proxyItem.checkStatus = result.success ? 'success' : 'failed';
    proxyItem.checkLatency = result.latency;
    proxyItem.checkError = result.error;
    
    if (result.success) {
      message.success(`代理检查成功，延迟: ${result.latency}ms`);
    } else {
      message.error(`代理检查失败: ${result.error || '未知错误'}`);
    }
  } catch (error: any) {
    proxyItem.checkStatus = 'failed';
    proxyItem.checkError = error.message || '检查失败';
    message.error('检查代理失败: ' + error.message);
  }
}

// 一键检查所有启用的代理
async function handleCheckAllProxies() {
  if (isCheckingProxies.value) return;
  
  const enabledProxies = proxyPoolList.value.filter(p => p.enabled);
  if (enabledProxies.length === 0) {
    message.warn('没有启用的代理需要检查');
    return;
  }
  
  isCheckingProxies.value = true;
  
  // 重置所有代理的检查状态
  proxyPoolList.value.forEach(proxy => {
    if (proxy.enabled) {
      proxy.checkStatus = 'checking';
      proxy.checkLatency = undefined;
      proxy.checkError = undefined;
    }
  });
  
  try {
    const proxyIds = enabledProxies.map(p => p.id);
    const results = await __API__.checkProxiesStatus(proxyIds);
    
    // 更新检查结果
    results.forEach(result => {
      const proxyItem = proxyPoolList.value.find(p => p.id === result.id);
      if (proxyItem) {
        proxyItem.checkStatus = result.success ? 'success' : 'failed';
        proxyItem.checkLatency = result.latency;
        proxyItem.checkError = result.error;
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    message.success(`代理检查完成: ${successCount} 个成功, ${failCount} 个失败`);
  } catch (error: any) {
    message.error('批量检查代理失败: ' + error.message);
    // 将所有检查中的代理标记为失败
    proxyPoolList.value.forEach(proxy => {
      if (proxy.checkStatus === 'checking') {
        proxy.checkStatus = 'failed';
        proxy.checkError = '检查失败';
      }
    });
  } finally {
    isCheckingProxies.value = false;
  }
}

// 打码平台配置管理相关函数
async function fetchCaptchaConfig() {
  try {
    const config = await __API__.getCaptchaConfig();
    capmonsterToken.value = config.capmonsterToken || '';
    twoCaptchaToken.value = config.twoCaptchaToken || '';
    defaultCaptchaService.value = config.defaultService || 'capmonster';
    developmentMode.value = config.developmentMode ?? false;
  } catch (error: any) {
    console.error('获取软件配置失败:', error);
    message.error('获取软件配置失败: ' + error.message);
  }
}

async function handleSaveCaptchaConfig() {
  if (!capmonsterToken.value.trim() && !twoCaptchaToken.value.trim()) {
    message.warn('请至少配置一个打码平台的 token');
    return;
  }

  try {
    await __API__.saveCaptchaConfig(
      capmonsterToken.value.trim(),
      twoCaptchaToken.value.trim(),
      defaultCaptchaService.value,
      developmentMode.value
    );
    message.success('软件配置保存成功');
    captchaConfigModalVisible.value = false;
  } catch (error: any) {
    console.error('保存软件配置失败:', error);
    message.error('保存软件配置失败: ' + error.message);
  }
}

function openCaptchaConfigModal() {
  captchaConfigModalVisible.value = true;
  fetchCaptchaConfig();
}
</script>

<template>
  <div class="p-4 h-full">
    <Grid>
      <template #toolbar_buttons>
        <Button v-if="!isTaskRunning && !isStarting" type="primary" @click="taskModalVisible = true">
          启动所有任务
        </Button>
        <Button v-if="isStarting" type="primary" loading>
          启动中...
        </Button>
        <Button v-if="isTaskRunning && !isStarting" type="primary" danger @click="handleStopAllTasks">
          停止所有任务
        </Button>
        <Popconfirm v-if="isTaskRunning" title="是否停止选中的任务？" @confirm="handleStopTasks">
          <Button type="default" danger class="ml-2">停止单个任务</Button>
        </Popconfirm>
        <Popconfirm v-if="hasSelectedRecords" title="是否删除选中的账号？" @confirm="handleDelete">
          <Button type="default" danger class="ml-2">批量删除</Button>
        </Popconfirm>
        <Popconfirm v-if="hasSelectedRecords" title="是否重置选中账号的状态？" @confirm="handleResetStatus">
          <Button type="default" class="ml-2">重置状态</Button>
        </Popconfirm>
        <span class="ml-4 text-sm text-gray-600">
          任务进度: {{ taskStatus.runningCount }}/{{ totalTasks }} | 当前运行: {{ taskStatus.runningCount }}
        </span>
      </template>
      <template #toolbar-tools>
        <Button type="default" @click="openImportModal" class="ml-2">导入账号</Button>
        <Button type="default" @click="openProxyPoolModal" class="ml-2">代理池管理</Button>
        <Button type="default" @click="openCaptchaConfigModal" class="ml-2">软件配置</Button>
      </template>
    </Grid>

    <Modal v-model:visible="importModalVisible" title="导入账号" @ok="handleImport" width="800px">
      <div class="mb-4">
        <input type="file" accept=".xlsx, .xls" @change="handleFileChange" />
        <p class="text-xs text-gray-500 mt-1">支持格式: .xlsx, .xls</p>
      </div>
      <Input.TextArea v-model:value="importText" :rows="15" class="!whitespace-pre !overflow-x-scroll"
        placeholder="粘贴您的账号数据" />
    </Modal>

    <Modal v-model:visible="taskModalVisible" title="启动任务" @ok="handleStartTasks" width="600px">
      <div class="mb-4">
        <label class="block mb-2">最大并发个数（同时运行的任务数）:</label>
        <InputNumber v-model:value="maxConcurrency" :min="1" :max="30" class="w-full" />
      </div>
      <div class="mb-4">
        <label class="block mb-2">最大重试次数:</label>
        <InputNumber v-model:value="maxRetryCount" :min="0" :max="10" class="w-full" />
        <p class="text-xs text-gray-500 mt-1">每次窗口自动关闭并重启时算一次重试，成功不算重试</p>
      </div>
      <div class="mb-4">
        <label class="block mb-2">显示窗口:</label>
        <input type="checkbox" v-model="showWindow" class="mr-2" />
        <span class="text-sm text-gray-600">是否显示任务窗口</span>
      </div>
      <div class="mb-4">
        <label class="block mb-2">启用代理:</label>
        <input type="checkbox" v-model="enableProxy" class="mr-2" />
        <span class="text-sm text-gray-600">启用后：如果账号有指定代理则使用指定代理，否则从代理池随机选择</span>
      </div>
      <!-- 暂时不显示清除浏览器数据 -->
      <!-- <div class="mb-4">
        <label class="block mb-2">清除浏览器数据:</label>
        <input type="checkbox" v-model="clearBrowserData" class="mr-2" />
        <span class="text-sm text-gray-600">每次启动窗口时清除浏览器数据（包括 cookies、localStorage 等）</span>
      </div> -->
      <div class="mb-4">
        <label class="block mb-2">添加购物车时机:</label>
        <select v-model="addToCartTiming" class="w-full p-2 border rounded">
          <option value="beforeLogin">登录前添加</option>
          <option value="afterLogin">登录后添加</option>
        </select>
        <p class="text-xs text-gray-500 mt-1">选择在登录前还是登录后添加商品到购物车</p>
      </div>
      <div class="mb-4">
        <p class="text-sm text-gray-600">
          {{ getStartTasksInfo() }}
        </p>
      </div>
    </Modal>

    <Modal v-model:visible="proxyPoolModalVisible" title="代理池管理" width="800px" :footer="null">
      <div class="mb-4">
        <!-- <h3 class="text-lg font-semibold mb-2">添加代理</h3> -->
        <div class="mb-2">
          <label class="block mb-1">代理名称（可选）:</label>
          <Input v-model:value="newProxyName" placeholder="例如: 日本代理" class="mb-2" />
        </div>
        <div class="mb-2">
          <label class="block mb-1">代理地址（支持批量，每行一个）:</label>
          <Input.TextArea v-model:value="newProxyText" :rows="5"
            placeholder="格式: http://username:password@host:port 或 host:port:username:password" />
          <p class="text-xs text-gray-500 mt-1">
            支持的格式：<br />
            1. http://username:password@host:port<br />
            2. host:port:username:password
          </p>
        </div>
        <div class="flex gap-2">
          <Button type="primary" @click="handleAddProxy">添加单个</Button>
          <Button type="default" @click="handleBatchAddProxies">批量添加</Button>
        </div>
      </div>

      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-lg font-semibold">代理列表 ({{ proxyPoolList.length }})</h3>
          <Button type="primary" @click="handleCheckAllProxies" :loading="isCheckingProxies" :disabled="isCheckingProxies">
            一键检查代理状态
          </Button>
        </div>
        <div class="border rounded p-2 max-h-96 overflow-y-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b">
                <th class="text-left p-2">名称</th>
                <th class="text-left p-2">代理地址</th>
                <th class="text-left p-2">状态</th>
                <th class="text-left p-2">检查结果</th>
                <th class="text-left p-2">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="proxy in proxyPoolList" :key="proxy.id" class="border-b">
                <td class="p-2">{{ proxy.name || '-' }}</td>
                <td class="p-2 font-mono text-xs">{{ proxy.proxy }}</td>
                <td class="p-2">
                  <span :class="proxy.enabled ? 'text-green-600' : 'text-gray-400'">
                    {{ proxy.enabled ? '启用' : '禁用' }}
                  </span>
                </td>
                <td class="p-2">
                  <div v-if="proxy.checkStatus === 'checking'" class="text-blue-600">
                    检查中...
                  </div>
                  <div v-else-if="proxy.checkStatus === 'success'" class="text-green-600">
                    ✓ 可用
                    <span v-if="proxy.checkLatency" class="text-xs text-gray-500 ml-1">
                      ({{ proxy.checkLatency }}ms)
                    </span>
                  </div>
                  <div v-else-if="proxy.checkStatus === 'failed'" class="text-red-600">
                    ✗ 不可用
                    <span v-if="proxy.checkError" class="text-xs text-gray-500 ml-1" :title="proxy.checkError">
                      ({{ proxy.checkError.length > 20 ? proxy.checkError.substring(0, 20) + '...' : proxy.checkError }})
                    </span>
                  </div>
                  <div v-else class="text-gray-400 text-xs">
                    未检查
                  </div>
                </td>
                <td class="p-2">
                  <Button size="small" @click="handleCheckProxy(proxy)" :loading="proxy.checkStatus === 'checking'" class="mr-2">
                    检查
                  </Button>
                  <Button size="small" @click="handleToggleProxy(proxy)" class="mr-2">
                    {{ proxy.enabled ? '禁用' : '启用' }}
                  </Button>
                  <Popconfirm title="确定要删除这个代理吗？" @confirm="handleDeleteProxy(proxy.id)">
                    <Button size="small" danger>删除</Button>
                  </Popconfirm>
                </td>
              </tr>
              <tr v-if="proxyPoolList.length === 0">
                <td colspan="5" class="p-4 text-center text-gray-400">暂无代理</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          说明：如果账号没有指定代理，启动任务时会从代理池中随机选择一个启用的代理使用。每次重试时也会重新随机选择。
        </p>
      </div>
    </Modal>

    <Modal v-model:visible="captchaConfigModalVisible" title="软件配置" width="600px" @ok="handleSaveCaptchaConfig">
      <div class="mb-4">
        <h3 class="text-lg font-semibold mb-2">配置打码平台</h3>
        <div class="mb-4">
          <label class="block mb-2">默认打码平台:</label>
          <select v-model="defaultCaptchaService" class="w-full p-2 border rounded">
            <option value="capmonster">CapMonster</option>
            <option value="2captcha">2Captcha</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">选择默认使用的打码平台</p>
        </div>
        <div class="mb-4">
          <label class="block mb-2">CapMonster Token:</label>
          <Input.Password v-model:value="capmonsterToken" placeholder="请输入 CapMonster API Key" />
          <p class="text-xs text-gray-500 mt-1">CapMonster 打码平台的 API Key</p>
        </div>
        <div class="mb-4">
          <label class="block mb-2">2Captcha Token:</label>
          <Input.Password v-model:value="twoCaptchaToken" placeholder="请输入 2Captcha API Key" />
          <p class="text-xs text-gray-500 mt-1">2Captcha 打码平台的 API Key</p>
        </div>
        <div class="mb-4">
          <label class="block mb-2">
            <input type="checkbox" v-model="developmentMode" class="mr-2" />
            开发模式
          </label>
          <p class="text-xs text-gray-500 mt-1">启用后，所有任务窗口将自动打开开发者工具，且不会进行实际下单操作</p>
        </div>
        <p class="text-xs text-gray-500">
          说明：所有任务将使用上面选择的默认打码平台。请确保已配置对应平台的 Token。
        </p>
      </div>
    </Modal>
  </div>
</template>
