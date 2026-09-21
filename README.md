# 题间

本地个人考研数学题库，通过用户标注的题型、知识点和方法关联题目。

## 已实现

- 上传、拖放或粘贴题目图片；
- 上传答案图片并在做题时折叠；
- 高等数学 V1.1 内置标签；
- 自定义题型、知识点和方法；
- 按共同标签动态推荐相关题目；
- 记录做对、做错和未完成；
- 待复习题目列表；
- JSON 数据备份；
- Tauri 桌面壳、SQLite 数据库和本地附件目录；
- 浏览器开发模式下使用 localStorage，方便调试。

## 开发

```text
npm install
npm run dev
```

访问 `http://localhost:1420/`。

## 构建

```text
npm run build
npm run tauri build
```

Linux 构建 Tauri 前需要安装 WebKitGTK、GTK、DBus 等系统开发库。Fedora 至少需要 `dbus-devel`，其余依赖以 Tauri 2 的 Linux prerequisites 为准。

正式桌面模式将数据库和附件放在应用数据目录中；浏览器开发模式的数据保存在浏览器 localStorage 中。
