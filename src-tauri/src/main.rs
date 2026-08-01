// 发布版编译为 GUI 子系统：不附带控制台黑框（v0.1.0 缺此行导致 CUI 黑框）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    quota_nexus_lib::run();
}
