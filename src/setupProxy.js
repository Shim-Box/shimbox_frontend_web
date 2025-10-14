// src/setupProxy.js
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/ws", // WebSocket 경로
    createProxyMiddleware({
      target: "http://116.39.208.72:26443", // 백엔드의 WS 엔드포인트(HTTP로 둬도 WS 업그레이드 전달됨)
      changeOrigin: true,
      ws: true, // ← 꼭 켜야 WS 업그레이드 됨
      secure: false, // ← 백엔드가 자체서명/TLS 이슈 있어도 개발 중엔 무시
      logLevel: "debug",
    })
  );
  // 필요하면 REST도 함께 프록시
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://116.39.208.72:26443",
      changeOrigin: true,
      secure: false,
      logLevel: "debug",
    })
  );
};
