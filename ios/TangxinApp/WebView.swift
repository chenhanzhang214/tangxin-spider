import SwiftUI
import UIKit
import WebKit

final class WebViewModel: NSObject, ObservableObject {
    @Published var isLoading = true
    @Published var hasFailure = false
    @Published var errorMessage: String?

    weak var webView: WKWebView?

    func reload() {
        hasFailure = false
        errorMessage = nil
        webView?.reload()
    }
}

struct WebView: UIViewRepresentable {
    let url: URL
    @ObservedObject var model: WebViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        model.webView = webView
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        model.webView = webView
        guard webView.url == nil else { return }
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: WebViewModel

        init(model: WebViewModel) {
            self.model = model
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation _: WKNavigation!) {
            model.isLoading = true
            model.hasFailure = false
            model.errorMessage = nil
        }

        func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
            model.isLoading = false
        }

        func webView(_ webView: WKWebView, didFail _: WKNavigation!, withError error: Error) {
            finishWithFailure(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: Error) {
            finishWithFailure(error)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void,
        ) {
            guard let targetURL = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if let host = AppConfig.webAppURL?.host, targetURL.host == host {
                decisionHandler(.allow)
            } else if ["http", "https"].contains(targetURL.scheme?.lowercased()) {
                UIApplication.shared.open(targetURL)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures,
        ) -> WKWebView? {
            guard let targetURL = navigationAction.request.url else { return nil }
            UIApplication.shared.open(targetURL)
            return nil
        }

        private func finishWithFailure(_ error: Error) {
            model.isLoading = false
            model.hasFailure = true
            model.errorMessage = error.localizedDescription
        }
    }
}
