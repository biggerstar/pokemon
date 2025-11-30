export enum ElectronWindowEventEnum {
  /** 打开普通指纹窗口 */
  FP_OPEN_VIEW = 'window:open-fingerprint-view',
  /** 关闭普通指纹窗口 */
  FP_CLOSE_VIEW = 'window:close-fingerprint-view',
  /** 打开测试指纹窗口 */
  FP_OPEN_TEST_VIEW = 'window:open-fingerprint-test-view',
  /** 关闭测试指纹窗口 */
  FP_CLOSE_TEST_VIEW = 'window:close-fingerprint-test-view',
}
