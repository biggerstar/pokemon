<script lang="ts" setup>
</script>
<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar_buttons>
        <ModalForm
          class="w-[60%]"
          button-content="生成Token"
          :modal-config="(api: ExtendedModalApi) => createTokenModalProps('add', {}, api)"
          :form-config="(api: ExtendedFormApi) => createTokenFormProps('add',{}, api)"
          :submit="(row: TokenApi.CreateNewTokenData) => addRowEvent(row, `添加Token成功`)"
        >
        </ModalForm>
      </template>
      <template #action="{ row }">
        <ButtonGroup>
          <ModalForm
            class="w-[60%]"
            :modal-config="(api: ExtendedModalApi) => createTokenModalProps('update', row,api)"
            :form-config="(api: ExtendedFormApi) => createTokenFormProps('update', row, api)"
            :submit="(row1: TokenApi.CreateNewTokenData) => updateRowEvent(row1, `更新成功`)"
          >
            <AButton type="link">编辑</AButton>
          </ModalForm>
          <APopconfirm title="是否删除该Token" placement="topRight" ok-text="删了吧"
                       cancel-text="不了" @confirm="deleteRowEvent(row)">
            <AButton type="link" danger>删除</AButton>
          </APopconfirm>
        </ButtonGroup>
      </template>
      <template #token="{ row }">
        <div @dblclick="copyText(row['token'])">{{ row['token'] }}</div>
      </template>
      <template #isAvailable="{ row }">
        <div v-if="row['isAvailable']" class="text-green-600">是</div>
        <div v-else class="text-red-500">否</div>
      </template>
    </Grid>
  </Page>
</template>
