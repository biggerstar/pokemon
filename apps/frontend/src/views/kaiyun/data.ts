import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import { $t } from '#/locales';
import dayjs from 'dayjs';

// 日期格式化函数
export const formatTimeField = (time: string | null): string => {
  if (!time) return '';
  try {
    return dayjs(+time).subtract(8, 'hour').format('MM-DD HH:mm:ss');
  } catch (error) {
    return time || '';
  }
};

export function useSettingFrom(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: {
        placeholder: '请输入最高配送天数',
      },
      fieldName: 'deliveryDay',
      label: '配送天数',
    },
  ]
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'username',
      label: $t('system.user.username'),
    },
    {
      component: 'Input',
      fieldName: 'nickname',
      label: $t('system.user.nickname'),
    },
    {
      component: 'ApiSelect',
      componentProps: {
        allowClear: true,
        options: [
          { label: '广场', value: '广场' },
          { label: '推荐', value: '推荐' },
          { label: '热门', value: '热门' },
        ],
      },
      fieldName: 'status',
      label: '来源',
    },
  ];
}

export function useColumns(): VxeTableGridOptions['columns'] {
  return [
    {
      type: 'checkbox',
      title: '',
      width: 50,
    },
    {
      field: 'data.tableName',
      title: '桌名',
      width: 300,
    },
    {
      field: 'id',
      title: '桌号',
      width: 100,
      sortable: true,
      visible: false,
    },
    {
      field: 'data.statusText',
      title: '状态',
      minWidth: 200,
    },
    {
      title: '结果',
      width: 150,
      slots: { default: 'winTag' }
    },
    {
      title: '倒计时',
      width: 130,
      slots: { default: 'countdown' }
    },
    // {
    //   field: 'updatedAt',
    //   title: '更新时间',
    //   width: 160,
    //   formatter: ({ cellValue }) => formatTimeField(cellValue),
    //   sortable: true,
    // },
  ];
}
