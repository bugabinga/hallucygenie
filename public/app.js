// node_modules/marked/lib/marked.esm.js
function M() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T = M();
function N(l3) {
  T = l3;
}
var _ = { exec: () => null };
function E(l3) {
  let e = [];
  return (t) => {
    let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
    return s || (s = l3(n), e[n] = s), s;
  };
}
function d(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (s, r) => {
    let i = typeof r == "string" ? r : r.source;
    return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var Te = ((l3 = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l3);
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: E((l3) => new RegExp(`^ {0,${l3}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: E((l3) => new RegExp(`^ {0,${l3}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}(?:\`\`\`|~~~)`)), headingBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}#`)), htmlBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: E((l3) => new RegExp(`^ {0,${l3}}>`)) };
var Oe = /^(?:[ \t]*(?:\n|$))+/;
var we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var B = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var j = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var ae = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Se = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var F = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var $e = /^[^\n]+/;
var U = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var Le = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", U).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var _e = d(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, j).getRegex();
var H = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var K = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var ze = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", K).replace("tag", H).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var le = d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex();
var Me = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", le).getRegex();
var W = { blockquote: Me, code: we, def: Le, fences: ye, heading: Pe, hr: B, html: ze, lheading: ae, list: _e, newline: Oe, paragraph: le, table: _, text: $e };
var se = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex();
var Ee = { ...W, lheading: Se, table: se, paragraph: d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex() };
var Ie = { ...W, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", K).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(F).replace("hr", B).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var ue = /^( {2,}|\\)\n(?!\s*$)/;
var Be = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var I = /[\p{P}\p{S}]/u;
var Z = /[\s\p{P}\p{S}]/u;
var X = /[^\s\p{P}\p{S}]/u;
var De = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, Z).getRegex();
var pe = /(?!~)[\p{P}\p{S}]/u;
var qe = /(?!~)[\s\p{P}\p{S}]/u;
var ve = /(?:[^\s\p{P}\p{S}]|~)/u;
var He = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var Ze = d(ce, "u").replace(/punct/g, I).getRegex();
var Ge = d(ce, "u").replace(/punct/g, pe).getRegex();
var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ne = d(he, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
var Qe = d(he, "gu").replace(/notPunctSpace/g, ve).replace(/punctSpace/g, qe).replace(/punct/g, pe).getRegex();
var je = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
var Fe = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, I).getRegex();
var Ue = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var Ke = d(Ue, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
var We = d(/\\(punct)/, "gu").replace(/punct/g, I).getRegex();
var Xe = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Je = d(K).replace("(?:-->|$)", "-->").getRegex();
var Ve = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Je).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var v = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
var Ye = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", v).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var ke = d(/^!?\[(label)\]\[(ref)\]/).replace("label", v).replace("ref", U).getRegex();
var de = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", U).getRegex();
var et = d("reflink|nolink(?!\\()", "g").replace("reflink", ke).replace("nolink", de).getRegex();
var ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var J = { _backpedal: _, anyPunctuation: We, autolink: Xe, blockSkip: He, br: ue, code: Ce, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: Ze, emStrongRDelimAst: Ne, emStrongRDelimUnd: je, escape: Ae, link: Ye, nolink: de, punctuation: De, reflink: ke, reflinkSearch: et, tag: Ve, text: Be, url: _ };
var tt = { ...J, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", v).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", v).getRegex() };
var Q = { ...J, emStrongRDelimAst: Qe, emStrongLDelim: Ge, delLDelim: Fe, delRDelim: Ke, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() };
var nt = { ...Q, br: d(ue).replace("{2,}", "*").getRegex(), text: d(Q.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var D = { normal: W, gfm: Ee, pedantic: Ie };
var A = { normal: J, gfm: Q, breaks: nt, pedantic: tt };
var rt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ge = (l3) => rt[l3];
function O(l3, e) {
  if (e) {
    if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, ge);
  } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, ge);
  return l3;
}
function V(l3) {
  try {
    l3 = encodeURI(l3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function Y(l3, e) {
  let t = l3.replace(m.findPipe, (r, i, o) => {
    let u = false, a = i;
    for (; --a >= 0 && o[a] === "\\"; ) u = !u;
    return u ? "|" : " |";
  }), n = t.split(m.splitPipe), s = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; s < n.length; s++) n[s] = n[s].trim().replace(m.slashPipe, "|");
  return n;
}
function $(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let s = 0;
  for (; s < n; ) {
    let r = l3.charAt(n - s - 1);
    if (r === e && !t) s++;
    else if (r !== e && t) s++;
    else break;
  }
  return l3.slice(0, n - s);
}
function ee(l3) {
  let e = l3.split(`
`), t = e.length - 1;
  for (; t >= 0 && m.blankLine.test(e[t]); ) t--;
  return e.length - t <= 2 ? l3 : e.slice(0, t + 1).join(`
`);
}
function fe(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function me(l3, e = 0) {
  let t = e, n = "";
  for (let s of l3) if (s === "	") {
    let r = 4 - t % 4;
    n += " ".repeat(r), t += r;
  } else n += s, t++;
  return n;
}
function xe(l3, e, t, n, s) {
  let r = e.href, i = e.title || null, o = l3[1].replace(s.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let u = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: n.inlineTokens(o) };
  return n.state.inLink = false, u;
}
function st(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let s = n[1];
  return e.split(`
`).map((r) => {
    let i = r.match(t.other.beginningSpace);
    if (i === null) return r;
    let [o] = i;
    return o.length >= s.length ? r.slice(s.length) : r;
  }).join(`
`);
}
var w = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = this.options.pedantic ? t[0] : ee(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], s = st(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let s = $(n, "#");
        (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
      }
      return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: $(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
      for (; n.length > 0; ) {
        let o = false, u = [], a;
        for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), o = true;
        else if (!o) u.push(n[a]);
        else break;
        n = n.slice(a);
        let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
        let k = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(p, i, true), this.lexer.state.top = k, n.length === 0) break;
        let h = i.at(-1);
        if (h?.type === "code") break;
        if (h?.type === "blockquote") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
          i[i.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
          break;
        } else if (h?.type === "list") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
          i[i.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s, tokens: i, text: r };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
      let i = this.rules.other.listItemRegex(n), o = false;
      for (; e; ) {
        let a = false, c = "", p = "";
        if (!(t = i.exec(e)) || this.rules.block.hr.test(e)) break;
        c = t[0], e = e.substring(c.length);
        let k = me(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !k.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, p = k.trimStart()) : R ? f = t[1].length + 1 : (f = k.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = k.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = true), !a) {
          let S = this.rules.other.nextBulletRegex(f), te = this.rules.other.hrRegex(f), ne = this.rules.other.fencesBeginRegex(f), re = this.rules.other.headingBeginRegex(f), be = this.rules.other.htmlBeginRegex(f), Re = this.rules.other.blockquoteBeginRegex(f);
          for (; e; ) {
            let G = e.split(`
`, 1)[0], C;
            if (h = G, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), ne.test(h) || re.test(h) || be.test(h) || Re.test(h) || S.test(h) || te.test(h)) break;
            if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) p += `
` + C.slice(f);
            else {
              if (R || k.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(k) || re.test(k) || te.test(k)) break;
              p += `
` + h;
            }
            R = !h.trim(), c += G + `
`, e = e.substring(G.length + 1), k = C.slice(f);
          }
        }
        r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(c) && (o = true)), r.items.push({ type: "list_item", raw: c, task: !!this.options.gfm && this.rules.other.listIsTask.test(p), loose: false, text: p, tokens: [] }), r.raw += c;
      }
      let u = r.items.at(-1);
      if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
      else return;
      r.raw = r.raw.trimEnd();
      for (let a of r.items) {
        this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []);
        let c = a.tokens[0];
        if (a.task && (c?.type === "text" || c?.type === "paragraph")) {
          a.text = a.text.replace(this.rules.other.listReplaceTask, ""), c.raw = c.raw.replace(this.rules.other.listReplaceTask, ""), c.text = c.text.replace(this.rules.other.listReplaceTask, "");
          for (let k = this.lexer.inlineQueue.length - 1; k >= 0; k--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k].src)) {
            this.lexer.inlineQueue[k].src = this.lexer.inlineQueue[k].src.replace(this.rules.other.listReplaceTask, "");
            break;
          }
          let p = this.rules.other.listTaskCheckbox.exec(a.raw);
          if (p) {
            let k = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
            a.checked = k.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = k.raw + a.tokens[0].raw, a.tokens[0].text = k.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(k)) : a.tokens.unshift({ type: "paragraph", raw: k.raw, text: k.raw, tokens: [k] }) : a.tokens.unshift(k);
          }
        } else a.task && (a.task = false);
        if (!r.loose) {
          let p = a.tokens.filter((h) => h.type === "space"), k = p.length > 0 && p.some((h) => this.rules.other.anyLine.test(h.raw));
          r.loose = k;
        }
      }
      if (r.loose) for (let a of r.items) {
        a.loose = true;
        for (let c of a.tokens) c.type === "text" && (c.type = "paragraph");
      }
      return r;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) {
      let n = ee(t[0]);
      return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    }
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = Y(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
    if (n.length === s.length) {
      for (let o of s) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
      for (let o = 0; o < n.length; o++) i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
      for (let o of r) i.rows.push(Y(o, i.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i.align[a] })));
      return i;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) {
      let n = t[1].trim();
      return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let i = $(n.slice(0, -1), "\\");
        if ((n.length - i.length) % 2 === 0) return;
      } else {
        let i = fe(t[2], "()");
        if (i === -2) return;
        if (i > -1) {
          let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
          t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
        }
      }
      let s = t[2], r = "";
      if (this.options.pedantic) {
        let i = this.rules.other.pedanticHrefTitle.exec(s);
        i && (s = i[1], r = i[3]);
      } else r = t[3] ? t[3].slice(1, -1) : "";
      return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
      if (!r) {
        let i = n[0].charAt(0);
        return { type: "text", raw: i, text: i };
      }
      return xe(n, r, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let s = this.rules.inline.emStrongLDelim.exec(e);
    if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, u, a = i, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o) continue;
        if (u = [...o].length, s[3] || s[4]) {
          a += u;
          continue;
        } else if ((s[5] || s[6]) && i % 3 && !((i + u) % 3)) {
          c += u;
          continue;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a + c);
        let k = [...s[0]][0].length, h = e.slice(0, i + s.index + k + u);
        if (Math.min(i, u) % 2) {
          let f = h.slice(1, -1);
          return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R = h.slice(2, -2);
        return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let s = this.rules.inline.delLDelim.exec(e);
    if (!s) return;
    if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, u, a = i, c = this.rules.inline.delRDelim;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = c.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i)) continue;
        if (s[3] || s[4]) {
          a += u;
          continue;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a);
        let p = [...s[0]][0].length, k = e.slice(0, i + s.index + p + u), h = k.slice(i, -i);
        return { type: "del", raw: k, text: h, tokens: this.lexer.inlineTokens(h) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, s;
      return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, s;
      if (t[2] === "@") n = t[0], s = "mailto:" + n;
      else {
        let r;
        do
          r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (r !== t[0]);
        n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: D.normal, inline: A.normal };
    this.options.pedantic ? (t.block = D.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = D.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: D, inline: A };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
    let s = 1 / 0;
    for (; e; ) {
      if (e.length < s) s = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      let r;
      if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let o = 1 / 0, u = e.slice(1), a;
        this.options.extensions.startBlock.forEach((c) => {
          a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
        }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let o = t.at(-1);
        n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    this.tokenizer.lexer = this;
    let n = e, s = null;
    if (this.tokens.links) {
      let a = Object.keys(this.tokens.links);
      if (a.length > 0) for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null; ) a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null; ) n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let r;
    for (; (s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null; ) r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let i = false, o = "", u = 1 / 0;
    for (; e; ) {
      if (e.length < u) u = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      i || (o = ""), i = false;
      let a;
      if (this.options.extensions?.inline?.some((p) => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), true) : false)) continue;
      if (a = this.tokenizer.escape(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.tag(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.link(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(a.raw.length);
        let p = t.at(-1);
        a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
        continue;
      }
      if (a = this.tokenizer.emStrong(e, n, o)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.codespan(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.br(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.del(e, n, o)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.autolink(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (!this.state.inLink && (a = this.tokenizer.url(e))) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      let c = e;
      if (this.options.extensions?.startInline) {
        let p = 1 / 0, k = e.slice(1), h;
        this.options.extensions.startInline.forEach((R) => {
          h = R.call({ lexer: this }, k), typeof h == "number" && h >= 0 && (p = Math.min(p, h));
        }), p < 1 / 0 && p >= 0 && (c = e.substring(0, p + 1));
      }
      if (a = this.tokenizer.inlineText(c)) {
        e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i = true;
        let p = t.at(-1);
        p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return t;
  }
  infiniteLoopError(e) {
    let t = "Infinite loop on byte: " + e;
    if (this.options.silent) console.error(t);
    else throw new Error(t);
  }
};
var y = class {
  options;
  parser;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
    return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, s = "";
    for (let o = 0; o < e.items.length; o++) {
      let u = e.items[o];
      s += this.listitem(u);
    }
    let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + r + i + `>
` + s + "</" + r + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
    t += this.tablerow({ text: n });
    let s = "";
    for (let r = 0; r < e.rows.length; r++) {
      let i = e.rows[r];
      n = "";
      for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
      s += this.tablerow({ text: n });
    }
    return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${O(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let s = this.parser.parseInline(n), r = V(e);
    if (r === null) return s;
    e = r;
    let i = '<a href="' + e + '"';
    return t && (i += ' title="' + O(t) + '"'), i += ">" + s + "</a>", i;
  }
  image({ href: e, title: t, text: n, tokens: s }) {
    s && (n = this.parser.parseInline(s, this.parser.textRenderer));
    let r = V(e);
    if (r === null) return O(n);
    e = r;
    let i = `<img src="${e}" alt="${O(n)}"`;
    return t && (i += ` title="${O(t)}"`), i += ">", i;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
  }
};
var L = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var b = class l2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || T, this.options.renderer = this.options.renderer || new y(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let t = "";
    for (let n = 0; n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i.type)) {
          t += o || "";
          continue;
        }
      }
      let r = s;
      switch (r.type) {
        case "space": {
          t += this.renderer.space(r);
          break;
        }
        case "hr": {
          t += this.renderer.hr(r);
          break;
        }
        case "heading": {
          t += this.renderer.heading(r);
          break;
        }
        case "code": {
          t += this.renderer.code(r);
          break;
        }
        case "table": {
          t += this.renderer.table(r);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(r);
          break;
        }
        case "list": {
          t += this.renderer.list(r);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(r);
          break;
        }
        case "html": {
          t += this.renderer.html(r);
          break;
        }
        case "def": {
          t += this.renderer.def(r);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(r);
          break;
        }
        case "text": {
          t += this.renderer.text(r);
          break;
        }
        default: {
          let i = 'Token with "' + r.type + '" type was not found.';
          if (this.options.silent) return console.error(i), "";
          throw new Error(i);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    this.renderer.parser = this;
    let n = "";
    for (let s = 0; s < e.length; s++) {
      let r = e[s];
      if (this.options.extensions?.renderers?.[r.type]) {
        let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
        if (o !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
          n += o || "";
          continue;
        }
      }
      let i = r;
      switch (i.type) {
        case "escape": {
          n += t.text(i);
          break;
        }
        case "html": {
          n += t.html(i);
          break;
        }
        case "link": {
          n += t.link(i);
          break;
        }
        case "image": {
          n += t.image(i);
          break;
        }
        case "checkbox": {
          n += t.checkbox(i);
          break;
        }
        case "strong": {
          n += t.strong(i);
          break;
        }
        case "em": {
          n += t.em(i);
          break;
        }
        case "codespan": {
          n += t.codespan(i);
          break;
        }
        case "br": {
          n += t.br(i);
          break;
        }
        case "del": {
          n += t.del(i);
          break;
        }
        case "text": {
          n += t.text(i);
          break;
        }
        default: {
          let o = 'Token with "' + i.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return n;
  }
};
var P = class {
  options;
  block;
  constructor(e) {
    this.options = e || T;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer(e = this.block) {
    return e ? x.lex : x.lexInline;
  }
  provideParser(e = this.block) {
    return e ? b.parse : b.parseInline;
  }
};
var q = class {
  defaults = M();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = y;
  TextRenderer = L;
  Lexer = x;
  Tokenizer = w;
  Hooks = P;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
      case "table": {
        let r = s;
        for (let i of r.header) n = n.concat(this.walkTokens(i.tokens, t));
        for (let i of r.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, t));
        break;
      }
      case "list": {
        let r = s;
        n = n.concat(this.walkTokens(r.items, t));
        break;
      }
      default: {
        let r = s;
        this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i) => {
          let o = r[i].flat(1 / 0);
          n = n.concat(this.walkTokens(o, t));
        }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let s = { ...n };
      if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
        if (!r.name) throw new Error("extension name required");
        if ("renderer" in r) {
          let i = t.renderers[r.name];
          i ? t.renderers[r.name] = function(...o) {
            let u = r.renderer.apply(this, o);
            return u === false && (u = i.apply(this, o)), u;
          } : t.renderers[r.name] = r.renderer;
        }
        if ("tokenizer" in r) {
          if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let i = t[r.level];
          i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
        }
        "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
      }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new y(this.defaults);
        for (let i in n.renderer) {
          if (!(i in r)) throw new Error(`renderer '${i}' does not exist`);
          if (["options", "parser"].includes(i)) continue;
          let o = i, u = n.renderer[o], a = r[o];
          r[o] = (...c) => {
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p || "";
          };
        }
        s.renderer = r;
      }
      if (n.tokenizer) {
        let r = this.defaults.tokenizer || new w(this.defaults);
        for (let i in n.tokenizer) {
          if (!(i in r)) throw new Error(`tokenizer '${i}' does not exist`);
          if (["options", "rules", "lexer"].includes(i)) continue;
          let o = i, u = n.tokenizer[o], a = r[o];
          r[o] = (...c) => {
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p;
          };
        }
        s.tokenizer = r;
      }
      if (n.hooks) {
        let r = this.defaults.hooks || new P();
        for (let i in n.hooks) {
          if (!(i in r)) throw new Error(`hook '${i}' does not exist`);
          if (["options", "block"].includes(i)) continue;
          let o = i, u = n.hooks[o], a = r[o];
          P.passThroughHooks.has(i) ? r[o] = (c) => {
            if (this.defaults.async && P.passThroughHooksRespectAsync.has(i)) return (async () => {
              let k = await u.call(r, c);
              return a.call(r, k);
            })();
            let p = u.call(r, c);
            return a.call(r, p);
          } : r[o] = (...c) => {
            if (this.defaults.async) return (async () => {
              let k = await u.apply(r, c);
              return k === false && (k = await a.apply(r, c)), k;
            })();
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p;
          };
        }
        s.hooks = r;
      }
      if (n.walkTokens) {
        let r = this.defaults.walkTokens, i = n.walkTokens;
        s.walkTokens = function(o) {
          let u = [];
          return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u;
        };
      }
      this.defaults = { ...this.defaults, ...s };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, s) => {
      let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async);
      if (this.defaults.async === true && r.async === false) return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return o(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
        let u = i.hooks ? await i.hooks.preprocess(n) : n, c = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), p = i.hooks ? await i.hooks.processAllTokens(c) : c;
        i.walkTokens && await Promise.all(this.walkTokens(p, i.walkTokens));
        let h = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i);
        return i.hooks ? await i.hooks.postprocess(h) : h;
      })().catch(o);
      try {
        i.hooks && (n = i.hooks.preprocess(n));
        let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
        i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
        let p = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
        return i.hooks && (p = i.hooks.postprocess(p)), p;
      } catch (u) {
        return o(u);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(s) : s;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var z = new q();
function g(l3, e) {
  return z.parse(l3, e);
}
g.options = g.setOptions = function(l3) {
  return z.setOptions(l3), g.defaults = z.defaults, N(g.defaults), g;
};
g.getDefaults = M;
g.defaults = T;
g.use = function(...l3) {
  return z.use(...l3), g.defaults = z.defaults, N(g.defaults), g;
};
g.walkTokens = function(l3, e) {
  return z.walkTokens(l3, e);
};
g.parseInline = z.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = L;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
var Ft = g.options;
var Ut = g.setOptions;
var Kt = g.use;
var Wt = g.walkTokens;
var Xt = g.parseInline;
var Vt = b.parse;
var Yt = x.lex;

// public/markdown.ts
g.use({
  gfm: true,
  async: false,
  breaks: false
});
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}
function normalizeMarkdownInput(text) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
g.use({
  renderer: {
    link({ href, title, text }) {
      const safeHref = escapeHtml(href);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener">${text}</a>`;
    },
    image({ href, title, text }) {
      const safeHref = escapeHtml(href);
      const safeText = escapeHtml(text || title || "image");
      return `<a href="${safeHref}" target="_blank" rel="noopener nofollow">[image: ${safeText}]</a>`;
    },
    html({ text }) {
      return escapeHtml(text);
    },
    // Code block: use `lang-` class prefix for CSS compatibility
    code({ text, lang }) {
      const cls = lang ? ` class="lang-${lang}"` : "";
      const escaped = escapeHtml(text);
      return `<pre><code${cls}>${escaped}</code></pre>`;
    },
    // Preserve task list checkbox class for CSS styling
    listitem({ text, task, checked }) {
      const rendered = g.parseInline(text);
      if (task) {
        const cls = checked ? "task-checkbox task-checked" : "task-checkbox";
        return `<li><input type="checkbox" disabled class="${cls}"${checked ? " checked" : ""}> ${rendered}</li>
`;
      }
      return `<li>${rendered}</li>
`;
    }
  }
});
function renderMarkdown(text) {
  return g.parse(normalizeMarkdownInput(text));
}

// public/app.ts
function renderThinkingBlock(text) {
  const lines = text.trim().split("\n").length;
  const preview = text.trim().split("\n")[0]?.slice(0, 60) ?? "";
  return `<details class="thinking-block"><summary>\u{1F4AD} Thinking${lines > 1 ? ` (${lines} lines)` : ""}\u2026</summary><div class="thinking-content">${renderMarkdown(text)}</div></details>`;
}
var DEFAULT_USER_AVATAR = "\u{1F3AE}";
var currentProfile = {
  version: 1,
  username: "",
  interests: "",
  hates: "",
  favorites: "",
  avatar: { type: "asset", value: "" },
  updatedAt: 0
};
function createApiHeaders() {
  return {
    "Content-Type": "application/json"
  };
}
async function fetchHistory() {
  const resp = await fetch("/api/history");
  if (!resp.ok) {
    throw new Error(`Failed to load history: ${resp.status}`);
  }
  const data = await resp.json();
  return data.messages ?? [];
}
async function sendSteer(message) {
  const resp = await fetch("/api/steer", {
    method: "POST",
    headers: createApiHeaders(),
    body: JSON.stringify({ message })
  });
  if (!resp.ok) {
    throw new Error(`Steer failed: ${resp.status}`);
  }
}
async function fetchProfile() {
  const resp = await fetch("/api/profile");
  if (!resp.ok) throw new Error(`Failed to load profile: ${resp.status}`);
  return await resp.json();
}
async function putProfile(profile) {
  const resp = await fetch("/api/profile", {
    method: "PUT",
    headers: createApiHeaders(),
    body: JSON.stringify(profile)
  });
  if (!resp.ok) throw new Error(`Failed to save profile: ${resp.status}`);
  return await resp.json();
}
async function deleteProfile() {
  const resp = await fetch("/api/profile", { method: "DELETE", headers: createApiHeaders() });
  if (!resp.ok) throw new Error(`Failed to reset profile: ${resp.status}`);
  return await resp.json();
}
async function uploadProfileAvatar(file, profile) {
  const body = new FormData();
  body.set("avatar", file);
  body.set("profile", JSON.stringify(profile));
  const resp = await fetch("/api/profile/avatar", { method: "POST", body });
  if (!resp.ok) throw new Error(`Failed to upload avatar: ${resp.status}`);
  return (await resp.json()).profile;
}
async function uploadAnalyzeImage(file) {
  const body = new FormData();
  body.set("image", file);
  const resp = await fetch("/api/analyze-image", { method: "POST", body });
  if (!resp.ok) throw new Error(`Failed to upload image: ${resp.status}`);
  return await resp.json();
}
async function generateProfileAvatar(profile) {
  const resp = await fetch("/api/profile/avatar/generate", {
    method: "POST",
    headers: createApiHeaders(),
    body: JSON.stringify(profile)
  });
  if (!resp.ok) throw new Error(`Failed to generate avatar: ${resp.status}`);
  return (await resp.json()).profile;
}
async function fetchSessions() {
  const resp = await fetch("/api/sessions");
  if (!resp.ok) throw new Error(`Failed to load sessions: ${resp.status}`);
  return await resp.json();
}
async function createNewSession() {
  const resp = await fetch("/api/sessions", { method: "POST", headers: createApiHeaders() });
  if (!resp.ok) throw new Error(`Failed to create session: ${resp.status}`);
  return (await resp.json()).session;
}
async function activateSession(id) {
  const resp = await fetch(`/api/sessions/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    headers: createApiHeaders()
  });
  if (!resp.ok) throw new Error(`Failed to activate session: ${resp.status}`);
}
function draftApiEnabled() {
  return typeof document !== "undefined" && Boolean(document.querySelector("#session-select"));
}
async function getDraft(kind) {
  if (!draftApiEnabled()) return null;
  try {
    const resp = await fetch(`/api/draft/${kind}`);
    if (!resp.ok) return null;
    return (await resp.json()).draft;
  } catch {
    return null;
  }
}
async function putDraft(kind, value) {
  if (!draftApiEnabled()) return;
  try {
    await fetch(`/api/draft/${kind}`, {
      method: "PUT",
      headers: createApiHeaders(),
      body: JSON.stringify(value)
    });
  } catch {
    return;
  }
}
async function clearDraft(kind) {
  if (!draftApiEnabled()) return;
  try {
    await fetch(`/api/draft/${kind}`, { method: "DELETE", headers: createApiHeaders() });
  } catch {
    return;
  }
}
async function fetchCreateHistory(kind) {
  const resp = await fetch(`/api/create-history?kind=${encodeURIComponent(kind)}&limit=5`);
  if (!resp.ok) return [];
  return (await resp.json()).items;
}
async function deleteCreateHistoryItem(id) {
  await fetch(`/api/create-history/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: createApiHeaders()
  });
}
function normalizeAvatarAsset(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/^asset_[0-9a-f-]+$/i.test(trimmed)) throw new Error("Avatar asset id is invalid");
  return trimmed;
}
function normalizedProfileFromForm(form) {
  return {
    version: 1,
    username: Array.from(form.username.trim()).slice(0, 40).join(""),
    interests: Array.from(form.interests.trim()).slice(0, 300).join(""),
    hates: Array.from(form.hates.trim()).slice(0, 300).join(""),
    favorites: Array.from(form.favorites.trim()).slice(0, 300).join(""),
    avatar: { type: "asset", value: normalizeAvatarAsset(form.avatarAsset ?? "") },
    updatedAt: Date.now()
  };
}
function setCurrentProfile(profile) {
  currentProfile = profile;
  const btn = document.querySelector("#profile-btn");
  if (btn) {
    const label = profile.avatar.value ? "\u{1F5BC}\uFE0F" : DEFAULT_USER_AVATAR;
    btn.dataset.avatar = label;
    btn.textContent = `${label} Profile`;
  }
  repaintCurrentUserAvatars();
}
function repaintCurrentUserAvatars() {
  document.querySelectorAll(".message--user:not(.message--steer) .message-avatar").forEach((avatar) => {
    avatar.replaceWith(renderProfileAvatar());
  });
}
function parseSSELine(line) {
  if (line.startsWith("event:")) {
    return { field: "event", value: line.slice(6).trim() };
  }
  if (line.startsWith("data:")) {
    return { field: "data", value: line.slice(5).trim() };
  }
  return null;
}
function* parseSSEChunk(chunk) {
  const lines = chunk.split("\n");
  let currentEvent = "message";
  let currentData = "";
  for (const line of lines) {
    if (line === "") {
      if (currentData) {
        yield { event: currentEvent, data: currentData };
      }
      currentEvent = "message";
      currentData = "";
      continue;
    }
    const parsed = parseSSELine(line);
    if (parsed) {
      if (parsed.field === "event") {
        currentEvent = parsed.value;
      } else if (parsed.field === "data") {
        currentData = parsed.value;
      }
    }
  }
  if (currentData) {
    yield { event: currentEvent, data: currentData };
  }
}
function $2(selector) {
  return document.querySelector(selector);
}
function createElement(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}
function renderProfileAvatar(profile = currentProfile) {
  const avatar = createElement("div", { class: "message-avatar" });
  if (/^asset_[0-9a-f-]+$/i.test(profile.avatar.value)) {
    const img = createElement("img", {
      class: "profile-avatar-img",
      src: `/asset/${profile.avatar.value}`,
      alt: "",
      loading: "lazy"
    });
    img.addEventListener("error", () => {
      avatar.textContent = DEFAULT_USER_AVATAR;
    });
    avatar.appendChild(img);
    return avatar;
  }
  avatar.textContent = DEFAULT_USER_AVATAR;
  return avatar;
}
function renderUserMessage(content) {
  const msg = createElement("div", { class: "message message--user" });
  const avatar = renderProfileAvatar();
  const bubble = createElement("div", { class: "message-bubble" });
  const contentEl = createElement("div", { class: "message-content" });
  contentEl.innerHTML = renderMarkdown(content);
  bubble.appendChild(contentEl);
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return msg;
}
function renderAssistantMessage() {
  const msg = createElement("div", { class: "message message--assistant" });
  const avatar = createElement("div", { class: "message-avatar" }, ["\u{1F9DE}"]);
  const bubble = createElement("div", { class: "message-bubble" });
  const contentEl = createElement("div", { class: "message-content" }, [""]);
  bubble.appendChild(contentEl);
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return { container: msg, contentEl };
}
function renderSteerMessage(content) {
  const msg = createElement("div", { class: "message message--steer message--user" });
  const avatar = createElement("div", { class: "message-avatar" }, ["\u{1F4A1}"]);
  const bubble = createElement("div", { class: "message-bubble" });
  const contentEl = createElement("div", { class: "message-content" });
  contentEl.innerHTML = renderMarkdown(content);
  bubble.appendChild(contentEl);
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return msg;
}
var TOOL_EMOJIS = {
  generate_image: "\u{1F3A8}",
  text_to_speech: "\u{1F399}\uFE0F",
  generate_music: "\u{1F3B5}",
  generate_music_cover: "\u{1F3B5}",
  generate_lyrics: "\u{1F4DD}",
  analyze_image: "\u{1F50E}",
  web_search: "\u{1F50D}"
};
function getToolEmoji(name) {
  return TOOL_EMOJIS[name] ?? "\u{1F527}";
}
function renderToolCardLoading(name) {
  const card = createElement("div", { class: "tool-card" });
  const header = createElement("div", { class: "tool-card-header" });
  const emoji = createElement("span", { class: "tool-emoji" }, [getToolEmoji(name)]);
  const label = createElement("span", {}, [`Running ${name.replace(/_/g, " ")}...`]);
  header.appendChild(emoji);
  header.appendChild(label);
  const loading = createElement("div", { class: "tool-card-loading" });
  const spinner = createElement("div", { class: "spinner" });
  loading.appendChild(spinner);
  card.appendChild(header);
  card.appendChild(loading);
  return card;
}
function renderToolResult(toolName, result) {
  const card = createElement("div", { class: "tool-card" });
  const header = createElement("div", { class: "tool-card-header" });
  const emoji = createElement("span", { class: "tool-emoji" }, [getToolEmoji(toolName)]);
  const label = createElement("span", {}, [toolName.replace(/_/g, " ")]);
  header.appendChild(emoji);
  header.appendChild(label);
  const body = createElement("div", { class: "tool-card-body" });
  card.appendChild(header);
  card.appendChild(body);
  if (result.type === "image") {
    const img = createElement("img", {
      class: "tool-result-image",
      src: result.content,
      alt: "Generated image",
      loading: "lazy"
    });
    img.addEventListener("click", () => openLightbox(result.content));
    body.appendChild(img);
  } else if (result.type === "audio") {
    const audio = createElement("audio", {
      class: "tool-result-audio",
      controls: "",
      src: result.content
    });
    body.appendChild(audio);
  } else {
    body.innerHTML = renderMarkdown(result.content);
  }
  if (result.type === "error") {
    body.textContent = `\u{1F615} ${result.content}`;
    card.style.borderColor = "var(--color-error)";
  }
  return card;
}
var lightboxReturnFocus = null;
function focusableIn(root) {
  return Array.from(
    root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));
}
function trapFocus(root, e) {
  if (e.key !== "Tab" || root.hidden) return;
  const focusable = focusableIn(root);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
function openLightbox(src) {
  const lightbox = $2("#lightbox");
  const img = $2("#lightbox-img");
  lightboxReturnFocus = document.activeElement;
  img.src = src;
  lightbox.hidden = false;
  lightbox.querySelector(".lightbox-close")?.focus();
}
function closeLightbox() {
  const lightbox = $2("#lightbox");
  lightbox.hidden = true;
  const img = $2("#lightbox-img");
  img.src = "";
  lightboxReturnFocus?.focus();
  lightboxReturnFocus = null;
}
var ASSET_PROMPT_PREVIEW_CHARS = 30;
function formatAssetDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString(void 0, { month: "short", day: "numeric" });
}
function getModelName(params) {
  const model = params["model"];
  if (typeof model === "string" && model) {
    return model.replace(/^MiniMax\//i, "");
  }
  return "";
}
function renderAssetParams(params) {
  const parts = [];
  const aspectRatio = params["aspect_ratio"];
  if (typeof aspectRatio === "string" && aspectRatio) {
    parts.push(aspectRatio);
  }
  const speed = params["speed"];
  if (typeof speed === "string" && speed) {
    parts.push(`${speed}x`);
  } else if (typeof speed === "number" && speed !== 1) {
    parts.push(`${speed}x`);
  }
  const lyrics = params["lyrics"];
  if (typeof lyrics === "string" && lyrics) {
    parts.push(lyrics.slice(0, 20) + (lyrics.length > 20 ? "\u2026" : ""));
  }
  const voiceId = params["voice_id"];
  if (typeof voiceId === "string" && voiceId) {
    parts.push(voiceId.slice(0, 8) + "\u2026");
  }
  return parts.join(" \xB7 ");
}
function assetTypeLabel(type) {
  if (type === "image") return "Image";
  if (type === "music") return "Music";
  return "Voice";
}
function renderAssetPreview(asset, url) {
  if (asset.type !== "image") {
    const audio = document.createElement("audio");
    audio.className = "asset-audio";
    audio.src = url;
    audio.controls = true;
    audio.preload = "metadata";
    return audio;
  }
  const button = document.createElement("button");
  button.className = "asset-preview-button";
  button.type = "button";
  button.setAttribute("aria-label", "Preview image");
  button.addEventListener("click", () => openLightbox(url));
  const img = document.createElement("img");
  img.className = "asset-thumb";
  img.src = url;
  img.alt = asset.prompt ?? "Generated image";
  img.loading = "lazy";
  button.appendChild(img);
  return button;
}
function renderAssetCard(asset) {
  const card = document.createElement("div");
  card.className = "asset-card";
  card.dataset.type = asset.type;
  card.dataset.id = asset.id;
  const badge = document.createElement("div");
  badge.className = "asset-badge";
  badge.textContent = assetTypeLabel(asset.type);
  card.appendChild(badge);
  card.appendChild(renderAssetPreview(asset, asset.url));
  const modelName = getModelName(asset.params);
  const header = document.createElement("div");
  header.className = "asset-header";
  const toolSpan = document.createElement("span");
  toolSpan.className = "asset-tool";
  toolSpan.textContent = asset.tool_name.replace(/_/g, " ");
  header.appendChild(toolSpan);
  if (modelName) {
    const modelSpan = document.createElement("span");
    modelSpan.className = "asset-model";
    modelSpan.textContent = modelName;
    header.appendChild(modelSpan);
  }
  const dateSpan = document.createElement("span");
  dateSpan.className = "asset-date";
  dateSpan.textContent = formatAssetDate(asset.created_at);
  header.appendChild(dateSpan);
  card.appendChild(header);
  const prompt = asset.prompt?.trim();
  if (prompt && prompt.length > ASSET_PROMPT_PREVIEW_CHARS) {
    const details = document.createElement("details");
    details.className = "asset-prompt-details";
    const summary = document.createElement("summary");
    summary.className = "asset-prompt-summary";
    summary.textContent = prompt.slice(0, ASSET_PROMPT_PREVIEW_CHARS) + "\u2026";
    const fullPrompt = document.createElement("div");
    fullPrompt.className = "asset-prompt-full";
    fullPrompt.textContent = prompt;
    details.appendChild(summary);
    details.appendChild(fullPrompt);
    card.appendChild(details);
  } else if (prompt) {
    const meta = document.createElement("div");
    meta.className = "asset-meta";
    meta.textContent = prompt;
    card.appendChild(meta);
  }
  const paramsStr = renderAssetParams(asset.params);
  if (paramsStr) {
    const paramsEl = document.createElement("div");
    paramsEl.className = "asset-params";
    paramsEl.textContent = paramsStr;
    card.appendChild(paramsEl);
  }
  const download = document.createElement("a");
  download.className = "asset-download";
  download.href = asset.download_url;
  download.download = asset.filename;
  download.textContent = "Download";
  card.appendChild(download);
  return card;
}
function loadAssets() {
  const grid = $2("#assets-grid");
  const empty = $2("#assets-empty");
  grid.innerHTML = "";
  empty.hidden = true;
  fetch("/assets").then((r) => r.json()).then(({ assets }) => {
    if (!assets.length) {
      empty.hidden = false;
      return;
    }
    for (const asset of assets) grid.appendChild(renderAssetCard(asset));
  }).catch(() => {
    empty.hidden = false;
    empty.textContent = "Failed to load assets \u{1F615}";
  });
}
var toastTimeout = null;
function safeErrorMessage(message) {
  if (/\{.*(?:base_resp|status_code|status_msg|error).*\}/is.test(message)) {
    return "Something went wrong. Try again! \u{1F937}";
  }
  if (/stack trace|authorization:|bearer\s+[a-z0-9._-]+/i.test(message)) {
    return "Something went wrong. Try again! \u{1F937}";
  }
  return message;
}
function showError(message, duration = 4e3) {
  const safeMessage = safeErrorMessage(message);
  const toast = $2("#error-toast");
  const msgEl = $2("#error-toast-message");
  msgEl.textContent = safeMessage;
  toast.hidden = false;
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
    toastTimeout = null;
  }, duration);
}
var isStreaming = false;
var currentAssistantEl = null;
var currentAssistantContent = null;
var activeToolCards = /* @__PURE__ */ new Map();
var renderedStreamTextLength = 0;
var rawTextBuffer = "";
var thinkingBuffer = "";
var lyricsWriteResolve = null;
var capturedLyricsText = null;
var streamHadError = false;
var streamHadToolResult = false;
var clearDraftAfterDone = null;
var refreshSessionsAfterDone = null;
async function streamSseRequest(path, body, onEvent) {
  const resp = await fetch(path, {
    method: "POST",
    headers: createApiHeaders(),
    body: JSON.stringify(body)
  });
  if (resp.status === 400) {
    const parsed = await resp.json().catch(() => null);
    streamHadError = true;
    showError(parsed?.error ?? "Session expired \u2014 please reload the page \u{1F504}");
    finishStreaming();
    return;
  }
  if (!resp.ok) {
    const parsed = await resp.json().catch(() => null);
    const msg = parsed?.error ?? `Something went wrong (${resp.status}). Try again! \u{1F937}`;
    streamHadError = true;
    showError(msg);
    finishStreaming();
    return;
  }
  if (!resp.body) {
    streamHadError = true;
    showError("No response from server \u{1F634}");
    finishStreaming();
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const events = [...parseSSEChunk(part + "\n\n")];
      for (const event of events) {
        onEvent?.(event);
        handleSSEEvent(event);
      }
    }
  }
  if (buffer.trim()) {
    const events = [...parseSSEChunk(buffer)];
    for (const event of events) {
      onEvent?.(event);
      handleSSEEvent(event);
    }
  }
  if (isStreaming) finishStreaming();
}
async function streamChat(messages, onEvent) {
  await streamSseRequest("/api/chat", { messages }, onEvent);
}
async function streamCreateTool(toolName, input, onEvent) {
  await streamSseRequest("/api/create-tool", { tool_name: toolName, input }, onEvent);
}
function ensureAssistantContent() {
  if (currentAssistantContent) return currentAssistantContent;
  const messageList = $2("#message-list");
  const { container, contentEl } = renderAssistantMessage();
  messageList.appendChild(container);
  currentAssistantEl = container;
  currentAssistantContent = contentEl;
  return contentEl;
}
function handleSSEEvent(event) {
  const { event: eventType, data } = event;
  if (eventType === "assistant_turn_start") {
    if (currentAssistantContent && currentAssistantContent.childNodes.length > 0) {
      currentAssistantEl = null;
      currentAssistantContent = null;
      activeToolCards.clear();
      rawTextBuffer = "";
      renderedStreamTextLength = 0;
      thinkingBuffer = "";
    }
    return;
  }
  if (data === "[DONE]") {
    finishStreaming();
    return;
  }
  if (eventType === "thinking") {
    try {
      const parsed = JSON.parse(data);
      if (parsed.content) {
        appendThinking(parsed.content);
      }
    } catch {
    }
    return;
  }
  if (eventType === "error") {
    streamHadError = true;
    try {
      const parsed = JSON.parse(data);
      showError(parsed.error ?? "Something went wrong \u{1F615}");
    } catch {
      showError("Something went wrong \u{1F615}");
    }
    finishStreaming();
    return;
  }
  if (eventType === "tool_start") {
    try {
      const parsed = JSON.parse(data);
      const card = renderToolCardLoading(parsed.name);
      ensureAssistantContent().appendChild(card);
      activeToolCards.set(parsed.id, card);
      scrollToBottom();
    } catch {
    }
    return;
  }
  if (eventType === "tool_result") {
    try {
      const parsed = JSON.parse(data);
      if (parsed.name === "generate_lyrics" && parsed.result.type === "text" && lyricsWriteResolve) {
        capturedLyricsText = parsed.result.content;
      }
      const loadingCard = activeToolCards.get(parsed.id);
      const resultCard = renderToolResult(parsed.name, parsed.result);
      const shouldFollowToolResize = isMessageListNearBottom();
      if (loadingCard?.isConnected) {
        loadingCard.replaceWith(resultCard);
      } else {
        ensureAssistantContent().appendChild(resultCard);
      }
      activeToolCards.delete(parsed.id);
      keepToolResultInView(resultCard, shouldFollowToolResize);
      if (parsed.result.type === "error") streamHadError = true;
      streamHadToolResult = true;
      updateQuotaBadge();
      if ($2("#create-modal")?.dataset.tabOpen === "assets") loadAssets();
    } catch {
    }
    return;
  }
  if (eventType === "message") {
    try {
      const parsed = JSON.parse(data);
      if (parsed.choices?.[0]?.delta?.content) {
        appendText(parsed.choices[0].delta.content);
      } else if (parsed.delta) {
        appendText(parsed.delta);
      }
    } catch {
    }
  }
}
function getOrCreateContentRegion(className, position) {
  if (!currentAssistantContent) return null;
  let region = currentAssistantContent.querySelector(`.${className}`);
  if (region) return region;
  region = createElement("div", { class: className });
  if (position === "start") {
    currentAssistantContent.insertBefore(region, currentAssistantContent.firstChild);
  } else {
    currentAssistantContent.appendChild(region);
  }
  return region;
}
function renderedTextNodes(root) {
  const textNodes = [];
  const collectTextNodes = (node) => {
    if (node.nodeType === 3) {
      if (node.textContent?.trim()) textNodes.push(node);
      return;
    }
    node.childNodes.forEach(collectTextNodes);
  };
  collectTextNodes(root);
  return textNodes;
}
function renderedTextLength(textNodes) {
  return textNodes.reduce((total, node) => total + (node.textContent?.length ?? 0), 0);
}
function animateRenderedTextTail(textNodes, charCount) {
  if (charCount <= 0) return;
  let remaining = charCount;
  for (let i = textNodes.length - 1; i >= 0 && remaining > 0; i--) {
    const node = textNodes[i];
    const text = node.textContent ?? "";
    const take = Math.min(remaining, text.length);
    const start = text.length - take;
    const before = text.slice(0, start);
    const animated = text.slice(start);
    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));
    const span = createElement("span", { class: "stream-chunk" });
    span.textContent = animated;
    fragment.appendChild(span);
    node.parentNode?.replaceChild(fragment, node);
    remaining -= take;
  }
}
function appendText(text) {
  if (!currentAssistantContent) return;
  rawTextBuffer += text;
  const textRegion = getOrCreateContentRegion("assistant-text-region", "end");
  if (!textRegion) return;
  textRegion.classList.add("is-streaming");
  textRegion.innerHTML = renderMarkdown(rawTextBuffer);
  const textNodes = renderedTextNodes(textRegion);
  const visibleTextLength = renderedTextLength(textNodes);
  animateRenderedTextTail(textNodes, visibleTextLength - renderedStreamTextLength);
  renderedStreamTextLength = visibleTextLength;
  scrollToBottom();
}
function appendThinking(text) {
  if (!currentAssistantContent) return;
  thinkingBuffer += text;
  const thinkingRegion = getOrCreateContentRegion("assistant-thinking-region", "start");
  if (!thinkingRegion) return;
  thinkingRegion.innerHTML = renderThinkingBlock(thinkingBuffer);
  scrollToBottom();
}
function scrollToBottom() {
  const list = $2("#message-list");
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}
function isMessageListNearBottom(threshold = 80) {
  const list = $2("#message-list");
  return list.scrollHeight - list.clientHeight - list.scrollTop <= threshold;
}
function keepToolResultInView(card, shouldFollow) {
  if (!shouldFollow) return;
  scrollToBottom();
  card.querySelectorAll("img.tool-result-image").forEach((img) => {
    img.addEventListener("load", scrollToBottom, { once: true });
    img.addEventListener("error", scrollToBottom, { once: true });
  });
  card.querySelectorAll("audio.tool-result-audio").forEach((audio) => {
    audio.addEventListener("loadedmetadata", scrollToBottom, { once: true });
    audio.addEventListener("loadeddata", scrollToBottom, { once: true });
  });
}
function unwrapStreamChunks(root) {
  root.querySelectorAll(".stream-chunk").forEach((el) => {
    el.replaceWith(document.createTextNode(el.textContent ?? ""));
  });
}
function finishStreaming() {
  if (lyricsWriteResolve && capturedLyricsText !== null) {
    lyricsWriteResolve(capturedLyricsText);
  }
  capturedLyricsText = null;
  currentAssistantContent?.querySelectorAll(".assistant-text-region.is-streaming").forEach((el) => {
    el.innerHTML = renderMarkdown(rawTextBuffer);
    el.classList.remove("is-streaming");
  });
  document.querySelectorAll(".assistant-text-region.is-streaming").forEach((el) => {
    unwrapStreamChunks(el);
    el.classList.remove("is-streaming");
  });
  document.querySelectorAll(".message--steer").forEach((el) => el.classList.remove("message--steer"));
  isStreaming = false;
  currentAssistantEl = null;
  currentAssistantContent = null;
  activeToolCards.clear();
  rawTextBuffer = "";
  renderedStreamTextLength = 0;
  thinkingBuffer = "";
  const shouldClearDraft = clearDraftAfterDone === "chat" || clearDraftAfterDone === "create" && streamHadToolResult;
  if (clearDraftAfterDone && shouldClearDraft && !streamHadError)
    void clearDraft(clearDraftAfterDone);
  if (!streamHadError) refreshSessionsAfterDone?.();
  if (streamHadToolResult) void updateQuotaBadge();
  clearDraftAfterDone = null;
  streamHadError = false;
  streamHadToolResult = false;
  setStreamingUI(false);
}
function setLyricsWriteResolve(fn) {
  lyricsWriteResolve = fn;
}
function setStreamingUI(streaming) {
  const input = $2("#chat-input");
  const sendBtn = $2("#send-button");
  const typingIndicator = $2("#typing-indicator");
  const steerHint = $2("#steer-hint");
  if (streaming) {
    input.disabled = false;
    input.placeholder = "\u{1F4A1} Type to steer the response...";
    sendBtn.disabled = true;
    typingIndicator.classList.add("is-visible");
    typingIndicator.setAttribute("aria-hidden", "false");
    steerHint.hidden = true;
  } else {
    input.disabled = false;
    input.placeholder = "Type a message...";
    sendBtn.disabled = true;
    typingIndicator.classList.remove("is-visible");
    typingIndicator.setAttribute("aria-hidden", "true");
    steerHint.hidden = true;
    input.focus();
  }
}
async function sendMessage(content, draftKind = "chat") {
  if (!content.trim()) return;
  if (isStreaming) {
    await sendSteerMessage(content);
    return;
  }
  const messageList = $2("#message-list");
  const userMsg = renderUserMessage(content);
  messageList.appendChild(userMsg);
  scrollToBottom();
  const { container: assistantEl, contentEl: assistantContent } = renderAssistantMessage();
  messageList.appendChild(assistantEl);
  currentAssistantEl = assistantEl;
  currentAssistantContent = assistantContent;
  const input = $2("#chat-input");
  input.value = "";
  autoResizeInput();
  clearDraftAfterDone = draftKind;
  isStreaming = true;
  setStreamingUI(true);
  try {
    await streamChat([{ role: "user", content }]);
  } catch (err) {
    streamHadError = true;
    showError("Connection lost. Check your internet? \u{1F4E1}");
    finishStreaming();
  }
}
async function sendCreateTool(toolName, input, visibleLabel, clearDraftOnSuccess = true) {
  if (isStreaming) return;
  const messageList = $2("#message-list");
  messageList.appendChild(renderUserMessage(visibleLabel));
  scrollToBottom();
  const { container: assistantEl, contentEl: assistantContent } = renderAssistantMessage();
  messageList.appendChild(assistantEl);
  currentAssistantEl = assistantEl;
  currentAssistantContent = assistantContent;
  clearDraftAfterDone = clearDraftOnSuccess ? "create" : null;
  isStreaming = true;
  setStreamingUI(true);
  try {
    await streamCreateTool(toolName, input);
  } catch {
    streamHadError = true;
    showError("Connection lost. Check your internet? \u{1F4E1}");
    finishStreaming();
  }
}
async function sendSteerMessage(content) {
  if (!content.trim() || !isStreaming) return;
  const messageList = $2("#message-list");
  const steerMsg = renderSteerMessage(content);
  messageList.appendChild(steerMsg);
  scrollToBottom();
  const input = $2("#chat-input");
  input.value = "";
  autoResizeInput();
  try {
    await sendSteer(content);
  } catch {
    showError("Couldn't steer \u2014 try again \u{1F4AB}");
  }
}
function parseHistoryToolCalls(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (call) => typeof call.id === "string" && typeof call.name === "string"
    );
  } catch {
    return [];
  }
}
function inferHistoryToolResult(toolName, content) {
  if (content.startsWith("Error: ")) return { type: "error", content: content.slice(7) };
  if (toolName === "generate_image" && /^(?:\/asset\/|https?:\/\/|data:image\/)/i.test(content)) {
    return { type: "image", content };
  }
  if ((toolName === "text_to_speech" || toolName === "generate_music") && /^(?:\/asset\/|https?:\/\/|data:audio\/)/i.test(content)) {
    return { type: "audio", content };
  }
  return { type: "text", content };
}
function renderHistoryAssistantMessage(msg, toolRows) {
  const { container, contentEl } = renderAssistantMessage();
  if (msg.thinking?.trim()) {
    const thinkingRegion = createElement("div", { class: "assistant-thinking-region" });
    thinkingRegion.innerHTML = renderThinkingBlock(msg.thinking);
    contentEl.appendChild(thinkingRegion);
  }
  if (msg.content.trim()) {
    const textRegion = createElement("div", { class: "assistant-text-region" });
    textRegion.innerHTML = renderMarkdown(msg.content);
    contentEl.appendChild(textRegion);
  }
  for (const call of parseHistoryToolCalls(msg.tool_calls_json)) {
    const toolRow = toolRows.get(call.id);
    if (!toolRow) continue;
    contentEl.appendChild(
      renderToolResult(call.name, inferHistoryToolResult(call.name, toolRow.content))
    );
  }
  return container;
}
async function loadHistory() {
  const messageList = $2("#message-list");
  try {
    const messages = await fetchHistory();
    if (messages.length > 0) {
      const welcome = messageList.querySelector(".message--welcome");
      if (welcome) welcome.remove();
    }
    const toolRows = /* @__PURE__ */ new Map();
    for (const msg of messages) {
      if (msg.role === "tool" && msg.tool_call_id) toolRows.set(msg.tool_call_id, msg);
    }
    for (const msg of messages) {
      if (msg.role === "user") {
        messageList.appendChild(renderUserMessage(msg.content));
      } else if (msg.role === "assistant") {
        messageList.appendChild(renderHistoryAssistantMessage(msg, toolRows));
      }
    }
    scrollToBottom();
  } catch {
  }
}
function autoResizeInput() {
  const input = $2("#chat-input");
  const maxHeight = 120;
  input.style.height = "auto";
  const clamped = input.scrollHeight > maxHeight;
  input.style.height = Math.min(input.scrollHeight, maxHeight) + "px";
  input.classList.toggle("is-overflowing", clamped);
  input.setAttribute("aria-multiline", "true");
}
function handleInputChange() {
  const input = $2("#chat-input");
  const sendBtn = $2("#send-button");
  sendBtn.disabled = !input.value.trim();
  autoResizeInput();
}
function debounce(fn, ms) {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
var IMAGE_SIZE_PRESETS = {
  small: 1024,
  medium: 1536,
  large: 2048
};
function multipleOf8(value) {
  return Math.max(512, Math.min(2048, Math.round(value / 8) * 8));
}
function imageDimensionsForPreset(aspectRatio, preset) {
  const longEdge = IMAGE_SIZE_PRESETS[preset];
  if (!longEdge) return null;
  const match = aspectRatio.match(/^(\d+):(\d+)$/);
  if (!match) throw new Error(`Bad aspect ratio: ${aspectRatio}`);
  const ratioWidth = Number(match[1]);
  const ratioHeight = Number(match[2]);
  if (ratioWidth >= ratioHeight) {
    return { width: longEdge, height: multipleOf8(longEdge * ratioHeight / ratioWidth) };
  }
  return { width: multipleOf8(longEdge * ratioWidth / ratioHeight), height: longEdge };
}
function imageSurpriseCode(random = Math.random) {
  return String(Math.floor(random() * 2147483647) + 1);
}
function sizePresetFromDimensions(width, height) {
  const longEdge = Math.max(Number(width), Number(height));
  const match = Object.entries(IMAGE_SIZE_PRESETS).find(([, value]) => value === longEdge);
  return match?.[0] ?? "";
}
function clearChatUi() {
  const list = $2("#message-list");
  list.innerHTML = `
        <div class="message message--assistant message--welcome">
            <div class="message-avatar" aria-hidden="true">\u{1F9DE}</div>
            <div class="message-bubble"><div class="message-content">Hey! \u{1F44B} I'm HallucyGenie. Ask me anything \u2014 I can chat, make images \u{1F525}, do voices \u{1F399}\uFE0F, and create music \u{1F3B5}</div></div>
        </div>`;
}
function defaultCreateDraft() {
  return {
    selectedTab: "image",
    image: {
      prompt: "",
      aspect_ratio: "16:9",
      n: "",
      seed: "",
      width: "",
      height: "",
      prompt_optimizer: false
    },
    music: {
      prompt: "",
      lyrics: "",
      cover_source_kind: "direct",
      cover_audio_url: "",
      cover_style: "",
      cover_feature_id: "",
      cover_lyrics: ""
    },
    voice: {
      text: "",
      speed: "1.0",
      voice_id: "English_expressive_narrator",
      volume: "",
      pitch: ""
    },
    analyze: { image_url: "", prompt: "What do you see?" },
    search: { query: "" }
  };
}
function createDraftFromDom() {
  return {
    selectedTab: $2("#create-modal").dataset.tabOpen || "image",
    image: {
      prompt: $2("#img-prompt").value,
      aspect_ratio: $2("#img-ratio").value,
      n: $2("#img-count").value,
      seed: $2("#img-seed").value,
      width: $2("#img-width").value,
      height: $2("#img-height").value,
      prompt_optimizer: $2("#img-prompt-optimizer").checked
    },
    music: {
      prompt: $2("#music-prompt").value,
      lyrics: $2("#music-lyrics").value,
      cover_source_kind: $2("#cover-source-kind").value,
      cover_audio_url: $2("#cover-audio-url").value,
      cover_style: $2("#cover-style").value,
      cover_feature_id: $2("#cover-feature-id").value,
      cover_lyrics: $2("#cover-lyrics").value
    },
    voice: {
      text: $2("#voice-text").value,
      speed: $2("#voice-speed").value,
      voice_id: document.querySelector("#voice-id")?.value ?? "English_expressive_narrator",
      volume: document.querySelector("#voice-volume")?.value ?? "",
      pitch: document.querySelector("#voice-pitch")?.value ?? ""
    },
    analyze: {
      image_url: $2("#analyze-url").value,
      prompt: $2("#analyze-prompt").value
    },
    search: { query: $2("#search-query").value }
  };
}
function applyCreateDraft(draft) {
  $2("#img-prompt").value = draft.image.prompt;
  $2("#img-ratio").value = draft.image.aspect_ratio;
  $2("#img-count").value = draft.image.n ?? "";
  $2("#img-seed").value = draft.image.seed ?? "";
  $2("#img-width").value = draft.image.width ?? "";
  $2("#img-height").value = draft.image.height ?? "";
  const imageSize = document.querySelector("#img-size");
  if (imageSize)
    imageSize.value = sizePresetFromDimensions(draft.image.width, draft.image.height);
  const imageSeedStatus = document.querySelector("#img-seed-status");
  if (imageSeedStatus) {
    imageSeedStatus.textContent = draft.image.seed ? `Surprise code: ${draft.image.seed}` : "Optional: same code can make a similar picture again.";
  }
  $2("#img-prompt-optimizer").checked = Boolean(
    draft.image.prompt_optimizer
  );
  $2("#music-prompt").value = draft.music.prompt;
  $2("#music-lyrics").value = draft.music.lyrics;
  $2("#cover-source-kind").value = draft.music.cover_source_kind ?? "direct";
  $2("#cover-audio-url").value = draft.music.cover_audio_url ?? "";
  $2("#cover-style").value = draft.music.cover_style ?? "";
  $2("#cover-feature-id").value = draft.music.cover_feature_id ?? "";
  $2("#cover-lyrics").value = draft.music.cover_lyrics ?? "";
  $2("#voice-text").value = draft.voice.text;
  $2("#voice-speed").value = draft.voice.speed;
  const voiceId = document.querySelector("#voice-id");
  const voiceVolume = document.querySelector("#voice-volume");
  const voicePitch = document.querySelector("#voice-pitch");
  if (voiceId) voiceId.value = draft.voice.voice_id ?? "English_expressive_narrator";
  if (voiceVolume) voiceVolume.value = draft.voice.volume || "1";
  if (voicePitch) voicePitch.value = draft.voice.pitch || "0";
  $2("#analyze-url").value = draft.analyze?.image_url ?? "";
  $2("#analyze-prompt").value = draft.analyze?.prompt ?? "What do you see?";
  $2("#search-query").value = draft.search.query;
}
function isCreateDraft(value) {
  return Boolean(
    value && typeof value === "object" && "image" in value && "selectedTab" in value
  );
}
var QUOTA_LABELS = {
  chat: "Chat",
  speech: "Voice",
  image: "Images",
  music: "Music",
  lyrics: "Lyrics"
};
async function updateQuotaBadge() {
  const badge = $2("#quota-badge");
  if (!badge) return;
  const labels = [];
  try {
    const resp = await fetch("/api/quota");
    if (!resp.ok) {
      badge.setAttribute("aria-label", "Quota unavailable");
      return;
    }
    const data = await resp.json();
    const items = badge.querySelectorAll(".quota-item[data-type]");
    for (const item of items) {
      const type = item.dataset.type;
      const q2 = data[type];
      const label = item.title || QUOTA_LABELS[type] || type;
      if (!q2 || q2.total === 0) {
        item.querySelector(".quota-used").textContent = "\u2014";
        item.className = "quota-item";
        labels.push(`${label} quota unavailable`);
        continue;
      }
      const remaining = q2.total - q2.used;
      const pct = q2.used / q2.total;
      const state = pct >= 0.95 ? "critical" : pct >= 0.8 ? "warning" : "ok";
      item.querySelector(".quota-used").textContent = `${remaining}`;
      item.className = pct >= 0.95 ? "quota-item critical" : pct >= 0.8 ? "quota-item warn" : "quota-item";
      labels.push(`${label}: ${remaining} of ${q2.total} remaining, ${state}`);
    }
    badge.setAttribute("aria-label", labels.join(". "));
  } catch {
    badge.setAttribute("aria-label", "Quota unavailable");
  }
}
function init() {
  const form = $2("#chat-form");
  const input = $2("#chat-input");
  const sendBtn = $2("#send-button");
  const lightbox = $2("#lightbox");
  const lightboxClose = lightbox.querySelector(".lightbox-close");
  const lightboxBackdrop = lightbox.querySelector(".lightbox-backdrop");
  const steerClose = $2("#steer-close");
  const connectionStatus = $2("#connection-status");
  const sessionSelect = document.querySelector("#session-select");
  const sessionNew = document.querySelector("#session-new");
  async function refreshSessions() {
    const data = await fetchSessions();
    if (!sessionSelect) return;
    sessionSelect.innerHTML = "";
    for (const session of data.sessions) {
      const option = document.createElement("option");
      option.value = session.id;
      option.textContent = session.name;
      option.selected = session.id === data.activeSessionId;
      sessionSelect.appendChild(option);
    }
  }
  async function reloadActiveSessionUi() {
    clearChatUi();
    await loadHistory();
    await restoreDrafts();
    loadAssets();
    await loadCurrentRecent();
  }
  async function switchSession(id) {
    if (isStreaming && !confirm("A response is still running. Switch chats anyway?")) return;
    await activateSession(id);
    await refreshSessions();
    await reloadActiveSessionUi();
  }
  refreshSessionsAfterDone = () => void refreshSessions().catch(() => void 0);
  sessionSelect?.addEventListener("change", () => {
    void switchSession(sessionSelect.value).catch(() => showError("Failed to switch chat \u{1F615}"));
  });
  sessionNew?.addEventListener("click", () => {
    if (isStreaming && !confirm("A response is still running. Start a new chat anyway?"))
      return;
    void createNewSession().then(refreshSessions).then(reloadActiveSessionUi).catch(() => showError("Failed to create chat \u{1F615}"));
  });
  connectionStatus.setAttribute(
    "aria-label",
    `Connection status: ${connectionStatus.title || "Connected"}`
  );
  const profileBtn = $2("#profile-btn");
  const profileModal = $2("#profile-modal");
  const profileClose = $2("#profile-close");
  const profileBackdrop = profileModal.querySelector(".profile-backdrop");
  const profileForm = $2("#profile-form");
  const profileReset = $2("#profile-reset");
  const profileUsername = $2("#profile-username");
  const profileInterests = $2("#profile-interests");
  const profileHates = $2("#profile-hates");
  const profileFavorites = $2("#profile-favorites");
  const profileAvatarAsset = $2("#profile-avatar-asset");
  const profileAvatarUpload = $2("#profile-avatar-upload");
  const profileAvatarPreview = $2("#profile-avatar-preview");
  const profileAvatarImg = $2("#profile-avatar-img");
  const profileAvatarFallback = $2("#profile-avatar-fallback");
  const profileAvatarStatus = $2("#profile-avatar-status");
  const profileGenerate = $2("#profile-generate");
  let profileModalReturnFocus = null;
  function setProfileAvatarPending(pending) {
    profileAvatarPreview.classList.toggle("is-pending", pending);
    profileAvatarPreview.setAttribute("aria-busy", pending ? "true" : "false");
    profileAvatarPreview.setAttribute(
      "aria-label",
      pending ? "Generating avatar. Please wait." : "Current avatar. Click to upload image"
    );
    profileAvatarStatus.textContent = pending ? "Generating avatar." : "Avatar ready.";
  }
  function updateProfileAvatarPreview(profile) {
    if (profile.avatar.value) {
      profileAvatarImg.src = `/asset/${profile.avatar.value}`;
      profileAvatarImg.hidden = false;
      profileAvatarFallback.hidden = true;
      return;
    }
    profileAvatarImg.hidden = true;
    profileAvatarImg.removeAttribute("src");
    profileAvatarFallback.hidden = false;
    profileAvatarFallback.textContent = DEFAULT_USER_AVATAR;
  }
  function profileFromCurrentForm() {
    return normalizedProfileFromForm({
      username: profileUsername.value,
      interests: profileInterests.value,
      hates: profileHates.value,
      favorites: profileFavorites.value,
      avatarAsset: profileAvatarAsset.value
    });
  }
  function fillProfileForm(profile) {
    profileUsername.value = profile.username;
    profileInterests.value = profile.interests;
    profileHates.value = profile.hates;
    profileFavorites.value = profile.favorites;
    profileAvatarAsset.value = profile.avatar.value;
    updateProfileAvatarPreview(profile);
  }
  async function loadProfileIntoForm() {
    const profile = await fetchProfile();
    setCurrentProfile(profile);
    fillProfileForm(profile);
  }
  function getProfileModalFocusable() {
    return Array.from(
      profileModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));
  }
  function openProfileModal() {
    profileModalReturnFocus = document.activeElement;
    profileModal.hidden = false;
    profileClose.focus();
    void loadProfileIntoForm().catch(() => showError("Failed to load profile \u{1F615}"));
  }
  function closeProfileModal() {
    profileModal.hidden = true;
    profileModalReturnFocus?.focus();
    profileModalReturnFocus = null;
  }
  function trapProfileModalFocus(e) {
    if (e.key !== "Tab" || profileModal.hidden) return;
    const focusable = getProfileModalFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  profileBtn.addEventListener("click", openProfileModal);
  profileClose.addEventListener("click", closeProfileModal);
  profileBackdrop.addEventListener("click", closeProfileModal);
  profileModal.addEventListener("keydown", trapProfileModalFocus);
  profileAvatarPreview.addEventListener("click", () => profileAvatarUpload.click());
  profileAvatarUpload.addEventListener("change", () => {
    const file = profileAvatarUpload.files?.[0];
    if (!file) return;
    let profile;
    try {
      profile = profileFromCurrentForm();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Invalid profile");
      return;
    }
    profileAvatarUpload.disabled = true;
    setProfileAvatarPending(true);
    void uploadProfileAvatar(file, profile).then((saved) => {
      setCurrentProfile(saved);
      fillProfileForm(saved);
    }).catch(() => showError("Failed to upload avatar \u{1F615}")).finally(() => {
      profileAvatarUpload.disabled = false;
      profileAvatarUpload.value = "";
      setProfileAvatarPending(false);
    });
  });
  profileGenerate.addEventListener("click", () => {
    let profile;
    try {
      profile = profileFromCurrentForm();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Invalid profile");
      return;
    }
    profileGenerate.disabled = true;
    profileGenerate.textContent = "Generating... \u2728";
    setProfileAvatarPending(true);
    void generateProfileAvatar(profile).then((saved) => {
      setCurrentProfile(saved);
      fillProfileForm(saved);
    }).catch(() => showError("Failed to generate avatar \u{1F615}")).finally(() => {
      profileGenerate.disabled = false;
      profileGenerate.textContent = "Generate avatar \u{1F3A8}";
      setProfileAvatarPending(false);
    });
  });
  profileForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let profile;
    try {
      profile = profileFromCurrentForm();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Invalid profile");
      return;
    }
    void putProfile(profile).then((saved) => {
      setCurrentProfile(saved);
      fillProfileForm(saved);
      closeProfileModal();
    }).catch(() => showError("Failed to save profile \u{1F615}"));
  });
  profileReset.addEventListener("click", () => {
    void deleteProfile().then((profile) => {
      setCurrentProfile(profile);
      fillProfileForm(profile);
      closeProfileModal();
    }).catch(() => showError("Failed to reset profile \u{1F615}"));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value.trim()) {
      sendMessage(input.value);
    }
  });
  input.addEventListener("input", handleInputChange);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) {
        sendMessage(input.value);
      }
    }
  });
  lightboxClose.addEventListener("click", closeLightbox);
  lightboxBackdrop.addEventListener("click", closeLightbox);
  lightbox.addEventListener("keydown", (e) => trapFocus(lightbox, e));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeLightbox();
      if (!profileModal.hidden) closeProfileModal();
      if (!createModal.hidden) closeCreateModal();
    }
  });
  steerClose.addEventListener("click", () => {
    $2("#steer-hint").hidden = true;
  });
  const ONBOARDING_KEY = "hg_onboarding_done";
  const onboarding = $2("#onboarding");
  const slides = onboarding.querySelectorAll(".onboarding-slide");
  const dots = onboarding.querySelectorAll(".onboarding-dots .dot");
  let currentSlide = 0;
  function showSlide(idx) {
    slides.forEach((s, i) => {
      s.classList.toggle("active", i === idx);
    });
    dots.forEach((d2, i) => {
      d2.classList.toggle("active", i === idx);
    });
    currentSlide = idx;
  }
  function getOnboardingFocusable() {
    return focusableIn(onboarding);
  }
  function focusCurrentOnboardingButton() {
    slides[currentSlide]?.querySelector("button")?.focus();
  }
  function trapOnboardingFocus(e) {
    trapFocus(onboarding, e);
  }
  function dismissOnboarding() {
    onboarding.hidden = true;
    localStorage.setItem(ONBOARDING_KEY, "1");
    input.focus();
  }
  onboarding.addEventListener("keydown", trapOnboardingFocus);
  if (!localStorage.getItem(ONBOARDING_KEY)) {
    onboarding.hidden = false;
    showSlide(0);
    requestAnimationFrame(focusCurrentOnboardingButton);
  }
  onboarding.querySelectorAll(".onboarding-next").forEach((btn) => {
    btn.addEventListener("click", () => {
      showSlide(currentSlide + 1);
      focusCurrentOnboardingButton();
    });
  });
  $2("#onboarding-try-chat").addEventListener("click", () => {
    dismissOnboarding();
    const input2 = $2("#chat-input");
    input2.value = "What are the top 3 gaming tips for a beginner?";
    input2.dispatchEvent(new Event("input"));
    input2.focus();
  });
  $2("#onboarding-try-create").addEventListener("click", () => {
    dismissOnboarding();
    openCreateModal();
  });
  $2("#onboarding-done").addEventListener("click", dismissOnboarding);
  void fetchProfile().then(setCurrentProfile).catch(() => void 0).finally(() => void loadHistory());
  updateQuotaBadge();
  const createBtn = $2("#create-btn");
  const createModal = $2("#create-modal");
  const createClose = $2("#create-close");
  const createBackdrop = createModal.querySelector(".create-backdrop");
  let createModalReturnFocus = null;
  function getCreateModalFocusable() {
    return Array.from(
      createModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && !el.closest("[hidden]"));
  }
  function openCreateModal() {
    createModalReturnFocus = document.activeElement;
    createModal.hidden = false;
    createClose.focus();
  }
  function closeCreateModal() {
    void putDraft("create", createDraftFromDom());
    createModal.hidden = true;
    createModalReturnFocus?.focus();
    createModalReturnFocus = null;
  }
  function trapCreateModalFocus(e) {
    if (e.key !== "Tab" || createModal.hidden) return;
    const focusable = getCreateModalFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  createBtn.addEventListener("click", openCreateModal);
  createClose.addEventListener("click", closeCreateModal);
  createBackdrop.addEventListener("click", closeCreateModal);
  createModal.addEventListener("keydown", trapCreateModalFocus);
  const tabs = createModal.querySelectorAll(".create-tab");
  const panels = createModal.querySelectorAll(".create-panel");
  function setCreateTab(tabName) {
    tabs.forEach((t) => {
      const selected = t.dataset.tab === tabName;
      t.classList.toggle("active", selected);
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((p) => {
      p.hidden = p.dataset.panel !== tabName;
    });
    createModal.dataset.tabOpen = tabName;
    if (tabName === "assets") loadAssets();
    void loadCurrentRecent();
  }
  function moveCreateTab(from, delta) {
    const index = Array.from(tabs).indexOf(from);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    next?.focus();
    setCreateTab(next?.dataset.tab ?? "image");
    void putDraft("create", createDraftFromDom());
  }
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setCreateTab(tab.dataset.tab ?? "image");
      void putDraft("create", createDraftFromDom());
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveCreateTab(tab, 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveCreateTab(tab, -1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        tabs[0]?.focus();
        setCreateTab(tabs[0]?.dataset.tab ?? "image");
        void putDraft("create", createDraftFromDom());
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        tabs[tabs.length - 1]?.focus();
        setCreateTab(tabs[tabs.length - 1]?.dataset.tab ?? "image");
        void putDraft("create", createDraftFromDom());
      }
    });
  });
  const createImgForm = $2("#create-image-form");
  const createMusicForm = $2("#create-music-form");
  const createVoiceForm = $2("#create-voice-form");
  const createAnalyzeForm = $2("#create-analyze-form");
  const createSearchForm = $2("#create-search-form");
  const imgPromptInput = $2("#img-prompt");
  const imgRatioInput = $2("#img-ratio");
  const imgCountInput = $2("#img-count");
  const imgSizeInput = $2("#img-size");
  const imgSeedInput = $2("#img-seed");
  const imgSeedRandom = $2("#img-seed-random");
  const imgSeedStatus = $2("#img-seed-status");
  const imgWidthInput = $2("#img-width");
  const imgHeightInput = $2("#img-height");
  const imgPromptOptimizerInput = $2("#img-prompt-optimizer");
  const musicPromptInput = $2("#music-prompt");
  const musicLyricsInput = $2("#music-lyrics");
  const coverSourceKind = $2("#cover-source-kind");
  const coverAudioUrl = $2("#cover-audio-url");
  const coverAudioFile = $2("#cover-audio-file");
  const coverStyle = $2("#cover-style");
  const coverPreprocess = $2("#cover-preprocess");
  const coverFeatureId = $2("#cover-feature-id");
  const coverStatus = $2("#cover-status");
  const coverLyrics = $2("#cover-lyrics");
  const coverGenerate = $2("#cover-generate");
  const voiceTextInput = $2("#voice-text");
  const voiceSpeedInput = $2("#voice-speed");
  const voiceIdInput = document.querySelector("#voice-id");
  const voiceVolumeInput = document.querySelector("#voice-volume");
  const voicePitchInput = document.querySelector("#voice-pitch");
  const analyzeFileInput = document.querySelector("#analyze-file");
  const analyzeDropzone = document.querySelector("#analyze-dropzone");
  const analyzeFileStatus = document.querySelector("#analyze-file-status");
  const analyzeFilePreview = document.querySelector("#analyze-file-preview");
  const analyzeUrlInput = $2("#analyze-url");
  const analyzePromptInput = $2("#analyze-prompt");
  const searchQueryInput = $2("#search-query");
  let analyzeAssetUrl = "";
  const persistCreateDraft = debounce(() => void putDraft("create", createDraftFromDom()), 200);
  const persistChatDraft = debounce(() => void putDraft("chat", { text: input.value }), 200);
  void fetch("/api/music-cover/status").then((resp) => resp.json()).then((data) => {
    const youtube = coverSourceKind.querySelector(
      'option[value="youtube"]'
    );
    if (youtube && !data.youtubeEnabled) {
      youtube.disabled = true;
      youtube.textContent = "YouTube link (extractor off)";
    }
  }).catch(() => void 0);
  function fillFormFromHistory(item) {
    const inputData = item.input;
    if (item.kind === "image") {
      imgPromptInput.value = String(inputData.prompt ?? "");
      imgRatioInput.value = String(inputData.aspect_ratio ?? "16:9");
      imgCountInput.value = String(inputData.n ?? "");
      imgSeedInput.value = String(inputData.seed ?? "");
      imgWidthInput.value = String(inputData.width ?? "");
      imgHeightInput.value = String(inputData.height ?? "");
      imgSizeInput.value = sizePresetFromDimensions(
        imgWidthInput.value,
        imgHeightInput.value
      );
      imgSeedStatus.textContent = imgSeedInput.value ? `Surprise code: ${imgSeedInput.value}` : "Optional: same code can make a similar picture again.";
      imgPromptOptimizerInput.checked = inputData.prompt_optimizer === true;
      setCreateTab("image");
    } else if (item.kind === "music") {
      musicPromptInput.value = String(inputData.prompt ?? "");
      musicLyricsInput.value = String(inputData.lyrics ?? "");
      setCreateTab("music");
    } else if (item.kind === "voice") {
      voiceTextInput.value = String(inputData.text ?? "");
      voiceSpeedInput.value = String(inputData.speed ?? "1.0");
      if (voiceIdInput)
        voiceIdInput.value = String(inputData.voice_id ?? "English_expressive_narrator");
      if (voiceVolumeInput) voiceVolumeInput.value = String(inputData.volume ?? "");
      if (voicePitchInput) voicePitchInput.value = String(inputData.pitch ?? "");
      setCreateTab("voice");
    } else if (item.kind === "analyze") {
      analyzeUrlInput.value = String(inputData.image_url ?? "");
      analyzePromptInput.value = String(inputData.prompt ?? "What do you see?");
      setCreateTab("analyze");
    } else if (item.kind === "search") {
      searchQueryInput.value = String(inputData.query ?? inputData.prompt ?? "");
      setCreateTab("search");
    }
    void putDraft("create", createDraftFromDom());
  }
  async function loadRecent(kind) {
    const container = createModal.querySelector(
      `.create-recent[data-kind="${kind}"]`
    );
    if (!container) return;
    const items = await fetchCreateHistory(kind);
    container.innerHTML = "";
    if (items.length === 0) return;
    const label = document.createElement("span");
    label.className = "recent-label";
    label.textContent = "Recent \u25BE";
    container.appendChild(label);
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-button";
      button.textContent = String(
        item.input.prompt ?? item.input.text ?? item.input.query ?? item.tool_name
      ).slice(0, 24);
      button.addEventListener("click", () => fillFormFromHistory(item));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "recent-remove";
      remove.setAttribute("aria-label", "Remove recent item");
      remove.textContent = "\xD7";
      remove.addEventListener("click", () => {
        void deleteCreateHistoryItem(item.id).then(() => loadRecent(kind));
      });
      container.appendChild(button);
      container.appendChild(remove);
    }
  }
  async function loadCurrentRecent() {
    const kind = createModal.dataset.tabOpen || "image";
    if (kind === "assets") return;
    await loadRecent(kind);
  }
  function rejectBadAnalyzeFile(file) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return "Use a PNG, JPG, or WebP image.";
    }
    if (file.size > 20 * 1024 * 1024) return "Image is too big. Max is 20 MB.";
    return null;
  }
  async function selectAnalyzeFile(file) {
    if (!analyzeFileInput || !analyzeDropzone || !analyzeFileStatus || !analyzeFilePreview)
      return;
    const error = rejectBadAnalyzeFile(file);
    if (error) {
      showError(error);
      analyzeFileStatus.textContent = error;
      analyzeFileInput.value = "";
      return;
    }
    analyzeFileInput.disabled = true;
    analyzeDropzone.disabled = true;
    analyzeFileStatus.textContent = `Uploading ${file.name}...`;
    try {
      const uploaded = await uploadAnalyzeImage(file);
      analyzeAssetUrl = uploaded.assetUrl;
      analyzeFileStatus.textContent = `Selected ${file.name}`;
      analyzeFilePreview.innerHTML = "";
      const preview = document.createElement("img");
      preview.src = uploaded.assetUrl;
      preview.alt = `Selected image: ${file.name}`;
      analyzeFilePreview.appendChild(preview);
      analyzeFilePreview.hidden = false;
    } catch {
      analyzeAssetUrl = "";
      analyzeFilePreview.hidden = true;
      analyzeFilePreview.innerHTML = "";
      analyzeFileStatus.textContent = "Upload failed.";
      showError("Failed to upload image \u{1F615}");
    } finally {
      analyzeFileInput.disabled = false;
      analyzeDropzone.disabled = false;
      analyzeFileInput.value = "";
    }
  }
  function applyImageSizePreset() {
    const dimensions = imageDimensionsForPreset(imgRatioInput.value, imgSizeInput.value);
    imgWidthInput.value = dimensions ? String(dimensions.width) : "";
    imgHeightInput.value = dimensions ? String(dimensions.height) : "";
  }
  function rollImageSeed() {
    imgSeedInput.value = imageSurpriseCode();
    imgSeedStatus.textContent = `Surprise code: ${imgSeedInput.value}`;
    void putDraft("create", createDraftFromDom());
  }
  async function restoreDrafts() {
    const chatDraft = await getDraft("chat");
    if (chatDraft && typeof chatDraft === "object" && "text" in chatDraft) {
      input.value = String(chatDraft.text ?? "");
      handleInputChange();
    }
    const createDraft = await getDraft("create");
    if (isCreateDraft(createDraft)) {
      applyCreateDraft(createDraft);
      setCreateTab(createDraft.selectedTab || "image");
    } else {
      applyCreateDraft(defaultCreateDraft());
      setCreateTab("image");
    }
  }
  imgRatioInput.addEventListener("change", () => {
    applyImageSizePreset();
    persistCreateDraft();
  });
  imgSizeInput.addEventListener("change", () => {
    applyImageSizePreset();
    persistCreateDraft();
  });
  imgSeedRandom.addEventListener("click", rollImageSeed);
  [
    imgPromptInput,
    imgCountInput,
    imgSizeInput,
    imgSeedInput,
    imgWidthInput,
    imgHeightInput,
    imgPromptOptimizerInput,
    musicPromptInput,
    musicLyricsInput,
    voiceTextInput,
    voiceSpeedInput,
    voiceIdInput,
    voiceVolumeInput,
    voicePitchInput,
    analyzeUrlInput,
    analyzePromptInput,
    searchQueryInput
  ].filter(
    (el) => Boolean(el)
  ).forEach((el) => {
    el.addEventListener("input", persistCreateDraft);
    el.addEventListener("change", persistCreateDraft);
  });
  input.addEventListener("input", persistChatDraft);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void putDraft("chat", { text: input.value });
      void putDraft("create", createDraftFromDom());
    }
  });
  window.addEventListener("pagehide", () => {
    void putDraft("chat", { text: input.value });
    void putDraft("create", createDraftFromDom());
  });
  void refreshSessions().catch(() => void 0);
  void restoreDrafts().catch(() => void 0);
  if (analyzeDropzone && analyzeFileInput && analyzeFileStatus && analyzeFilePreview) {
    analyzeDropzone.addEventListener("click", () => analyzeFileInput.click());
    analyzeFileInput.addEventListener("change", () => {
      const file = analyzeFileInput.files?.[0];
      if (file) void selectAnalyzeFile(file);
    });
    analyzeDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      analyzeDropzone.classList.add("is-dragging");
    });
    analyzeDropzone.addEventListener("dragleave", () => {
      analyzeDropzone.classList.remove("is-dragging");
    });
    analyzeDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      analyzeDropzone.classList.remove("is-dragging");
      const file = e.dataTransfer?.files?.[0];
      if (file) void selectAnalyzeFile(file);
    });
    analyzeUrlInput.addEventListener("input", () => {
      if (!analyzeUrlInput.value.trim()) return;
      analyzeAssetUrl = "";
      analyzeFilePreview.hidden = true;
      analyzeFilePreview.innerHTML = "";
      analyzeFileStatus.textContent = "Using image URL fallback.";
    });
  }
  createImgForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const prompt = imgPromptInput.value.trim();
    const input2 = {
      prompt,
      aspect_ratio: imgRatioInput.value,
      prompt_optimizer: imgPromptOptimizerInput.checked
    };
    if (imgCountInput.value.trim()) input2.n = Number(imgCountInput.value.trim());
    if (imgSeedInput.value.trim()) input2.seed = Number(imgSeedInput.value.trim());
    if (imgWidthInput.value.trim() && imgHeightInput.value.trim()) {
      input2.width = Number(imgWidthInput.value.trim());
      input2.height = Number(imgHeightInput.value.trim());
    }
    if (prompt) {
      closeCreateModal();
      void sendCreateTool("generate_image", input2, `Create image: ${prompt}`);
    }
  });
  createMusicForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const prompt = musicPromptInput.value.trim();
    const lyrics = musicLyricsInput.value.trim();
    if (prompt) {
      closeCreateModal();
      void sendCreateTool("generate_music", { prompt, lyrics }, `Create music: ${prompt}`);
    }
  });
  const writeLyricsBtn = document.querySelector("#write-lyrics-btn");
  writeLyricsBtn?.addEventListener("click", () => {
    const prompt = musicPromptInput.value.trim();
    if (!prompt) {
      showError("Describe the music first so I can write matching lyrics! \u270D\uFE0F");
      musicPromptInput.focus();
      return;
    }
    writeLyricsBtn.disabled = true;
    writeLyricsBtn.textContent = "Writing... \u2728";
    setLyricsWriteResolve((lyricsText) => {
      musicLyricsInput.value = lyricsText;
      void putDraft("create", createDraftFromDom());
    });
    sendCreateTool("generate_lyrics", { prompt }, `Write lyrics: ${prompt}`, false).finally(
      () => {
        writeLyricsBtn.disabled = false;
        writeLyricsBtn.textContent = "Write lyrics for me \u2728";
        setLyricsWriteResolve(null);
      }
    );
  });
  coverPreprocess.addEventListener("click", async () => {
    const form2 = new FormData();
    form2.set("source_kind", coverSourceKind.value);
    if (coverSourceKind.value === "upload") {
      const file = coverAudioFile.files?.[0];
      if (!file) {
        showError("Choose an audio file first \u{1F3B5}");
        coverAudioFile.focus();
        return;
      }
      form2.set("audio", file);
    } else {
      const url = coverAudioUrl.value.trim();
      if (!url) {
        showError("Paste an audio or YouTube URL first \u{1F3B5}");
        coverAudioUrl.focus();
        return;
      }
      form2.set("audio_url", url);
    }
    coverPreprocess.disabled = true;
    coverStatus.textContent = "Preparing cover...";
    try {
      const resp = await fetch("/api/music-cover/preprocess", { method: "POST", body: form2 });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "cover prepare failed");
      coverFeatureId.value = data.cover_feature_id ?? "";
      coverLyrics.value = data.lyrics ?? "";
      coverStatus.textContent = "Ready. Edit lyrics/style, then generate.";
      void putDraft("create", createDraftFromDom());
    } catch (err) {
      coverStatus.textContent = "Prepare failed.";
      showError(String(err instanceof Error ? err.message : err));
    } finally {
      coverPreprocess.disabled = false;
    }
  });
  coverGenerate.addEventListener("click", () => {
    const prompt = coverStyle.value.trim();
    const lyrics = coverLyrics.value.trim();
    const featureId = coverFeatureId.value.trim();
    if (!featureId) {
      showError("Prepare the cover source first \u{1F3B5}");
      coverPreprocess.focus();
      return;
    }
    if (!prompt) {
      showError("Describe the new style first \u{1F3B5}");
      coverStyle.focus();
      return;
    }
    if (!lyrics) {
      showError("Cover lyrics are required \u{1F3B5}");
      coverLyrics.focus();
      return;
    }
    closeCreateModal();
    void sendCreateTool(
      "generate_music_cover",
      { prompt, lyrics, cover_feature_id: featureId },
      `Create cover: ${prompt}`
    );
  });
  createVoiceForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = voiceTextInput.value.trim();
    const input2 = {
      text,
      speed: Number(voiceSpeedInput.value)
    };
    if (voiceIdInput?.value.trim()) input2.voice_id = voiceIdInput.value.trim();
    if (voiceVolumeInput?.value.trim()) input2.volume = Number(voiceVolumeInput.value.trim());
    if (voicePitchInput?.value.trim()) input2.pitch = Number(voicePitchInput.value.trim());
    if (text) {
      closeCreateModal();
      void sendCreateTool("text_to_speech", input2, `Create voice: ${text}`);
    }
  });
  createAnalyzeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const imageUrl = analyzeAssetUrl || analyzeUrlInput.value.trim();
    const prompt = analyzePromptInput.value.trim() || "What do you see?";
    if (!imageUrl) {
      showError("Choose an image file or paste an image URL first \u{1F50E}");
      analyzeDropzone?.focus();
      return;
    }
    closeCreateModal();
    void sendCreateTool(
      "analyze_image",
      { image_url: imageUrl, prompt },
      `Analyze image: ${prompt}`
    );
  });
  createSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = searchQueryInput.value.trim();
    if (query) {
      closeCreateModal();
      void sendCreateTool("web_search", { query }, `Search web: ${query}`);
    }
  });
  input.focus();
  document.documentElement.dataset.hgReady = "1";
}
if (typeof document !== "undefined" && document.readyState !== "loading") {
  init();
} else if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}
export {
  $2 as $,
  DEFAULT_USER_AVATAR,
  autoResizeInput,
  closeLightbox,
  createApiHeaders,
  createElement,
  deleteProfile,
  fetchHistory,
  fetchProfile,
  getToolEmoji,
  handleInputChange,
  imageDimensionsForPreset,
  imageSurpriseCode,
  init,
  loadAssets,
  loadHistory,
  normalizedProfileFromForm,
  openLightbox,
  parseSSEChunk,
  parseSSELine,
  putProfile,
  renderAssistantMessage,
  renderMarkdown,
  renderProfileAvatar,
  renderSteerMessage,
  renderThinkingBlock,
  renderToolCardLoading,
  renderToolResult,
  renderUserMessage,
  sendCreateTool,
  sendMessage,
  sendSteer,
  sendSteerMessage,
  showError,
  streamChat,
  updateQuotaBadge
};
