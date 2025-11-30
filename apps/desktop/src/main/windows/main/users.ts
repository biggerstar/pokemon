import { globalEnv } from "@/global/global-env"

export const AC = [
  {
    u: 'fulujia',
    p: 'fde95545bf7aeaa904b872c0b68fc50d'
  },
  {
    u: 'taiwu',
    p: '21e02be1fa7e28d5e008864484b1169b'
  }
]

if (globalEnv.isDev) {
  AC.push({
    u: 'test',
    p: 'e10adc3949ba59abbe56e057f20f883e'
  })
}
