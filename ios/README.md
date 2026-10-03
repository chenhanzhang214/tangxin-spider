# iOS 包装工程

这个目录是糖心图谱的原生 iOS 壳。Windows 版继续使用 Electron、本地 Node 服务和 Windows ffmpeg；iOS 版通过 `WKWebView` 打开已经部署的 Web 应用，因此不会把 Windows 专用运行时带进手机。

## 归档安装包

需要 macOS、Xcode、可用的 Apple 开发者签名和一个 HTTPS Web 应用地址。仓库根目录提供了统一脚本：

```bash
IOS_WEB_APP_URL=https://your-app.example.com npm run ios:package
```

可选环境变量：

- `IOS_EXPORT_METHOD=development|ad-hoc|enterprise|app-store`，默认 `ad-hoc`
- `IOS_DEVELOPMENT_TEAM=XXXXXXXXXX`，用于导出选项中的 team ID
- `IOS_ALLOW_PROVISIONING_UPDATES=1`，允许 Xcode 自动更新签名资源

导出的 `.ipa` 位于 `release/ios/export/`。这一步必须在 macOS 上执行；当前 Windows 工作区只能生成和审查 Xcode 源码。

## 模拟器构建

```bash
npm run ios:build
```

Debug 配置默认访问 `http://127.0.0.1:8080`。在真机或远程 Web 服务上运行时，请通过 `IOS_WEB_APP_URL` 覆盖它。Release 如果没有配置地址，应用会显示配置提示，而不会加载错误页面。
