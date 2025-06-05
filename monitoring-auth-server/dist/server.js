"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
// 1) 환경변수 읽기
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "3600s";
if (!ADMIN_USER || !ADMIN_PASS || !JWT_SECRET) {
    console.error("ERROR: .env에 ADMIN_USER, ADMIN_PASS, JWT_SECRET 값을 반드시 설정해야 합니다.");
    process.exit(1);
}
// 2) 로그인 엔드포인트
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    // 요청 바디에 username, password가 없다면 400 에러
    if (!username || !password) {
        return res
            .status(400)
            .json({ message: "username과 password를 모두 전달해야 합니다." });
    }
    // 하드코딩된 계정과 비교
    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return res
            .status(401)
            .json({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
    }
    // 계정이 맞다면 JWT 발급
    const payload = { sub: username };
    const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
    return res.json({ access_token: token });
});
// 3) 토큰 검증 미들웨어
function authMiddleware(req, res, next) {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        res
            .status(401)
            .json({ message: "Authorization 헤더가 존재하지 않습니다." });
        return;
    }
    // "Bearer eyJ..." 형태로 넘어오므로 split
    const [bearer, token] = authHeader.split(" ");
    if (bearer !== "Bearer" || !token) {
        res.status(401).json({ message: "Bearer 토큰 형태가 아닙니다." });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // req.user에 페이로드를 붙여두면, 이후 라우트에서 사용 가능
        req.user = decoded; // `req.user` 를 사용하려면 커스텀 타입 선언이 필요하지만, 간단히 any 캐스트
        next();
    }
    catch (err) {
        res.status(401).json({ message: "유효하지 않은 토큰입니다." });
    }
}
// 4) 예시 보호된 API
app.get("/monitor/data", authMiddleware, (req, res) => {
    // (req as any).user.sub === ADMIN_USER 으로 접근 가능
    return res.json({
        serverTime: new Date().toISOString(),
        status: "OK",
        monitored: {
            temperature: 72,
            cpuUsage: 55,
            memoryUsage: 63,
        },
    });
});
// 5) 서버 실행
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Auth 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
