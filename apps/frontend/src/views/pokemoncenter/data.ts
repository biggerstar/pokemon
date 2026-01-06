import type { VbenFormSchema } from '#/adapter/form';
import type {
  VxeTableGridOptions,
  OnActionClickParams,
} from '#/adapter/vxe-table';
import dayjs from 'dayjs';
import { h } from 'vue';
import { Tag, Button } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';

export const formatTimeField = (time: string | null): string => {
  if (!time) return '';
  try {
    return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
  } catch (error) {
    return time || '';
  }
};

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

const formatCookieField = (
  cookies: StoredCookie[] | null | undefined,
): string => {
  if (!Array.isArray(cookies) || cookies.length === 0) return '';
  const pairs = cookies
    .filter((c) => !!c && typeof c.name === 'string')
    .map((c) => `${c.name}=${c.value ?? ''}`);
  return pairs.join('; ');
};

interface AccountRow {
  mail: string;
  status: 'NONE' | 'PROCESSING' | 'DONE' | 'ERROR';
  statusText?: string;
  windowStatus?: 'OPEN' | 'CLOSED';
  windowVisible?: boolean;
  data: Record<string, unknown>;
  created_time?: string;
}

interface ToggleResult {
  success: boolean;
  visible: boolean;
}

async function handleToggleWindowVisibility(
  params: OnActionClickParams<AccountRow>,
): Promise<void> {
  const { row } = params;
  const res: ToggleResult = await __API__.toggleTaskWindowVisibility(row.mail);
  if (res && typeof res.visible === 'boolean') {
    row.windowVisible = res.visible;
  }
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'mail',
      label: '邮箱',
    },
  ];
}

export function useColumns(): VxeTableGridOptions['columns'] {
  return [
    {
      type: 'checkbox',
      width: 50,
    },
    {
      field: 'status',
      title: 'Status',
      width: 120,
      sortable: true,
      cellRender: {
        name: 'CellTag',
        options: [
          { color: 'success', label: '已下单', value: 'DONE' },
          { color: 'default', label: '处理中', value: 'PROCESSING' },
          { color: 'error', label: '错误', value: 'ERROR' },
          { color: 'default', label: '就绪', value: 'NONE' },
        ],
      },
      filters: [
        { label: '就绪', value: '就绪' },
        { label: '处理中', value: '处理中' },
        { label: '已下单', value: '已下单' },
        { label: '错误', value: '错误' },
      ],
      filterMethod: (options) => {
        const { row, option } = options;
        if (option.label === '就绪' && row.status === 'NONE') {
          return true;
        }
        if (option.label === '已下单' && row.status === 'DONE') {
          return true;
        }
        if (option.label === '错误' && row.status === 'ERROR') {
          return true;
        }
        if (option.label === '处理中' && row.status === 'PROCESSING') {
          return true;
        }
        return false;
      },
    },
    {
      field: 'windowStatus',
      title: '窗口状态',
      width: 120,
      slots: {
        default: ({ row }: { row: AccountRow }) => {
          const isOpen = row.windowStatus === 'OPEN';
          const showEye = isOpen;
          const tag = h(
            Tag,
            { color: isOpen ? 'success' : 'default' },
            { default: () => (isOpen ? '打开' : '关闭') },
          );
          if (!showEye) {
            return [tag];
          }
          const iconName = row.windowVisible
            ? 'ant-design:eye-outlined'
            : 'ant-design:eye-invisible-filled';
          const eyeBtn = h(
            Button,
            {
              size: 'small',
              type: 'link',
              class: 'ml-1',
              onClick: () =>
                handleToggleWindowVisibility({ code: 'toggleEye', row }),
            },
            {
              default: () =>
                h(IconifyIcon, { class: 'size-5', icon: iconName }),
            },
          );
          return [
            h('div', { class: 'flex items-center gap-1' }, [tag, eyeBtn]),
          ];
        },
      },
      filters: [
        { label: '打开', value: 'OPEN' },
        { label: '关闭', value: 'CLOSED' },
      ],
      filterMethod: (options) => {
        const { row, option } = options;
        return row.windowStatus === option.value;
      },
    },
    {
      field: 'statusText',
      title: 'Status Text',
      width: 230,
    },
    {
      field: 'data.loginCookies',
      title: 'Cookie',
      width: 230,
      formatter: ({ cellValue }) =>
        formatCookieField(cellValue as StoredCookie[]),
    },
    {
      field: 'mail',
      title: 'Mail',
      width: 200,
      sortable: true,
    },
    {
      field: 'data.retailer',
      title: 'Retailer',
      width: 100,
    },
    {
      field: 'data.mode',
      title: 'Mode',
      width: 100,
    },
    {
      field: 'data.proxy',
      title: 'Proxy',
      width: 150,
    },
    {
      field: 'data.profileTitle',
      title: 'Profile Title',
      sortable: true,
      width: 150,
    },
    {
      field: 'data.lastName',
      title: 'Last Name',
      width: 100,
    },
    {
      field: 'data.firstName',
      title: 'First Name',
      width: 100,
    },
    {
      field: 'data.lastNameKana',
      title: 'Last Name Kana',
      width: 130,
    },
    {
      field: 'data.firstNameKana',
      title: 'First Name Kana',
      width: 130,
    },
    {
      field: 'data.country',
      title: 'Country',
      width: 100,
    },
    {
      field: 'data.state',
      title: 'State',
      width: 100,
    },
    {
      field: 'data.city',
      title: 'City',
      width: 100,
    },
    {
      field: 'data.address1',
      title: 'Address 1',
      width: 200,
    },
    {
      field: 'data.address2',
      title: 'Address 2',
      width: 150,
    },
    {
      field: 'data.phoneNumber',
      title: 'Phone',
      width: 120,
    },
    {
      field: 'data.zipCode',
      title: 'Zip Code',
      width: 100,
    },
    {
      field: 'data.cardName',
      title: 'Card Name',
      width: 150,
    },
    {
      field: 'data.cardNumber',
      title: 'Card Number',
      width: 150,
    },
    {
      field: 'data.expiredMonth',
      title: 'Exp Month',
      width: 100,
    },
    {
      field: 'data.expiredYear',
      title: 'Exp Year',
      width: 80,
    },
    {
      field: 'data.securityCode',
      title: 'CVC',
      width: 80,
    },
    {
      field: 'data.loginId',
      title: 'Login ID',
      width: 200,
    },
    {
      field: 'data.loginPass',
      title: 'Login Pass',
      width: 150,
    },
    {
      field: 'data.extra1',
      title: 'Extra 1',
      width: 150,
    },
    {
      field: 'data.codeMail',
      title: 'Code Mail',
      width: 200,
    },
    {
      field: 'data.smtp',
      title: 'SMTP',
      width: 160,
    },
    {
      field: 'data.productId',
      title: 'Product ID',
      width: 160,
    },
    {
      field: 'created_time',
      title: 'created time',
      width: 160,
      formatter: ({ cellValue }) => formatTimeField(cellValue),
      sortable: true,
    },
  ];
}
