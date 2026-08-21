# trisakion-dev-convention-skill

개발 컨벤션(SP/동시성/보안 설계 원칙)을 Claude Code 스킬로 구조화하고,
그 컨벤션을 코드에 자동으로 강제하는 검증 서브에이전트를 붙인 프로젝트.

## 왜 만들었나

컨벤션 문서는 대부분 "지켜지길 바라는 문서"로 끝난다. 이 저장소는 그 문서를
Claude Code가 실행 시점에 직접 읽고(Glob/Read), 그 기준으로 코드를 판정하게 만들어
**문서와 검증 로직이 항상 같은 소스를 보게** 했다. (아래 "설계 원칙" 참고)

실제로 `trisakion-sp-convention-validator`를 GM Platform(개인 포트폴리오 프로젝트)에 돌려
SUPER_ADMIN 권한 우회 Function들이 앱이 전달한 role_code를 재검증 없이 신뢰하던
문제를 포함해 여러 건을 발견·수정했다.

## 다루는 범위

- 코드 스타일 (들여쓰기, 주석, Swagger 문서화)
- Git/커밋 규칙, 테스트 태도
- SP/Function 작성 규약 — 네이밍, 권한체크, 결과반환, 본문흐름, TOCTOU 재검증,
  전역 테이블 잠금순서를 통한 데드락 방지
- 동시성 · 멱등성 · 상태전이 3관점 레이스 컨디션 점검
- 로그 DB 물리 분리, 애플리케이션 로깅 원칙
- 코드 모듈화, TypeScript 에러 처리(ERROR_MAP + BusinessException), 의존성 버전 관리
- 보안 — S2S HMAC 인증, SQL Injection 방지, 비밀번호 저장, XSS/CSRF/httpOnly 쿠키,
  외부 diff/PR 프롬프트 인젝션 방지

## 설치

```bash
npx skills add trisakion0500/trisakion-dev-convention-skill --skill trisakion-dev-convention-skill --agent claude-code
```

프로젝트 루트에서 실행하면 `.claude/skills/trisakion-dev-convention-skill/`에 설치된다.

> `--skill` 플래그는 지정한 스킬 디렉토리만 가져오므로 `agents/`·`commands/`는 함께
> 설치되지 않는다. 아래 두 파일은 필요 시 직접 복사한다.

```bash
tdcs_dir=$(mktemp -d)
git clone https://github.com/trisakion0500/trisakion-dev-convention-skill.git "$tdcs_dir"
mkdir -p .claude/agents .claude/commands
cp "$tdcs_dir"/agents/*.md .claude/agents/
cp "$tdcs_dir"/commands/*.md .claude/commands/
rm -rf "$tdcs_dir"
```

## 서브에이전트

| 서브에이전트 | 상태 | 검증 기준 | 커맨드 |
|---|---|---|---|
| `trisakion-sp-convention-validator` | ✅ 완성 | SKILL.md 4장 (SP/Function 컨벤션) | `/trisakion-spv` |
| `trisakion-table-lock-order-auditor` | ✅ 완성 | 프로젝트별 `TABLE_LOCK_ORDER.md` 대비 SP 실제 락 순서 일치 여부 (SKILL.md 4.7) | `/trisakion-lock` |
| `trisakion-race-condition-checker` | ✅ 완성 | SKILL.md 5장 본문/6.1절 (동시성·멱등성·상태전이 3관점) | `/trisakion-race` |
| `trisakion-batch-lifecycle-auditor` | ✅ 완성 | SKILL.md 5.1/5.2/5.3/7.4절 (배치 인스턴스 중복실행·정상종료 훅·시스템 행위자 sentinel·로그 파일명 인스턴스 suffix) | `/trisakion-batch` |
| `trisakion-security-audit-agent` | ✅ 완성 | SKILL.md 14.1/14.2/14.3/14.4절 (S2S HMAC 인증·SQLi·비밀번호 저장·XSS/CSRF/httpOnly 쿠키) | `/trisakion-sec` |

## 커밋 전 크리덴셜 스캔 (pre-commit hook)

위 6개 서브에이전트와 성격이 다르다 — LLM이 아니라 **husky pre-commit 훅으로 커밋마다 강제 실행되는 순수 Node 스크립트**(`scripts/pre-commit-privacy-scan.js`)로, 토큰 소모 없이 항상 돌고, 그래서 Claude Code 전용이 아니다. `.gitignore`의 `.env`·`.mcp.json` 누락, `.env.example`·`.mcp.json.sample`의 실값, API 키·DB 커넥션 스트링·private key 등 크리덴셜 리터럴, 공인 IP를 스캔해 위반 시 커밋을 막는다. 기준은 SKILL.md 15장.

설치 명령어와 `.husky/pre-commit` 내용은 순수 터미널 커맨드라 Claude Code 없이 Cursor, Codex, 그냥 에디터+터미널 조합에서도 그대로 따라 하면 동일하게 적용된다. 아래는 빈 프로젝트 기준 전체 단계다.

**1. 스크립트 파일 확보**

Claude Code로 `npx skills add`를 이미 실행했다면 `.claude/skills/trisakion-dev-convention-skill/scripts/pre-commit-privacy-scan.js`가 이미 있다. 아니라면 이 저장소를 클론해 `scripts/pre-commit-privacy-scan.js` 파일 하나만 프로젝트 아무 위치(예: `scripts/`)에 복사한다. 외부 의존성이 없는 순수 Node 스크립트라 파일만 있으면 된다.

```bash
tdcs_dir=$(mktemp -d)
git clone https://github.com/trisakion0500/trisakion-dev-convention-skill.git "$tdcs_dir"
mkdir -p scripts
cp "$tdcs_dir"/trisakion-dev-convention-skill/scripts/pre-commit-privacy-scan.js scripts/
rm -rf "$tdcs_dir"
```

**2. husky 설치**

프로젝트에 `package.json`이 없으면 `npm install`이 최소 구성으로 하나 만들어준다. 설치 후 버전이 `^9.1.7`처럼 caret이 붙어있으면 지워서 정확한 버전으로 고정한다(컨벤션 10장 — 의존성은 `^`/`~` 없이 고정).

```bash
npm install husky@9.1.7 --save-dev
```

`package.json`을 열어 아래처럼 되어 있는지 확인한다. `name`/`version`/`private`이 없으면 채워 넣는다(`private: true`는 실수로 `npm publish` 되는 걸 막는다).

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "husky": "9.1.7"
  }
}
```

**3. husky 초기화**

```bash
npx husky init
```

`.husky/` 디렉토리와 `.husky/pre-commit`(기본 내용은 `npm test` 예시)이 생기고, `package.json`에 `"prepare": "husky"` 스크립트가 자동으로 추가된다(다른 사람이 `npm install` 할 때도 훅이 자동 활성화되게 함).

**4. 훅 내용 교체**

`.husky/pre-commit` 파일을 열어 내용을 전부 지우고 스크립트를 가리키는 한 줄로 바꾼다(1단계에서 복사한 경로에 맞게 조정).

```bash
node scripts/pre-commit-privacy-scan.js
```

Claude Code의 `npx skills add`로 설치했다면 경로는 아래가 된다.

```bash
node .claude/skills/trisakion-dev-convention-skill/scripts/pre-commit-privacy-scan.js
```

husky 9는 예전 버전과 달리 `#!/usr/bin/env sh`나 `. "$(dirname ...)"` 같은 보일러플레이트가 필요 없다. 실행할 명령만 그대로 적으면 된다.

**5. 동작 확인**

가짜 크리덴셜로 커밋이 실제로 막히는지 확인한다.

```bash
echo 'API_SECRET=sk_live_1234567890abcdef1234567890' > test-secret.txt
git add test-secret.txt
git commit -m "test"
```

`🔴 커밋 전 크리덴셜 스캔 실패` 메시지와 함께 커밋이 거부되고 종료 코드가 0이 아니면 정상 동작이다. 확인 후 테스트 파일을 치운다.

```bash
git reset test-secret.txt
rm test-secret.txt
```

이후 크리덴셜이 없는 정상 변경분을 커밋하면(예: `package.json`, `package-lock.json`, `.husky/pre-commit` 자체를 커밋) `커밋 전 크리덴셜 스캔 통과.` 메시지와 함께 정상적으로 커밋된다.

## 설계 원칙

위 6개 서브에이전트는 아래 원칙을 동일하게 따른다.

- **단일 출처 원칙** — SKILL.md 규칙 문구를 에이전트 파일에 복제하지 않고,
  실행 시점마다 Glob/Read로 해당 절을 직접 읽어 판단 기준으로 삼음
- **프로젝트 스키마 비종속** — 특정 컬럼명·파라미터명이 아닌 구조적 패턴으로 일반화
- **추출 → 목록화 → 대조** — 파일 간 대조가 필요한 항목은 "훑으며 기억"이 아니라
  명시적 2단계 절차로 강제해 누락 방지
- **diff 기반 범위 축소** — 기본은 미커밋/변경 파일만 스캔, 대조가 필요한 절만 예외적으로 전체 스캔
- **3단계 판정** — 🔴 위반(명확) / 🟡 의심(오탐 가능성 인정) / ⚪ 스킵(옵트인 문서 부재, 사유 명시)

## 업데이트

```bash
npx skills update
```

이 명령도 설치 때와 동일하게 `--skill` 스코프만 갱신한다 — `agents/`·`commands/`는 여기 딸려오지 않는다. 이 저장소에서 `agents/*.md`·`commands/*.md`가 추가되거나 바뀌었으면(예: 검증 로직 수정, 새 서브에이전트 추가) [설치](#설치) 절의 `git clone` + `cp` 절차를 그대로 다시 실행해 소비 프로젝트의 `.claude/agents/`·`.claude/commands/`를 덮어써야 한다.

```bash
tdcs_dir=$(mktemp -d)
git clone https://github.com/trisakion0500/trisakion-dev-convention-skill.git "$tdcs_dir"
mkdir -p .claude/agents .claude/commands
cp "$tdcs_dir"/agents/*.md .claude/agents/
cp "$tdcs_dir"/commands/*.md .claude/commands/
rm -rf "$tdcs_dir"
```

## 적용 중인 프로젝트

- [GM Platform](https://github.com/trisakion0500/gm-platform) — MCP/RAG 기반 GM 툴 플랫폼
- [Coupon Platform](https://github.com/trisakion0500/coupon_platform) — SP-only 쿠폰 발급 플랫폼

## 라이선스

이 프로젝트는 포트폴리오/학습 목적으로 공개된다. 개인적인 학습·열람·참고 용도로는 자유롭게 사용할 수 있으나, 상업적 이용(영리 목적 사용, 재배포, 상용 서비스에의 포함 등)은 금지된다. 자세한 내용은 [LICENSE.md](LICENSE.md)를 참고.