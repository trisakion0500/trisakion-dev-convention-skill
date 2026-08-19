#!/usr/bin/env node
// 이 스크립트는 SKILL.md 15장(커밋 전 크리덴셜 노출 방지)의 구현체다.
// 판정 기준이 바뀌면 SKILL.md 15장과 이 스크립트를 함께 갱신할 것.
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getRepoRoot() {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}

function getStagedFiles(repoRoot) {
    const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    return out.split('\n').map((f) => f.trim()).filter(Boolean);
}

function isBinary(buf) {
    return buf.slice(0, 8000).includes(0);
}

// 15.1의 플레이스홀더 판별 기준 — 콤마로 나열된 다중값은 호출부에서 분리해 각 값에 적용한다.
const DUMMY_WORDS = new Set([
    'changeme', 'change_me', 'xxx', 'todo', 'test', 'example', 'placeholder',
    'user', 'username', 'pass', 'password', 'secret', 'key', 'none', 'null',
]);

function isSinglePlaceholder(rawValue) {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
    if (value === '') return true;
    if (/^your_/i.test(value)) return true;
    if (value.startsWith('<') && value.endsWith('>')) return true;
    if (DUMMY_WORDS.has(value.toLowerCase())) return true;
    if (/^(true|false)$/i.test(value)) return true;
    if (/^\d+(\.\d+)?$/.test(value)) return true; // 순수 숫자
    if (/^\d+(ms|s|m|h|d)$/i.test(value)) return true; // 시간 단위
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(value)) return true; // 로컬 URL
    if (/^(process\.env\.|import\.meta\.env\.|\$\{)/.test(value)) return true; // 코드 참조
    return false;
}

function isPlaceholderValue(rawValue) {
    return rawValue.split(',').every((part) => isSinglePlaceholder(part));
}

// 15.1-3의 구조적 크리덴셜 패턴 — 어떤 파일이든 발견되면 무조건 위반.
const STRUCTURAL_PATTERNS = [
    { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'GitHub PAT', re: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/ },
    { name: 'Private Key 블록', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
    {
        name: 'Authorization 헤더 리터럴',
        re: /Authorization['"]?\s*[:=]\s*['"]?(Bearer|Basic)\s+[A-Za-z0-9\-_.=]{8,}/i,
    },
];

// DB/Redis 커넥션 스트링(자격증명 포함) — user/pass가 더미 단어면 문서 예시로 보고 통과시킨다.
const CONNECTION_STRING_RE =
    /\b(mysql|postgres(?:ql)?|redis|mongodb(?:\+srv)?):\/\/([^:@\/\s]+):([^@\/\s]+)@[^\s'"]+/gi;

// 15.1-3의 KEY=VALUE 형태 시크릿 — 이름에 이 키워드가 들어가면 값을 검사한다.
const SUSPICIOUS_KEY_RE =
    /(secret|password|passwd|api[_-]?key|access[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|encryption[_-]?key|auth[_-]?token|jwt[_-]?secret|jwt[_-]?private[_-]?key)/i;

const KV_LINE_RE = /^\s*(?:export\s+)?["']?([A-Za-z0-9_.\-]+)["']?\s*[:=]\s*(.+?)\s*$/;

// 15.1-4의 공인 IP 리터럴 — 예외(사설 대역/루프백)는 통과시킨다.
const IPV4_RE = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;

function isExemptIp(a, b) {
    if (a === 127 || a === 0) return true; // loopback / 0.0.0.0
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}

function stripComment(line) {
    return line.replace(/\s*(#|\/\/).*$/, '');
}

function isEnvExampleFile(filePath) {
    return /(^|[\\/])\.env\.(example|sample)$/i.test(filePath);
}

/**
 * 한 줄에서 위반을 찾아 violations 배열에 채운다.
 * @param {string} filePath 저장소 루트 기준 상대 경로
 * @param {number} lineNo 1부터 시작하는 줄 번호
 * @param {string} rawLine 원본 줄
 * @param {boolean} isEnvExample .env.example/.env.sample 여부 — KEY=VALUE 판정 라벨만 달라진다
 * @param {Array} violations 출력용 위반 목록
 */
function scanLine(filePath, lineNo, rawLine, isEnvExample, violations) {
    const line = stripComment(rawLine);
    if (!line.trim()) return;

    for (const { name, re } of STRUCTURAL_PATTERNS) {
        if (re.test(line)) {
            violations.push({ filePath, lineNo, message: `${name} 패턴 발견` });
        }
    }

    let connMatch;
    CONNECTION_STRING_RE.lastIndex = 0;
    while ((connMatch = CONNECTION_STRING_RE.exec(line)) !== null) {
        const [, scheme, user, pass] = connMatch;
        if (!isSinglePlaceholder(user) || !isSinglePlaceholder(pass)) {
            violations.push({
                filePath, lineNo,
                message: `${scheme} 커넥션 스트링에 실제 자격증명으로 보이는 값 포함`,
            });
        }
    }

    const kv = line.match(KV_LINE_RE);
    if (kv) {
        const [, key, value] = kv;
        if (SUSPICIOUS_KEY_RE.test(key) && !isPlaceholderValue(value)) {
            violations.push({
                filePath, lineNo,
                message: isEnvExample
                    ? `${key} — 플레이스홀더가 아닌 실제 값으로 보임`
                    : `${key}에 실제 값으로 보이는 크리덴셜 리터럴`,
            });
        }
    }

    let ipMatch;
    IPV4_RE.lastIndex = 0;
    while ((ipMatch = IPV4_RE.exec(line)) !== null) {
        const octets = ipMatch.slice(1, 5).map(Number);
        if (octets.some((n) => n > 255)) continue; // IP 형태가 아닌 숫자 나열
        if (isExemptIp(octets[0], octets[1])) continue;
        violations.push({ filePath, lineNo, message: `공인 IP로 보이는 리터럴(${ipMatch[0]})` });
    }
}

// 15.1-1: .gitignore에 .env/.env.* 누락 여부.
function checkGitignore(repoRoot, violations) {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
        violations.push({ filePath: '.gitignore', lineNo: 0, message: '.gitignore 파일 자체가 없음' });
        return;
    }
    const lines = fs.readFileSync(gitignorePath, 'utf8').split('\n').map((l) => l.trim());
    const covered = lines.some((l) => {
        if (!l || l.startsWith('#')) return false;
        const pattern = l.replace(/^\*\*\//, '').replace(/^!/, '');
        return /^\.env(\.\*|\*)?$/.test(pattern);
    });
    if (!covered) {
        violations.push({
            filePath: '.gitignore', lineNo: 0,
            message: '.env / .env.* 패턴이 없음 — .env, .env.* 를 추가할 것',
        });
    }
}

function main() {
    const repoRoot = getRepoRoot();
    const violations = [];

    checkGitignore(repoRoot, violations);

    const selfPath = path.relative(repoRoot, __filename).split(path.sep).join('/');
    const staged = getStagedFiles(repoRoot).filter((f) => f !== selfPath);

    for (const relPath of staged) {
        const absPath = path.join(repoRoot, relPath);
        if (!fs.existsSync(absPath)) continue; // 삭제된 파일 등
        let buf;
        try {
            buf = fs.readFileSync(absPath);
        } catch {
            continue;
        }
        if (isBinary(buf)) continue;

        const isEnvExample = isEnvExampleFile(relPath);
        const text = buf.toString('utf8');
        const lines = text.split('\n');
        lines.forEach((line, idx) => scanLine(relPath, idx + 1, line, isEnvExample, violations));
    }

    if (violations.length > 0) {
        console.error('🔴 커밋 전 크리덴셜 스캔 실패 — 아래 항목을 확인하세요:\n');
        for (const v of violations) {
            const loc = v.lineNo > 0 ? `${v.filePath}:${v.lineNo}` : v.filePath;
            console.error(`  ${loc} — ${v.message}`);
        }
        console.error(`\n총 ${violations.length}건. 실제 크리덴셜이면 커밋에서 제외하고 즉시 재발급하세요.`);
        process.exit(1);
    }

    console.log('커밋 전 크리덴셜 스캔 통과.');
    process.exit(0);
}

main();
