// Block / login / CAPTCHA detection. A hit stops the visit with no extraction
// and no retry; the bot decides the cooldown. This never tries to get past a
// challenge.

const CAPTCHA = /captcha|보안\s*문자|자동\s*입력\s*방지|로봇이\s*아닙니다|are you a robot|verify (?:that )?you are human|unusual traffic|비정상적인\s*(?:접근|트래픽)/i;
const DENIED = /access denied|forbidden|too many requests|요청이\s*너무\s*많|접근이\s*(?:제한|차단)|일시적으로\s*(?:차단|제한)|you have been blocked/i;
const LOGIN_PATH = /^\/(?:login|signin|sign-in|auth|member\/login|users\/sign_in)(?:\/|$)/i;

function hasProductEvidence(snapshot) {
  const ld = JSON.stringify(snapshot.jsonLd ?? []);
  return /"@type":"(?:Product|ProductGroup)"/.test(ld) || (snapshot.rows ?? []).length >= 3;
}

/** @returns {string|null} a stable reason code, or null when the page looks normal */
export function detectBlocked(snapshot, finalPath = '') {
  const status = snapshot.status;
  if (status === 429) return 'http_429';
  if (status === 403) return 'http_403';
  if (status === 401) return 'login_required';
  if (typeof status === 'number' && status >= 500) return 'http_5xx';
  if (snapshot.signals?.captchaFrame) return 'captcha';
  const head = `${snapshot.title ?? ''}\n${String(snapshot.text ?? '').slice(0, 600)}`;
  if (CAPTCHA.test(head)) return 'captcha';
  if (!hasProductEvidence(snapshot)) {
    if (DENIED.test(head)) return 'blocked_page';
    if (LOGIN_PATH.test(finalPath)) return 'login_required';
    if (snapshot.signals?.hasPasswordField && String(snapshot.text ?? '').length < 1500) return 'login_required';
  }
  return null;
}
