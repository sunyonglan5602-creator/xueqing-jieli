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

协会可以在首页提交入驻申请。未审核或已停用的协会不能进入业务页。平台管理员开通或停用协会时写入平台审计。审计日志带上一条哈希，形成哈希链。

同一协会里，学校只看本校，老师只看自己任课的班。协会负责人看学生明细要先经学校同意，同意到期后自动失效，每次查看写入审计。教育局查看者一期不开放。菜单里的练习组卷、区域教研、物资只显示二期或三期开放。

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
| demo-parent-a | 家长 | 已生效绑定「演示生01」，「演示生02」仍待核实 |
| demo-parent-b | 家长 | 「演示生01」的其他照料人，待核实，未登记授权书 |
| demo-edu | 教育局查看者 | 只占位，没有业务权限 |

学校可以保存行政区划代码、乡镇、片区，允许先空着。学生编号是服务端生成的 UUID v7。教学纪实只能追加修订。审计日志不能删除，可按人、时间和学生检索。导出要先由学校管理员批准。

## 目录

- `frontend/`：Vue 3、Vite、vue-router、Pinia、Vant、Element Plus、PWA 骨架
- `pocketbase/`：版本锁、校验和、`pb_migrations`、`pb_hooks`
- `e2e/`：Playwright
- `scripts/`：启动、下载、种子、许可证核对

数据目录 `pocketbase/pb_data/` 不进仓库。

## 这一阶段不做的事

不部署，不建演示站，不接短信、邮件或任何付费服务。业务功能按后续变更分开进入。
