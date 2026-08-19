# trisakion-dev-convention-skill

개발 컨벤션(SP/동시성/보안 설계 원칙)을 Claude Code 스킬로 구조화하고,
그 컨벤션을 코드에 자동으로 강제하는 검증 서브에이전트를 붙인 프로젝트.

## 왜 만들었나

컨벤션 문서는 대부분 "지켜지길 바라는 문서"로 끝난다. 이 저장소는 그 문서를
Claude Code가 실행 시점에 직접 읽고(Glob/Read), 그 기준으로 코드를 판정하게 만들어
**문서와 검증 로직이 항상 같은 소스를 보게** 했다. (아래 "설계 원칙" 참고)

실제로 `sp-convention-validator`를 GM Platform(개인 포트폴리오 프로젝트)에 돌려
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
git clone https://github.com/trisakion0500/trisakion-dev-convention-skill.git /tmp/tdcs
mkdir -p .claude/agents .claude/commands
cp /tmp/tdcs/agents/*.md .claude/agents/
cp /tmp/tdcs/commands/*.md .claude/commands/
```

## 서브에이전트

| 서브에이전트 | 상태 | 검증 기준 | 커맨드 |
|---|---|---|---|
| `sp-convention-validator` | ✅ 완성 | SKILL.md 4장 (SP/Function 컨벤션) | `/trisakion-spv` |
| `table-lock-order-auditor` | 🚧 진행중 | 프로젝트별 `TABLE_LOCK_ORDER.md` 대비 SP 실제 락 순서 일치 여부 | `/trisakion-lock` |
| `race-condition-checker` | 📋 예정 | SKILL.md 6.1절 (동시성·멱등성·상태전이 3관점) | `/trisakion-race` |
| `security-audit-agent` | 📋 예정 | SKILL.md 14장 (SQLi, XSS/CSRF, httpOnly 쿠키, PR 프롬프트 인젝션 등) | `/trisakion-sec` |

## 설계 원칙

4개 에이전트 모두 아래 원칙을 동일하게 따른다.

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

## 적용 중인 프로젝트

- [GM Platform](https://github.com/trisakion0500/gm-platform) — MCP/RAG 기반 GM 툴 플랫폼
- [Coupon Platform](https://github.com/trisakion0500/coupon_platform) — SP-only 쿠폰 발급 플랫폼

## 라이선스

이 프로젝트는 포트폴리오/학습 목적으로 공개된다. 개인적인 학습·열람·참고 용도로는 자유롭게 사용할 수 있으나, 상업적 이용(영리 목적 사용, 재배포, 상용 서비스에의 포함 등)은 금지된다. 자세한 내용은 [LICENSE.md](LICENSE.md)를 참고.