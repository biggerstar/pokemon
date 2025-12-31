import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import dayjs from 'dayjs';

export const formatTimeField = (time: string | null): string => {
  if (!time) return '';
  try {
    return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
  } catch (error) {
    return time || '';
  }
};

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
      // sortable: true,
      filters: [
        { label: '就绪', value: '就绪' },
        { label: '处理中', value: '处理中' },
        { label: '完成', value: '完成' },
        { label: '错误', value: '错误' },
      ],
      filterMethod: (options) => {
        const { row, option } = options
        if (option.label === '就绪' && row.status === 'NONE') {
          return true
        }
        if (option.label === '完成' && row.status === 'DONE') {
          return true
        }
        if (option.label === '错误' && row.status === 'ERROR') {
          return true
        }
        if (option.label === '处理中' && row.status === 'PROCESSING') {
          return true
        }
        return false
      }
    },
    {
      field: 'windowStatus',
      title: '窗口状态',
      width: 120,
      cellRender: {
        name: 'CellTag',
        options: [
          { color: 'success', label: '打开', value: 'OPEN' },
          { color: 'default', label: '关闭', value: 'CLOSED' },
        ],
      },
      filters: [
        { label: '打开', value: 'OPEN' },
        { label: '关闭', value: 'CLOSED' },
      ],
      filterMethod: (options) => {
        const { row, option } = options
        return row.windowStatus === option.value
      }
    },
    {
      field: 'statusText',
      title: 'Status Text',
      width: 230,
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
