import SwiftUI
import UIKit

struct ContentView: View {
    @StateObject private var webViewModel = WebViewModel()

    var body: some View {
        Group {
            if let url = AppConfig.webAppURL {
                WebView(url: url, model: webViewModel)
                    .overlay(alignment: .top) {
                        if webViewModel.isLoading {
                            ProgressView()
                                .progressViewStyle(.linear)
                                .tint(.orange)
                                .accessibilityLabel("正在加载")
                        }
                    }
            } else {
                ConfigurationView()
            }
        }
        .background(Color(uiColor: .systemBackground))
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if AppConfig.webAppURL != nil && webViewModel.hasFailure {
                FailureBar(model: webViewModel)
            }
        }
    }
}

private struct ConfigurationView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Image(systemName: "shippingbox.fill")
                    .font(.system(size: 42, weight: .semibold))
                    .foregroundStyle(.orange)

                Text(AppConfig.displayName)
                    .font(.largeTitle.bold())

                Text("iOS 安装壳已经准备好，但 Release 包还没有绑定 Web 应用地址。")
                    .font(.title3)
                    .foregroundStyle(.secondary)

                Text("在 Xcode 的 Release 配置中设置 IOS_WEB_APP_URL 为已部署的 HTTPS 地址，然后重新归档。这样爬取、搜索、归档和下载仍由现有 Web 服务提供。")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Text("IOS_WEB_APP_URL=https://your-app.example.com npm run ios:package")
                    .font(.system(.footnote, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
            }
            .padding(24)
            .frame(maxWidth: 560, alignment: .leading)
        }
    }
}

private struct FailureBar: View {
    @ObservedObject var model: WebViewModel

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
            Text(model.errorMessage ?? "网页加载失败")
                .font(.footnote)
                .lineLimit(2)
            Spacer(minLength: 8)
            Button("重试") { model.reload() }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }
}
