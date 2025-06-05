import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, Secret, SignOptions } from "jsonwebtoken";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const ADMIN_USER = process.env.ADMIN_USER!;
const ADMIN_PASS = process.env.ADMIN_PASS!;
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "3600s";

if (!ADMIN_USER || !ADMIN_PASS || !JWT_SECRET) {
  console.error(
    "ERROR: .env에 ADMIN_USER, ADMIN_PASS, JWT_SECRET 값을 반드시 설정해야 합니다."
  );
  process.exit(1);
}

app.post("/login", (req: Request, res: Response): void => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res
      .status(400)
      .json({ message: "username과 password를 모두 전달해야 합니다." });
    return;
  }

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    res
      .status(401)
      .json({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
    return;
  }

  const payload = { sub: username };

  const token = jwt.sign(
    payload,
    JWT_SECRET as Secret,
    {
      expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
    } as SignOptions
  );

  res.json({ access_token: token });
  return;
});

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    res
      .status(401)
      .json({ message: "Authorization 헤더가 존재하지 않습니다." });
    return;
  }

  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer" || !token) {
    res.status(401).json({ message: "Bearer 토큰 형태가 아닙니다." });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET as Secret) as JwtPayload;
    next();
  } catch (err) {
    res.status(401).json({ message: "유효하지 않은 토큰입니다." });
    return;
  }
}

app.get(
  "/monitor/data",
  authMiddleware,
  (req: Request, res: Response): void => {
    res.json({
      serverTime: new Date().toISOString(),
      status: "OK",
      monitored: {
        temperature: 72,
        cpuUsage: 55,
        memoryUsage: 63,
      },
    });
    return;
  }
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Auth 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
