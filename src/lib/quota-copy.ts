import type { ErrorCategory } from "./quota-types";

/** 账号错误状态的用户语言描述（概览卡片与详情抽屉共用） */
export const ERROR_LABEL: Record<ErrorCategory, string> = {
  auth: "认证已失效",
  network: "网络异常",
  parser: "解析失败",
  proxy: "固定出口不可达",
};

export const ERROR_HINT: Record<ErrorCategory, string> = {
  auth: "更新凭据后自动恢复刷新",
  network: "显示上次成功数据，恢复后自动刷新",
  parser: "供应商接口结构变化，等待修复",
  proxy: "已停止，未回退默认出口",
};
