# 乡村支教学情接力平台

开发期只用假数据，在本机运行。仓库里不放真实学生信息、密钥和服务器地址。

许可证：AGPL-3.0。后端锁定 PocketBase v0.40.6。

## 本地启动

需要 Node.js 22 和 curl、unzip。

```bash
cp .env.example .env
# 编辑 .env，把超级用户口令换成只留在本机的字符串
npm run dev
```

`npm run dev` 会下载 PocketBase v0.40.6（校验 sha256）、在本机 8090 端口启动它，并在 5173 端口启动前端。浏览器打开 http://127.0.0.1:5173 。页面带「演示数据」水印。

当前下载脚本只取 Linux amd64 官方包。

## 测试

```bash
npm install --prefix frontend
npm test          # Vitest
npm run lint
npm run build
npm run licenses  # 核对直接依赖许可证

npm install --prefix e2e
npx --prefix e2e playwright install chromium
npm run e2e       # Playwright 冒烟
```

```bash
npm run seed
```

种子只写假账号。先在 `.env` 填好超级用户，并保持 `npm run dev` 在跑。演示口令默认 `Demo-Pass-0000`。

| 账号 | 角色 | 说明 |
|---|---|---|
| demo-platform | 平台管理员 | 已改过口令 |
| demo-org-a / demo-org-b | 协会管理员 | 已改过口令 |
| demo-school-a | 学校管理员，同时是老师 | 已改过口令 |
| demo-teacher-a | 老师 | 第一次登录必须改口令 |
| demo-parent-a | 家长 | 账号占位，绑定在下一个 PR |
| demo-edu | 教育局查看者 | 只占位，没有业务权限 |

## 目录

- `frontend/`：Vue 3、Vite、vue-router、Pinia、Vant、Element Plus、PWA 骨架
- `pocketbase/`：版本锁、校验和、`pb_migrations`、`pb_hooks`
- `e2e/`：Playwright
- `scripts/`：启动、下载、种子、许可证核对

数据目录 `pocketbase/pb_data/` 不进仓库。

## 这一阶段不做的事

不部署，不建演示站，不接短信、邮件或任何付费服务。业务功能按后续变更分开进入。
