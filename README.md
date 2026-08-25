# trisakion-dev-convention-skill

개발 컨벤션(SP/동시성/보안 설계 원칙)을 Claude Code 스킬로 구조화하고,
그 컨벤션을 코드에 자동으로 강제하는 검증 서브에이전트를 붙인 프로젝트.

## 요약

- 한 줄 설명: 개발 컨벤션(SP·동시성·보안) 문서를 실행 시점마다 직접 읽어 코드를 판정하는 검증 서브에이전트 세트.
- 핵심 구성: 검증 서브에이전트 6개(SP 컨벤션 / 테이블 DDL 컨벤션 / 테이블 잠금순서 / 레이스 컨디션 / 배치 라이프사이클 / 보안) + diff 기반 추천 라우터 1개 + husky pre-commit 크리덴셜 스캔(LLM 미사용, 커밋마다 강제 실행).
- 실전 검증: [GM Platform](https://github.com/trisakion0500/gm-platform)·[Coupon Platform](https://github.com/trisakion0500/coupon_platform)에 적용 중이며, GM Platform에서 SUPER_ADMIN 권한 우회 Function을 포함한 여러 건의 실제 컨벤션 위반을 발견·수정했다.
- 상태: 서브에이전트 7개·크리덴셜 스캐너 모두 완성 단계 (자세한 상태는 [서브에이전트](#서브에이전트) 표 참고).

## 목차

- [요약](#요약)
- [왜 만들었나](#왜-만들었나)
- [다루는 범위](#다루는-범위)
- [기술적 도전과 해결](#기술적-도전과-해결)
- [설치](#설치)
- [서브에이전트](#서브에이전트)
- [커밋 전 크리덴셜 스캔](#커밋-전-크리덴셜-스캔-pre-commit-hook)
- [설계 원칙](#설계-원칙)
- [업데이트](#업데이트)
- [적용 중인 프로젝트](#적용-중인-프로젝트)
- [한계 및 개선 과제](#한계-및-개선-과제)
- [라이선스](#라이선스)

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

## 기술적 도전과 해결

### 1. 문서-코드 드리프트

- **문제** — 컨벤션 문서는 대부분 "지켜지길 바라는 문서"로 끝난다. 검증 로직을 별도로 짜면 문서가 바뀔 때 검증 로직이 따라 바뀌지 않아 곧 서로 어긋난다.
- **왜 어려웠는가** — 가장 손쉬운 구현은 SKILL.md의 규칙 문구를 각 에이전트 파일에 그대로 복사해 넣는 것이다. 하지만 그러면 SKILL.md 절이 리팩터링될 때마다 6개 에이전트 파일을 전부 손으로 동기화해야 하고, 하나라도 놓치면 검증 기준이 조용히 낡은 문서를 참조하게 된다.
- **어떻게 해결했는가** — 단일 출처 원칙. 에이전트 파일에는 규칙 문구를 절대 복제하지 않고 "무엇을(어느 절을) 검증할지"만 남긴다. 실행될 때마다 `Glob`/`Read`로 SKILL.md 해당 절을 직접 읽어 그 원문을 판정 기준으로 삼는다.
- **결과** — GM Platform 실전 적용에서 SUPER_ADMIN 권한 우회 Function(앱이 전달한 role_code를 재검증 없이 신뢰)을 포함해 여러 건을 발견·수정했다.

<img src="docs/svg/single_source_structure.svg" width="1000" alt="SKILL.md를 중심으로 6개 검증 서브에이전트와 agent-router가 실행 시점마다 Glob/Read로 원문을 직접 읽고, pre-commit-privacy-scan.js는 별도 경로로 15장 기준을 코드에 구현해 실행 시점에 재참조하지 않는 단일 출처 구조 다이어그램">

```
$ /trisakion-spv

## SP Convention 검증 결과
(기준: SKILL.md .claude/skills/trisakion-dev-convention-skill/SKILL.md, 4장 / 범위: 변경분 3개 파일)

### 🔴 위반 (수정 필요)
- `db/main/functions/FN_CHECK_PROJECT_ACCESS.sql:22`
  - [4.2] SP가 앱에서 전달받은 role_code를 재검증 없이 그대로 신뢰
  - 현재: IF i_role_code >= 90 THEN ...
  - 제안: FN_GET_PROJECT_ROLE_CODE(i_requester_user_id, i_project_id)로 DB에서 직접 재조회해 비교

### 요약
검사 대상 1개 DB / 3개 파일 / 위반 1건 / 의심 0건
```
> (가상 데이터 — 실제 리포트 출력 형식 예시)

### 2. pre-commit 스캐너의 자기 자신 식별

- **문제** — 크리덴셜 스캐너 자신의 회귀 테스트 코드 안에는 가짜 커넥션 스트링·AWS 키 예시가 픽스처로 심어져 있다. 스캐너가 자기 자신을 스캔하면 이걸 진짜 유출로 오판한다.
- **왜 어려웠는가** — 처음엔 `git diff` 경로 문자열 비교로 자기 자신을 스캔 대상에서 제외했는데, GM Platform 적용 중 이 스크립트가 심볼릭 링크·스킬 캐시 사본 등 실행 경로와 다른 위치에 존재할 때 식별에 실패하는 사례가 나왔다. 다음 시도로 파일 첫머리 주석의 리터럴 문자열을 판별 키로 썼지만, 공개 저장소라 그 문자열이 그대로 노출돼 있어 다른 파일 앞에 같은 주석 한 줄만 붙이면 스캔을 위조로 우회할 수 있다는 지적을 받았다.
- **어떻게 해결했는가** — 실행 중인 스크립트(`__filename`) 전체 내용의 SHA-256 해시로 판별하도록 교체했다. 줄바꿈 방식(LF/CRLF) 차이는 정규화한 뒤 비교한다.
- **결과** — 실행 경로에 의존하지 않고 어디서 실행되든 동일하게 자기 자신을 식별하며, 판별 키가 위조 가능한 리터럴이 아니라 파일 전체 내용이라 우회할 수 없다.

```
$ node scripts/pre-commit-privacy-scan.js
🔴 커밋 전 크리덴셜 스캔 실패

.claude/skills/trisakion-dev-convention-skill/scripts/pre-commit-privacy-scan.js
  → 자기 참조 판별: SHA-256 일치 확인, 스캔 제외

test-secret.txt:1
  → API_SECRET=sk_live_1234567890abcdef1234567890 (크리덴셜 리터럴)

커밋을 거부합니다. 위반 항목을 수정한 뒤 다시 시도하세요.
```
> (가상 데이터 — 실제 리포트 출력 형식 예시)

### 3. 대량 파일 스캔 시 패턴 대조 누락

- **문제** — SP Convention Validator의 권한체크 패턴(4.2절) 검증은 서로 다른 파일에 반복되는 조건절을 찾아 대조해야 한다.
- **왜 어려웠는가** — "파일을 한 번 훑으며 기억해뒀다가 나중에 비교"하는 방식은 검사 대상 파일 수가 늘어날수록(대략 20개 이상) 신뢰할 수 없다는 게 실측으로 확인됐다 — LLM이 앞서 읽은 파일의 패턴을 뒤에서 놓치는 누락이 실제로 발생했다.
- **어떻게 해결했는가** — 추출 → 목록화 → 대조 3단계를 명시적 절차로 강제했다. ① 각 SP를 읽으며 권한/스코핑 조건절을 파일:라인과 함께 목록으로 뽑고, ② 목록을 나란히 놓고 파라미터 구성·비교 로직이 동일한 것이 2회 이상인지 하나씩 대조하고, ③ 반복이 확인되면 위반으로 표시한다.
- **결과** — 파일 개수가 늘어나도 반복 패턴 누락 없이 대조된다.

```
$ /trisakion-spv db/main/procedures/

### 4. 권한 체크 패턴 (4.2) — 추출 단계
- SP_COUPON_RESERVE.sql:18  → project_id IN (SELECT project_id FROM user_project WHERE user_id = i_requester_user_id)
- SP_COUPON_CANCEL.sql:15   → project_id IN (SELECT project_id FROM user_project WHERE user_id = i_requester_user_id)
- SP_COUPON_ISSUE.sql:20    → project_id IN (SELECT project_id FROM user_project WHERE user_id = i_requester_user_id)

### 대조 단계
- 3개 파일에서 동일 조건절 반복 확인 → 🔴 위반: FN_CHECK_PROJECT_ACCESS로 분리 필요
```
> (가상 데이터 — 실제 리포트 출력 형식 예시)

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
| `trisakion-table-convention-validator` | ✅ 완성 | SKILL.md 16장 (테이블 DDL 컨벤션 — 네이밍/타입·PK/인덱스/FK·코멘트/포맷) | `/trisakion-tcv` |
| `trisakion-table-lock-order-auditor` | ✅ 완성 | 프로젝트별 `TABLE_LOCK_ORDER.md` 대비 SP 실제 락 순서 일치 여부 (SKILL.md 4.7) | `/trisakion-lock` |
| `trisakion-race-condition-checker` | ✅ 완성 | SKILL.md 5장 본문/6.1절 (동시성·멱등성·상태전이 3관점) | `/trisakion-race` |
| `trisakion-batch-lifecycle-auditor` | ✅ 완성 | SKILL.md 5.1/5.2/5.3/7.4절 (배치 인스턴스 중복실행·정상종료 훅·시스템 행위자 sentinel·로그 파일명 인스턴스 suffix) | `/trisakion-batch` |
| `trisakion-security-audit-agent` | ✅ 완성 | SKILL.md 14.1/14.2/14.3/14.4절 (S2S HMAC 인증·SQLi·비밀번호 저장·XSS/CSRF/httpOnly 쿠키) | `/trisakion-sec` |
| `trisakion-agent-router` | ✅ 완성 | 자체 판정 기준 없음 — diff 내용을 보고 위 여섯 에이전트 중 필요한 것만 추천·오케스트레이션 | `/trisakion-route` |

<img src="docs/svg/router_flow.svg" width="700" alt="Agent Router가 diff 범위를 결정하고 1차 후보 필터링, 2차 정밀 판단을 거쳐 후보를 제시한 뒤, 사용자가 선택하면 선택된 에이전트만 순차 호출하는 흐름도. 후보 0개이거나 사용자가 취소하면 선택 UI 없이 종료된다">

## 커밋 전 크리덴셜 스캔 (pre-commit hook)

위 일곱 개 서브에이전트와 성격이 다르다 — LLM이 아니라 **husky pre-commit 훅으로 커밋마다 강제 실행되는 순수 Node 스크립트**(`scripts/pre-commit-privacy-scan.js`)로, 토큰 소모 없이 항상 돌고, 그래서 Claude Code 전용이 아니다. `.gitignore`의 `.env`·`.mcp.json` 누락, `.env.example`·`.mcp.json.sample`의 실값, API 키·DB 커넥션 스트링·private key 등 크리덴셜 리터럴, 공인 IP를 스캔해 위반 시 커밋을 막는다. 기준은 SKILL.md 15장.

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

위 여섯 개 검증 서브에이전트는 아래 원칙을 동일하게 따른다.

- **단일 출처 원칙** — SKILL.md 규칙 문구를 에이전트 파일에 복제하지 않고,
  실행 시점마다 Glob/Read로 해당 절을 직접 읽어 판단 기준으로 삼음
- **프로젝트 스키마 비종속** — 특정 컬럼명·파라미터명이 아닌 구조적 패턴으로 일반화
- **추출 → 목록화 → 대조** — 파일 간 대조가 필요한 항목은 "훑으며 기억"이 아니라
  명시적 2단계 절차로 강제해 누락 방지
- **diff 기반 범위 축소** — 기본은 미커밋/변경 파일만 스캔, 대조가 필요한 절만 예외적으로 전체 스캔
- **3단계 판정** — 🔴 위반(명확) / 🟡 의심(오탐 가능성 인정) / ⚪ 스킵(옵트인 문서 부재, 사유 명시)

`trisakion-agent-router`는 이 중 단일 출처 원칙(각 에이전트의 담당 범위를 복제하지 않고 실행 시점에 읽음)과
diff 기반 범위 축소만 공유한다. 판정 대상이 아니라 판정을 누가 할지 고르는 라우터라 3단계 판정 대신
diff 내용 기반 추천만 수행하고, 실행 여부는 항상 사용자 확인을 거친다.

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

## 한계 및 개선 과제

- **CI 자동 실행 미지원** — 6개 검증 서브에이전트는 모두 슬래시 커맨드로 수동 호출해야 한다(저장소에 `.github/workflows` 자체가 없음). PR 파이프라인에 연결된 자동 실행은 아직 없다. 매 커밋마다 자동으로 도는 건 pre-commit 크리덴셜 스캐너뿐이다.
- **SP/Function 컨벤션은 MySQL 특화** — RESULT 반환 규약(4.4)이 `SIGNAL`, `GET DIAGNOSTICS`, `DECLARE EXIT HANDLER FOR SQLEXCEPTION` 등 MySQL 문법을 전제로 한다. PostgreSQL 등 다른 DBMS나 Python/Go 등 SQL 이외 언어로의 일반화는 다루지 않는다.
- **멱등성 검증의 명시적 한계** — 멱등 판단 키가 하나의 요청을 유일하게 식별하지 못하는 경우(같은 키로 정당하게 여러 번 호출될 수 있는 경우), 레이스 컨디션 체커는 재시도와 정당한 반복을 구분할 수 없어 위반으로 판정하지 않고 스킵한다(SKILL.md 6.1).
- **크리덴셜 스캔은 히스토리를 보지 않음** — pre-commit 훅은 워킹트리/스테이징만 검사한다. 과거 커밋에 이미 노출된 시크릿은 이 훅으로 잡히지 않고 키 로테이션과 히스토리 재작성이 별도로 필요하다(SKILL.md 15.3/15.4).

## 라이선스

이 프로젝트는 포트폴리오/학습 목적으로 공개된다. 개인적인 학습·열람·참고 용도로는 자유롭게 사용할 수 있으나, 상업적 이용(영리 목적 사용, 재배포, 상용 서비스에의 포함 등)은 금지된다. 자세한 내용은 [LICENSE.md](LICENSE.md)를 참고.