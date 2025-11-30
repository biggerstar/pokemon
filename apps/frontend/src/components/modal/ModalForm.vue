<!-- 带表单的模态框， 通过  Confirm 按钮提交进行表单和模态框的协调-->
<script lang="ts" setup>
import { useVbenForm } from '#/adapter/form';
import {
  type ExtendedFormApi, type ExtendedModalApi, type ModalApiOptions,
  useVbenModal,
  VbenButton,
  type VbenFormProps,
} from '@vben/common-ui';
import { onMounted, type PropType, useAttrs } from 'vue';

type Attr = Record<any, any> & {
  class: string;
}
const props = defineProps({
  modalConfig: {
    type: Function as PropType<(modalApi: ExtendedModalApi) => ModalApiOptions | Promise<ModalApiOptions>>,
    default: {},
    required: false,
  },
  formConfig: {
    type: Function as PropType<(formApi: ExtendedFormApi) => VbenFormProps | Promise<VbenFormProps>>,
    default: {},
    required: false,
  },
  buttonContent: {
    type: String,
    default: '',
  },
  /** submit 可以用于提交数据，返回一个布尔值表示是否关闭模态框 */
  submit: {
    type: Function as PropType<(data: any, ref: {formApi: ExtendedFormApi, modalApi: ExtendedModalApi}) => Promise<boolean>>,
  },
});
const attrs = useAttrs() as Attr
const [BaseForm, formApi] = useVbenForm({});
const [Modal, modalApi] = useVbenModal({
  draggable: true,
  async onConfirm() {
    const result = await formApi.validate()
    if (!result.valid) return
    modalApi.setState({
      confirmLoading: true
    })
    if (!props.submit) {
      throw new Error('ModalForm attr submit function is required')
    }
    let isClose = false
    try {
      const values = await formApi.getValues()
      isClose = await props.submit({...values}, {formApi, modalApi})
    } catch (e) {
    }
    Boolean(isClose) && modalApi.close()
    modalApi.setState({
      confirmLoading: false,
    })
  },
});

async function revokeConfig() {
  formApi.setState(await props.formConfig(formApi))
  const modalProps = await props.modalConfig(modalApi)
  delete modalProps.onConfirm
  modalApi.setState(modalProps)
}

function click() {
  modalApi.open()
  revokeConfig()
}

onMounted(() => {
  revokeConfig()
})
</script>
<template>
  <div>
    <div @click="click">
      <slot name="default" >
        <span>
        <VbenButton v-if="props.buttonContent" type="primary" >{{props.buttonContent}}</VbenButton>
        </span>
      </slot>
    </div>
    <Modal :class="attrs.class">
      <BaseForm/>
    </Modal>
  </div>
</template>
