import type { ErrorCategory } from "./quota-types";

/** 账号错误状态的用户语言描述（概览卡片与详情抽屉共用） */
export const ERROR_LABEL: Record<ErrorCategory, string> = {
  auth: "认证失效，请更新凭据",
  network: "网络错误，显示最后成功数据",
  parser: "上游结构变化，解析失败",
  proxy: "固定出口不可达",
};

export const ERROR_HINT: Record<ErrorCategory, string> = {
  auth: "该账号已暂停自动刷新",
  network: "保留上次额度，待恢复后刷新",
  parser: "供应商级熔断，等待解析修复",
  proxy: "已停止，未回退默认出口",
};
