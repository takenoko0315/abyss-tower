import { Component } from "react";

// 外部拡張(翻訳ツール等)によるDOM改変やその他の予期せぬ描画エラーで
// 画面が真っ黒/真っ白になるのを防ぎ、リロード導線を提示する
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("AbyssTower render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0c0a09", color: "#e7e5e4", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontSize: 16, marginBottom: 20 }}>エラーが起きました(リロードで復帰)</p>
          <button onClick={() => window.location.reload()} style={{ background: "#b45309", border: "none", color: "#fff", borderRadius: 8, padding: "12px 32px", fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>リロード</button>
        </div>
      );
    }
    return this.props.children;
  }
}
