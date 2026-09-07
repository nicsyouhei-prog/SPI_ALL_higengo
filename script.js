/* =============================================================
   判断推理・資料解釈トレーニング — 問題自動生成エンジン
   すべての問題はブラウザ内でその場生成される（外部API不要）。
   順序・対応・位置・発言の真偽 → 全候補のブルートフォース照合で解の一意性を保証
   命題・論理                 → 真理値表による含意判定で正誤を保証
   資料解釈                   → ランダム生成した表から数値を実計算
   ============================================================= */

/* ------------------------- 汎用ユーティリティ ------------------------- */
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(arr, k) { return shuffle(arr).slice(0, k); }
function gcdNum(a, b) { return b === 0 ? a : gcdNum(b, a % b); }
function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function nPr(n, r) { let v = 1; for (let i = 0; i < r; i++) v *= (n - i); return v; }
function nCr(n, r) { if (r < 0 || r > n) return 0; return Math.round(nPr(n, r) / factorial(r)); }
function reduceFraction(num, den) { const g = gcdNum(num, den) || 1; return { num: num / g, den: den / g }; }
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

function minimizeClues(clues, searchSpace) {
  // 一意解を保ったまま、削除しても解が変わらない冗長な条件を取り除く
  let current = clues.slice();
  for (let i = current.length - 1; i >= 0; i--) {
    if (current.length <= 1) break;
    const trial = current.slice(0, i).concat(current.slice(i + 1));
    const matches = searchSpace.filter(x => trial.every(c => c.test(x)));
    if (matches.length === 1) current = trial;
  }
  return current;
}

// 条件がすべて出揃わなくても「単独の条件だけ」で値が確定してしまう位置（index）を洗い出す。
// 例：「Cの好きな果物はみかんである。」という条件が1つでもあれば、Cについてはこれ単独で
// 答えが分かってしまうため、出題対象（質問で聞く相手・順位・席）から除外するために使う。
function findTriviallyRevealedIndices(clues, searchSpace, n) {
  const revealed = new Set();
  for (const clue of clues) {
    const matches = searchSpace.filter(x => clue.test(x));
    if (matches.length === 0) continue;
    for (let idx = 0; idx < n; idx++) {
      if (matches.every(x => x[idx] === matches[0][idx])) revealed.add(idx);
    }
  }
  return revealed;
}

function pickTargetIndex(n, revealedSet) {
  const options = [];
  for (let i = 0; i < n; i++) if (!revealedSet.has(i)) options.push(i);
  return options.length > 0 ? options[randInt(0, options.length - 1)] : randInt(0, n - 1);
}

/* ------------------------- 出題範囲メタデータ ------------------------- */
const CATEGORIES = [
  { id: 'order',    label: '順序推理', desc: '順位・大小関係の条件から確実に言えることを導く', group: 'judgment', enabled: true },
  { id: 'matching', label: '対応推理', desc: '人と属性の対応関係を条件から特定する', group: 'judgment', enabled: true },
  { id: 'position', label: '位置推理', desc: '座席・配置の位置関係を条件から特定する', group: 'judgment', enabled: true },
  { id: 'truth',    label: '発言の真偽', desc: '一部が嘘をつく発言から事実を特定する', group: 'judgment', enabled: true },
  { id: 'logic',    label: '命題・論理', desc: '「AならばB」の連鎖から必ず正しい推論を選ぶ', group: 'judgment', enabled: true },
  { id: 'match',    label: '対戦成績', desc: 'リーグ戦の勝敗数の合計から、分からないチームの成績を特定する', group: 'judgment', enabled: true },
  { id: 'flow',     label: '物の流れと比率', desc: '比率にしたがって人や物が経路を流れる様子から、到達率や人数を求める', group: 'judgment', enabled: false },
  { id: 'sets',     label: '集合', desc: 'ベン図の関係から、条件に当てはまる人数を求める', group: 'quant', enabled: true },
  { id: 'pnc',      label: '場合の数', desc: '順列・組み合わせの総数を求める', group: 'quant', enabled: true },
  { id: 'probability', label: '確率', desc: 'くじ・カード・サイコロなどの確率を求める', group: 'quant', enabled: true },
  { id: 'profit',   label: '損益算', desc: '原価・定価・利益率・割引から売値や利益を求める', group: 'quant', enabled: true },
  { id: 'ratio',    label: '割合・増加率', desc: '割合や増加率から、全体・部分の数量を求める', group: 'quant', enabled: true },
  { id: 'data',     label: '資料解釈', desc: '表データから増加率・構成比を読み取る', group: 'data', enabled: true },
];
const CATEGORY_GROUPS = [
  { id: 'judgment', label: '判断推理' },
  { id: 'quant',    label: '数的推理' },
  { id: 'data',     label: '資料解釈' },
];
// 学校側で分野ごとに公開／非公開を切り替える場合は、上のCATEGORIESの該当する行の
// enabled を true / false に書き換えてください（false にした分野は生徒側の画面に一切表示されません）。
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

// 順序・対応・位置・発言の真偽・対戦成績で使う人物/チームラベル（最大8まで対応）
const ENTITY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const TIME_BASE = {
  order:    { mid: 70,  high: 50 },
  matching: { mid: 70,  high: 50 },
  position: { mid: 75,  high: 55 },
  truth:    { mid: 85,  high: 60 },
  logic:    { mid: 65,  high: 50 },
  match:    { mid: 60,  high: 45 },
  flow:     { mid: 75,  high: 60 },
  sets:     { mid: 60,  high: 50 },
  pnc:      { mid: 55,  high: 45 },
  probability: { mid: 60, high: 50 },
  profit:   { mid: 55,  high: 50 },
  ratio:    { mid: 50,  high: 45 },
  data:     { mid: 110, high: 85 },
};

// SPI-Hでも「推論（判断推理）」はSPI-Uと同水準の難易度で出題される傾向があるため、
// 判断推理系（order/matching/position/truth/logic/match）の要素数はexamTypeで差をつけない。
// 一方、資料解釈（計算・表の読み取り量）はSPI-Uのほうがボリューム・難度ともに高くなる
// 傾向があるため、dataRowsだけexamTypeによる差を残す。
//
// 要素数（n）は「難易度」だけでなく「問題の型」によっても実際の出題感覚が異なるため、
// カテゴリごとに現実的なレンジを設定する。
// ・対応推理は人と属性を1対1で割り当てる総当たり型のため、実際の出題でも4〜5人程度が中心
// ・順序推理／位置推理は5〜6人程度が典型
// ・発言の真偽は証言数が増えすぎない4〜5人程度が中心
// ・対戦成績（リーグ戦）は5〜8チームと幅があり、8チームのトーナメント戦なども頻出のため
//   このカテゴリだけ8まで対応する
const ELEMENT_COUNTS = {
  order:    { mid: 5, high: 6 },
  matching: { mid: 4, high: 5 },
  position: { mid: 5, high: 6 },
  truth:    { mid: 4, high: 5 },
  match:    { mid: 5, high: 8 },
};
function paramsFor(examType, difficulty, category) {
  const counts = ELEMENT_COUNTS[category] || { mid: 5, high: 6 };
  return {
    n: counts[difficulty],
    dataRows: examType === 'U' ? (difficulty === 'mid' ? 4 : 5) : (difficulty === 'mid' ? 3 : 4),
  };
}

/* ------------------------- 複合選択肢（ア・イ・ウ型）問題の共通処理 -------------------------
   SPI-U/Hの推論では「アだけ／イだけ／アとイの両方／…／正しい推論はない」のように、
   複数の推論の正誤の組み合わせを問う最大8択形式が頻出する。
   最小の一意確定条件セットから条件を1つ外して「あえて一意に定まらない状態」を作り、
   ア・イ・ウの3つの推論候補それぞれについて「残る可能性の中に成り立つ場合があるか
   （＝必ずしも誤りとは言えないか）」を判定して出題する。 */
function buildCompoundQuestion({ subjectDesc, allSpace, minimalClues, pool }) {
  const dropIdx = randInt(0, minimalClues.length - 1);
  const displayClues = minimalClues.filter((_, i) => i !== dropIdx);
  const removedClue = minimalClues[dropIdx];
  const candidates = allSpace.filter(x => displayClues.every(c => c.test(x)));
  if (candidates.length < 2) return null; // 想定外に一意確定してしまった場合は通常出題にフォールバック

  const displayTexts = new Set(displayClues.map(c => c.text));
  const otherStmts = shuffle(pool.filter(s => !displayTexts.has(s.text) && s.text !== removedClue.text));
  if (otherStmts.length < 2) return null;
  const propositions = shuffle([removedClue, ...otherStmts.slice(0, 2)]);

  const labels = ['ア', 'イ', 'ウ'];
  const evalResults = propositions.map(stmt => {
    const holds = candidates.filter(x => stmt.test(x)).length;
    return { stmt, possiblyTrue: holds > 0 };
  });

  const subsetLabel = (flags) => {
    const included = labels.filter((_, i) => flags[i]);
    if (included.length === 0) return '正しい推論はない（ア・イ・ウのいずれも誤り）';
    if (included.length === 3) return 'アとイとウのすべて';
    if (included.length === 1) return `${included[0]}だけ`;
    return `${included[0]}と${included[1]}の両方`;
  };

  const allSubsets = [];
  for (let m = 0; m < 8; m++) allSubsets.push([!!(m & 1), !!(m & 2), !!(m & 4)]);
  const choices = shuffle(allSubsets.map(subsetLabel));
  const correctText = subsetLabel(evalResults.map(r => r.possiblyTrue));

  const propText = propositions.map((p, i) => `${labels[i]}：${p.text}`).join('\n');
  const prompt = `${subjectDesc}。次の条件が成り立つとき、必ずしも誤りとは言えない推論はどれか。\n\n` +
    displayClues.map((c, i) => `条件${i + 1}：${c.text}`).join('\n') + '\n\n' + propText;

  const detail = evalResults.map((r, i) =>
    `${labels[i]}「${r.stmt.text}」は、条件を満たす${candidates.length}通りの可能性の中に${r.possiblyTrue ? '当てはまる場合があるため、誤りとは言えない' : '当てはまる場合が一つもないため、誤りである'}。`
  ).join('\n');
  const explanation = `表示された条件だけでは、可能性は${candidates.length}通りに絞り込める段階である。\n${detail}\nしたがって正しい選択肢は「${correctText}」。`;

  return {
    prompt,
    choices,
    correctIndex: choices.indexOf(correctText),
    explanation,
    extraTime: 40, // 複合選択肢は検討量が多いため、持ち時間を加算する
  };
}

/* ============================================================
   1. 順序推理
   ============================================================ */
function generateOrderProblem(examType, difficulty) {
  const { n } = paramsFor(examType, difficulty, 'order');
  const entities = ENTITY_LETTERS.slice(0, n);
  const allPerms = permutations(entities);
  const useCompound = difficulty === 'high' ? Math.random() < 0.45 : Math.random() < 0.15;
  let truePerm, clues, pool, solved = false;

  for (let attempt = 0; attempt < 20 && !solved; attempt++) {
    truePerm = shuffle(entities);
    pool = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = truePerm[i], b = truePerm[j];
        pool.push({ text: `${a}は${b}より順位が高い。`, test: p => p.indexOf(a) < p.indexOf(b) });
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = truePerm[i], b = truePerm[i + 1];
      pool.push({ text: `${a}と${b}の順位は隣り合っている。`, test: p => Math.abs(p.indexOf(a) - p.indexOf(b)) === 1 });
    }
    for (let i = 1; i < n - 1; i++) {
      const a = truePerm[i], b = truePerm[i - 1], c = truePerm[i + 1];
      pool.push({
        text: `${a}の順位は${b}と${c}の間である。`,
        test: p => { const ia = p.indexOf(a), ib = p.indexOf(b), ic = p.indexOf(c); return (ib < ia && ia < ic) || (ic < ia && ia < ib); }
      });
    }
    pool.push({ text: `${truePerm[0]}は1位である。`, test: p => p.indexOf(truePerm[0]) === 0 });
    pool.push({ text: `${truePerm[n - 1]}は最下位である。`, test: p => p.indexOf(truePerm[n - 1]) === n - 1 });
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = j - i;
        if (Math.abs(d) < 2) continue;
        pool.push({
          text: d > 0 ? `${truePerm[j]}は${truePerm[i]}より${d}つ下位である。` : `${truePerm[j]}は${truePerm[i]}より${-d}つ上位である。`,
          test: p => p.indexOf(truePerm[j]) - p.indexOf(truePerm[i]) === d
        });
      }
    }

    const shuffled = shuffle(pool);
    const chosen = [];
    let candidates = allPerms;
    const minClues = difficulty === 'mid' ? Math.max(3, n - 2) : Math.max(4, n - 1);
    for (let k = 0; k < shuffled.length; k++) {
      chosen.push(shuffled[k]);
      candidates = candidates.filter(p => shuffled[k].test(p));
      if (chosen.length < minClues) continue;
      if (candidates.length === 1) { clues = chosen; solved = true; break; }
    }
  }
  if (!solved) clues = truePerm.map((name, i) => ({ text: `${i + 1}位は${name}である。`, test: p => p.indexOf(name) === i }));
  clues = shuffle(minimizeClues(clues, allPerms));

  if (useCompound && clues.length >= 2 && pool.length - clues.length >= 2) {
    const compound = buildCompoundQuestion({
      subjectDesc: `${entities.join('、')}の${n}人が競技の順位を競った`,
      allSpace: allPerms,
      minimalClues: clues,
      pool,
    });
    if (compound) return compound;
  }

  const revealedRanks = findTriviallyRevealedIndices(clues, allPerms, n);
  const targetRank = pickTargetIndex(n, revealedRanks);
  const correctAnswer = truePerm[targetRank];
  const distractors = shuffle(entities.filter(e => e !== correctAnswer)).slice(0, Math.min(3, n - 1));
  const choices = shuffle([correctAnswer, ...distractors]);

  const prompt = `${entities.join('、')}の${n}人が競技の順位を競った。次の条件がすべて成り立つとき、${targetRank + 1}位は誰か。\n\n` +
    clues.map((c, i) => `条件${i + 1}：${c.text}`).join('\n');
  const explanation = `条件をすべて満たす順位はただ一通りに定まり、確定した順位は「${truePerm.join(' → ')}」（1位→${n}位の順）である。よって${targetRank + 1}位は${correctAnswer}。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctAnswer), explanation };
}

/* ============================================================
   2. 対応推理
   ============================================================ */
function generateMatchingProblem(examType, difficulty) {
  const { n } = paramsFor(examType, difficulty, 'matching');
  const persons = ENTITY_LETTERS.slice(0, n);
  const pools = {
    fruit: ['りんご', 'みかん', 'ぶどう', 'もも', 'メロン', 'いちご', 'キウイ', 'なし'],
    dept:  ['営業部', '経理部', '人事部', '開発部', '広報部', '総務部', '法務部', '企画部'],
    color: ['赤',   '青',   '緑',   '黄',   '紫',   '橙',   '黒',   '白'],
  };
  const themeLabelMap = { fruit: '好きな果物', dept: '所属部署', color: '好きな色' };
  const themeKey = sample(Object.keys(pools), 1)[0];
  const attributes = pools[themeKey].slice(0, n);
  const themeLabel = themeLabelMap[themeKey];

  const allAssignments = permutations(attributes);
  let trueAttrOf, clues, solved = false;

  for (let attempt = 0; attempt < 20 && !solved; attempt++) {
    trueAttrOf = shuffle(attributes);
    const pool = [];
    for (let i = 0; i < n; i++) {
      pool.push({ text: `${persons[i]}の${themeLabel}は${trueAttrOf[i]}である。`, test: a => a[i] === trueAttrOf[i] });
      for (const w of attributes) {
        if (w === trueAttrOf[i]) continue;
        pool.push({ text: `${persons[i]}の${themeLabel}は${w}ではない。`, test: a => a[i] !== w });
      }
    }
    const shuffled = shuffle(pool);
    const chosen = [];
    let candidates = allAssignments;
    const minClues = difficulty === 'mid' ? Math.max(3, n) : Math.max(4, n + 1);
    for (let k = 0; k < shuffled.length; k++) {
      chosen.push(shuffled[k]);
      candidates = candidates.filter(a => shuffled[k].test(a));
      if (chosen.length < minClues) continue;
      if (candidates.length === 1) { clues = chosen; solved = true; break; }
    }
  }
  if (!solved) clues = persons.map((p, i) => ({ text: `${p}の${themeLabel}は${trueAttrOf[i]}である。`, test: a => a[i] === trueAttrOf[i] }));
  clues = shuffle(minimizeClues(clues, allAssignments));

  const revealedPersons = findTriviallyRevealedIndices(clues, allAssignments, n);
  const targetIdx = pickTargetIndex(n, revealedPersons);
  const correctAnswer = trueAttrOf[targetIdx];
  const distractors = shuffle(attributes.filter(a => a !== correctAnswer)).slice(0, Math.min(3, n - 1));
  const choices = shuffle([correctAnswer, ...distractors]);

  const setupTemplates = {
    fruit: `${persons.join('、')}の${n}人は、${attributes.join('・')}の中からそれぞれ異なる1つを${themeLabel}として選んだ。`,
    color: `${persons.join('、')}の${n}人は、${attributes.join('・')}の中からそれぞれ異なる1つを${themeLabel}として選んだ。`,
    dept:  `${persons.join('、')}の${n}人は、${attributes.join('・')}のいずれか異なる部署（${themeLabel}）に所属している。`,
  };
  const setup = setupTemplates[themeKey];

  const prompt = `${setup}次のことが分かっているとき、${persons[targetIdx]}の${themeLabel}は何か。\n\n` +
    clues.map((c, i) => `条件${i + 1}：${c.text}`).join('\n');
  const explanation = `候補は${attributes.join('・')}の${n}つであり、条件をすべて満たす対応関係はただ一通りに定まる。対応関係は ${persons.map((p, i) => `${p}：${trueAttrOf[i]}`).join('、')} である。よって${persons[targetIdx]}の${themeLabel}は${correctAnswer}。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctAnswer), explanation };
}

/* ============================================================
   3. 位置推理
   ============================================================ */
function generatePositionProblem(examType, difficulty) {
  const { n } = paramsFor(examType, difficulty, 'position');
  const entities = ENTITY_LETTERS.slice(0, n);
  const allPerms = permutations(entities);
  const circular = difficulty === 'high' && n % 2 === 0 && Math.random() < 0.5;
  const useCompound = difficulty === 'high' ? Math.random() < 0.45 : Math.random() < 0.15;
  let truePerm, clues, pool, solved = false;

  for (let attempt = 0; attempt < 20 && !solved; attempt++) {
    truePerm = shuffle(entities);
    pool = [];

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!circular && j === 0) continue;
      const a = truePerm[i], b = truePerm[j];
      pool.push({
        text: `${a}の右隣は${b}である。`,
        test: p => { const ia = p.indexOf(a), ib = p.indexOf(b); return circular ? (ib === (ia + 1) % n) : (ib === ia + 1); }
      });
    }
    if (!circular) {
      pool.push({ text: `${truePerm[0]}は左端に座っている。`, test: p => p.indexOf(truePerm[0]) === 0 });
      pool.push({ text: `${truePerm[n - 1]}は右端に座っている。`, test: p => p.indexOf(truePerm[n - 1]) === n - 1 });
      for (let i = 1; i < n - 1; i++) {
        const a = truePerm[i], b = truePerm[i - 1], c = truePerm[i + 1];
        pool.push({
          text: `${a}の席は${b}と${c}の間にある。`,
          test: p => { const ia = p.indexOf(a), ib = p.indexOf(b), ic = p.indexOf(c); return (ib < ia && ia < ic) || (ic < ia && ia < ib); }
        });
      }
    } else {
      for (let i = 0; i < n / 2; i++) {
        const j = i + n / 2;
        const a = truePerm[i], b = truePerm[j];
        pool.push({
          text: `${a}の正面（向かい）の席は${b}である。`,
          test: p => Math.abs(p.indexOf(a) - p.indexOf(b)) === n / 2
        });
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (circular) {
          const d = (j - i + n) % n;
          if (d < 2 || d > n - 2) continue;
          pool.push({
            text: `${truePerm[j]}は${truePerm[i]}から右回りに${d}つ離れた席に座っている。`,
            test: p => { const ia = p.indexOf(truePerm[i]), ja = p.indexOf(truePerm[j]); return (ja - ia + n) % n === d; }
          });
        } else {
          const d = j - i;
          if (Math.abs(d) < 2) continue;
          pool.push({
            text: d > 0 ? `${truePerm[j]}は${truePerm[i]}より右に${d}席離れている。` : `${truePerm[j]}は${truePerm[i]}より左に${-d}席離れている。`,
            test: p => p.indexOf(truePerm[j]) - p.indexOf(truePerm[i]) === d
          });
        }
      }
    }

    const shuffled = shuffle(pool);
    const chosen = [];
    let candidates = allPerms;
    const minClues = difficulty === 'mid' ? Math.max(3, n - 2) : Math.max(4, n - 1);
    for (let k = 0; k < shuffled.length; k++) {
      chosen.push(shuffled[k]);
      candidates = candidates.filter(p => shuffled[k].test(p));
      if (chosen.length < minClues) continue;
      if (candidates.length === 1) { clues = chosen; solved = true; break; }
    }
  }
  if (!solved) clues = truePerm.map((name, i) => ({ text: circular ? `基準の席から右回りに${i + 1}番目は${name}である。` : `左から${i + 1}番目は${name}である。`, test: p => p.indexOf(name) === i }));
  clues = shuffle(minimizeClues(clues, allPerms));

  if (useCompound && clues.length >= 2 && pool.length - clues.length >= 2) {
    const subjectDesc = circular
      ? `${entities.join('、')}の${n}人が円卓に等間隔で座っている`
      : `${entities.join('、')}の${n}人が一列に並んで座っている`;
    const compound = buildCompoundQuestion({ subjectDesc, allSpace: allPerms, minimalClues: clues, pool });
    if (compound) return compound;
  }

  const revealedSeats = findTriviallyRevealedIndices(clues, allPerms, n);
  const targetIdx = pickTargetIndex(n, revealedSeats);
  const correctAnswer = truePerm[targetIdx];
  const distractors = shuffle(entities.filter(e => e !== correctAnswer)).slice(0, Math.min(3, n - 1));
  const choices = shuffle([correctAnswer, ...distractors]);
  const seatDesc = circular ? `基準の席から右回りに${targetIdx + 1}番目` : `左から${targetIdx + 1}番目`;
  const setup = circular
    ? `${entities.join('、')}の${n}人が円卓に等間隔で座っている。次の条件がすべて成り立つとき、${seatDesc}の席に座っているのは誰か。`
    : `${entities.join('、')}の${n}人が一列に並んで座っている。次の条件がすべて成り立つとき、${seatDesc}に座っているのは誰か。`;

  const prompt = `${setup}\n\n` + clues.map((c, i) => `条件${i + 1}：${c.text}`).join('\n');
  const explanation = `条件をすべて満たす配置はただ一通りに定まり、確定した配置は「${truePerm.join(' → ')}」である。よって${seatDesc}は${correctAnswer}。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctAnswer), explanation };
}

/* ============================================================
   4. 発言の真偽
   ============================================================ */
function generateTruthProblem(examType, difficulty) {
  const { n } = paramsFor(examType, difficulty, 'truth');
  const suspects = ENTITY_LETTERS.slice(0, n);
  const K = difficulty === 'high' && Math.random() < 0.5 ? n - 1 : 1;

  function falseCountUnder(statements, assumed) {
    let cnt = 0;
    for (const s of statements) {
      let truth;
      if (s.type === 'accuse') truth = (s.target === assumed);
      else if (s.type === 'denySelf') truth = (s.speaker !== assumed);
      else truth = (s.target !== assumed); // denyOther
      if (!truth) cnt++;
    }
    return cnt;
  }

  let statements, solutionIdx = null;
  for (let attempt = 0; attempt < 150 && solutionIdx === null; attempt++) {
    statements = suspects.map((_, i) => {
      const roll = Math.random();
      if (roll < 0.34) return { speaker: i, type: 'accuse', target: randInt(0, n - 1) };
      if (roll < 0.67) return { speaker: i, type: 'denySelf' };
      let t = randInt(0, n - 1);
      return { speaker: i, type: 'denyOther', target: t };
    });
    const matches = [];
    for (let c = 0; c < n; c++) if (falseCountUnder(statements, c) === K) matches.push(c);
    if (matches.length === 1) solutionIdx = matches[0];
  }
  if (solutionIdx === null) {
    // 保証済みフォールバック：本人以外は自身の無実を正しく主張、犯人だけが嘘をつく
    solutionIdx = randInt(0, n - 1);
    statements = suspects.map((_, i) => ({ speaker: i, type: 'denySelf' }));
  }

  const correctAnswer = suspects[solutionIdx];
  const lines = statements.map(s => {
    if (s.type === 'accuse') return `${suspects[s.speaker]}「犯人は${suspects[s.target]}です」`;
    if (s.type === 'denySelf') return `${suspects[s.speaker]}「私は犯人ではありません」`;
    return `${suspects[s.speaker]}「${suspects[s.target]}は犯人ではありません」`;
  });

  const condText = K === 1 ? 'この中で嘘をついているのは1人だけ' : 'この中で本当のことを言っているのは1人だけ';
  const prompt = `ある事件について${suspects.join('、')}の${n}人が次のように証言した。${condText}であることが分かっている。証言をもとに、犯人を特定せよ。\n\n` + lines.join('\n');

  const choicePool = suspects.length <= 4 ? suspects : shuffle([correctAnswer, ...shuffle(suspects.filter(s => s !== correctAnswer)).slice(0, 3)]);
  const choices = shuffle(choicePool);
  const explanation = `各人が犯人であると仮定して証言の真偽をすべて検証すると、「${condText}」という条件に一致するのは${correctAnswer}が犯人の場合のみである。よって犯人は${correctAnswer}。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctAnswer), explanation };
}

/* ============================================================
   5. 命題・論理
   ============================================================ */
function negatePhrase(phrase) { return phrase.replace(/だ$/, '') + 'ではない'; }
function dropCopula(phrase) { return phrase.replace(/だ$/, ''); }
function statementText(stmt, phrases) {
  const anteText = stmt.ant.neg ? negatePhrase(phrases[stmt.ant.var]) : dropCopula(phrases[stmt.ant.var]);
  const consText = stmt.cons.neg ? negatePhrase(phrases[stmt.cons.var]) : phrases[stmt.cons.var];
  return `${anteText}ならば、${consText}。`;
}
function isEntailed(stmt, premises, varCount) {
  const models = 1 << varCount;
  for (let m = 0; m < models; m++) {
    const holds = (lit) => {
      const raw = !!(m & (1 << lit.var));
      return lit.neg ? !raw : raw;
    };
    const premisesOk = premises.every(p => (!holds(p.ant)) || holds(p.cons));
    if (!premisesOk) continue;
    if (!((!holds(stmt.ant)) || holds(stmt.cons))) return false;
  }
  return true;
}
function generateLogicProblem(examType, difficulty) {
  const L = difficulty === 'high' ? 3 : 2;
  const varCount = L + 1;
  const phrasePool = shuffle(['読書が好きだ', '早起きだ', '几帳面だ', '運動が得意だ', '絵が上手だ', '計画的だ', '聞き上手だ']);
  const phrases = phrasePool.slice(0, varCount);

  // 前提の連鎖（0→1→2→…）は保つが、各リンクの否定の有無・表示形（順接／対偶）を
  // ランダム化し、毎回「AならばB、BならばC」という同じ形にならないようにする。
  const premises = [];
  let curLit = { var: 0, neg: Math.random() < 0.5 };
  for (let i = 0; i < L; i++) {
    const nextLit = { var: i + 1, neg: Math.random() < 0.5 };
    const asContrapositive = Math.random() < 0.5;
    if (asContrapositive) {
      // ¬cons → ¬ant の形（対偶）で表示する。論理的にはant→consと同値。
      premises.push({ ant: { var: nextLit.var, neg: !nextLit.neg }, cons: { var: curLit.var, neg: !curLit.neg } });
    } else {
      premises.push({ ant: curLit, cons: nextLit });
    }
    curLit = nextLit;
  }

  const seen = new Set();
  const validCands = [], invalidCands = [];
  for (let i = 0; i < varCount; i++) {
    for (let j = 0; j < varCount; j++) {
      if (i === j) continue;
      for (const an of [false, true]) {
        for (const cn of [false, true]) {
          const stmt = { ant: { var: i, neg: an }, cons: { var: j, neg: cn } };
          const text = statementText(stmt, phrases);
          if (seen.has(text)) continue;
          seen.add(text);
          const isPremise = premises.some(p => p.ant.var === i && p.ant.neg === an && p.cons.var === j && p.cons.neg === cn);
          if (isPremise) continue;
          if (isEntailed(stmt, premises, varCount)) validCands.push({ stmt, text });
          else invalidCands.push({ stmt, text });
        }
      }
    }
  }

  const correct = sample(validCands, 1)[0];
  const distractors = sample(invalidCands, 3);
  const choices = shuffle([correct.text, ...distractors.map(d => d.text)]);

  const premiseTexts = premises.map((p, i) => `前提${i + 1}：${statementText(p, phrases)}`);
  const prompt = `次の${L}つの前提がいずれも正しいとき、これらから確実に言えるものはどれか。\n\n` + premiseTexts.join('\n');
  const explanation = `対偶や推移律を用いて前提を整理すると、「${correct.text}」は必ず成り立つ。他の選択肢は逆・裏の関係にあたり、前提から必ずしも導けない。`;

  return { prompt, choices, correctIndex: choices.indexOf(correct.text), explanation };
}

function buildTableHTML(years, stores, table, rowLabel) {
  let html = `<table><thead><tr><th>${rowLabel || '項目'}</th>` + years.map(y => `<th>${y}</th>`).join('') + '</tr></thead><tbody>';
  stores.forEach((s, i) => { html += `<tr><td>${s}</td>` + table[i].map(v => `<td>${v}</td>`).join('') + '</tr>'; });
  html += '</tbody></table>';
  return html;
}

/* ============================================================
   6. 対戦成績（リーグ戦の勝敗数）
   ============================================================
   n チームが1回戦総当たり（引き分けなし）のリーグ戦を行うと、総試合数は必ず
   n×(n-1)/2 で、1試合につき必ず1勝が生まれるため「全チームの勝ち数の合計」は
   常に一定になる。この不変量を使い、1チーム以外の勝敗数を示した上で、
   残る1チームの勝敗数を一意に確定させる。 */
function generateMatchProblem(examType, difficulty) {
  return Math.random() < 0.5
    ? buildRoundRobinMatchProblem(examType, difficulty)
    : buildEliminationMatchProblem(difficulty);
}

function buildRoundRobinMatchProblem(examType, difficulty) {
  const { n } = paramsFor(examType, difficulty, 'match');
  const teams = ENTITY_LETTERS.slice(0, n);
  const totalMatches = (n * (n - 1)) / 2;

  // 総当たり戦を1回分ランダムにシミュレートし、必ず矛盾のない勝敗記録を作る
  const wins = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.random() < 0.5) wins[i]++; else wins[j]++;
    }
  }

  const targetIdx = randInt(0, n - 1);
  const askLosses = Math.random() < 0.5;

  const shownLines = teams
    .map((t, i) => ({ t, i, w: wins[i] }))
    .filter(({ i }) => i !== targetIdx)
    .map(({ t, w }) => ({ text: `${t}は${w}勝${n - 1 - w}敗である。` }));

  const knownWinsSum = wins.reduce((sum, w, i) => (i === targetIdx ? sum : sum + w), 0);
  const targetWins = totalMatches - knownWinsSum;
  const targetLosses = (n - 1) - targetWins;
  const correctValue = askLosses ? targetLosses : targetWins;

  const maxPossible = n - 1;
  const distractorPool = [];
  for (let k = 0; k <= maxPossible; k++) if (k !== correctValue) distractorPool.push(k);
  const distractors = shuffle(distractorPool).slice(0, Math.min(3, distractorPool.length));
  const choices = shuffle([correctValue, ...distractors]).map(v => `${v}${askLosses ? '敗' : '勝'}`);
  const correctText = `${correctValue}${askLosses ? '敗' : '勝'}`;

  const targetTeam = teams[targetIdx];
  const questionWord = askLosses ? '敗数' : '勝数';
  const prompt = `${teams.join('、')}の${n}チームが1回戦総当たりのリーグ戦をおこなった（引き分けはなく、必ず勝敗がつく）。次のことがわかっているとき、${targetTeam}の${questionWord}はいくつか。\n\n` +
    shuffle(shownLines).map((c, i) => `条件${i + 1}：${c.text}`).join('\n');

  const explanation = `${n}チームの総当たり戦の総試合数は${n}×${n - 1}÷2＝${totalMatches}試合で、1試合ごとに必ず1勝が生まれるため、全チームの勝ち数の合計は常に${totalMatches}になる。${targetTeam}以外の${n - 1}チームの勝ち数の合計は${knownWinsSum}なので、${targetTeam}の勝ち数は${totalMatches}－${knownWinsSum}＝${targetWins}勝、よって${targetLosses}敗（${targetWins}勝${targetLosses}敗）と一意に確定する。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

/* 勝ち残り式トーナメント戦（総当たり戦とはチーム数のレンジを分けている：
   総当たり戦は5〜8チーム程度が典型だが、勝ち残り戦は2の累乗（4・8・16…）で
   ブロックが組まれるのが実態に近いため、専用のチーム数プールを使う）。 */
function buildEliminationMatchProblem(difficulty) {
  const pool = difficulty === 'mid' ? [4, 8] : [8, 16, 32];
  const n = pick(pool);
  const totalRounds = Math.log2(n);
  const totalMatches = n - 1;
  const variant = pick(['totalMatches', 'championWins', 'eliminatedInRound', 'reverseTeamCount']);
  let prompt, correctValue, explanation, unit;

  if (variant === 'totalMatches') {
    correctValue = totalMatches;
    unit = '試合';
    prompt = `${n}チームによる勝ち残り式のトーナメント戦（引き分けはなく、1回でも負けたチームはその時点で敗退する）をおこなった。優勝チームが決まるまでに、全部で何試合おこなわれるか。`;
    explanation = `優勝チームが決まるには、優勝チーム以外の${n - 1}チームが全て一度は敗退している必要がある。1試合ごとに必ず1チームが敗退するので、総試合数は${n}－1＝${totalMatches}試合となる。`;
  } else if (variant === 'championWins') {
    correctValue = totalRounds;
    unit = '回';
    prompt = `${n}チームによる勝ち残り式のトーナメント戦をおこなった（引き分けはなく、1回勝つごとに次の回に進む）。優勝チームは合計何回勝ったことになるか。`;
    explanation = `${n}チームが勝ち残り式で1チームに絞り込まれるまでのラウンド数は、${n}＝2^${totalRounds}より${totalRounds}回。優勝チームは毎回勝ち上がっているので、勝った回数も${totalRounds}回となる。`;
  } else if (variant === 'eliminatedInRound') {
    const round = randInt(1, totalRounds);
    correctValue = n / Math.pow(2, round);
    unit = 'チーム';
    const roundLabel = round === totalRounds ? '決勝' : `第${round}回戦`;
    prompt = `${n}チームによる勝ち残り式のトーナメント戦をおこなった（引き分けはなく、1回でも負けたチームはその時点で敗退する）。${roundLabel}で敗退するのは何チームか。`;
    explanation = `勝ち残り数は1回戦ごとに半分になっていく（${n}チーム→${n / 2}チーム→…）。${roundLabel}の時点で対戦しているチーム数は${correctValue * 2}チームであり、そのうち負けて敗退するのは${correctValue}チームとなる。`;
  } else {
    const wins = randInt(2, totalRounds);
    correctValue = Math.pow(2, wins);
    unit = 'チーム';
    prompt = `勝ち残り式のトーナメント戦（引き分けはなく、1回でも負けたチームはその時点で敗退する）で、あるチームが${wins}回勝って優勝した。このトーナメントには何チームが参加していたか。`;
    explanation = `勝ち残り式のトーナメントでは、優勝チームの勝利数がそのままラウンド数（参加チーム数を2で何回割ると1になるか）と一致する。${wins}回勝って優勝したので、参加チーム数は2^${wins}＝${correctValue}チームとなる。`;
  }

  const distractorPool = new Set();
  [1, 2, -1, -2].forEach(d => { const v = correctValue + d; if (v > 0 && v !== correctValue) distractorPool.add(v); });
  [0.5, 2].forEach(k => { const v = Math.round(correctValue * k); if (v > 0 && v !== correctValue) distractorPool.add(v); });
  let distractors = shuffle([...distractorPool]).slice(0, 3);
  let fallback = 1;
  while (distractors.length < 3) {
    if (fallback !== correctValue && !distractors.includes(fallback)) distractors.push(fallback);
    fallback++;
  }
  const choices = shuffle([correctValue, ...distractors]).map(v => `${v}${unit}`);
  const correctText = `${correctValue}${unit}`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

/* ============================================================
   7. 物の流れと比率
   ============================================================
   比率にしたがって人・物が経路をたどって流れていく図を想定し、
   （A）ある地点を基準（100%）としたとき、目的地に到達する割合を求める問題と、
   （B）実際の人数と比率から、経路をたどって特定地点の人数を求める問題の
   2パターンをランダムに出題する。
   Bは「選んだ経路の分母の積」を初期人数の基準にすることで、必ず割り切れる
   （四捨五入が不要な）整数の答えになるよう構成している。 */
const FLOW_LABELS = ['V', 'W', 'X', 'Y', 'Z', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'];
const FLOW_PERCENT_RATIOS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8];
const FLOW_FRACTIONS = [
  { num: 1, den: 2 }, { num: 1, den: 4 }, { num: 3, den: 4 },
  { num: 1, den: 5 }, { num: 2, den: 5 }, { num: 3, den: 5 }, { num: 4, den: 5 },
  { num: 1, den: 10 }, { num: 3, den: 10 }, { num: 7, den: 10 }, { num: 9, den: 10 },
];

function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

// nodes: [{id, label, col, row}]  edges: [{from, to, label}]
// col/rowは格子状のレイアウト位置（実際のピクセル座標はここで計算する）
function buildFlowDiagramSVG(nodes, edges) {
  const colWidth = 150, rowHeight = 74, boxW = 56, boxH = 34, pad = 24;
  const maxCol = Math.max(...nodes.map(n => n.col));
  const maxRow = Math.max(...nodes.map(n => n.row));
  const width = (maxCol + 1) * colWidth + pad * 2 - (colWidth - boxW);
  const height = (maxRow + 1) * rowHeight + pad * 2 - (rowHeight - boxH);

  const pos = {};
  nodes.forEach(n => {
    pos[n.id] = { x: pad + n.col * colWidth + boxW / 2, y: pad + n.row * rowHeight + boxH / 2 };
  });

  const edgeSVG = edges.map(e => {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) return '';
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const x1 = a.x + ux * (boxW / 2 + 2);
    const y1 = a.y + uy * (boxH / 2 + 2);
    const x2 = b.x - ux * (boxW / 2 + 9);
    const y2 = b.y - uy * (boxH / 2 + 9);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" `
      + `stroke="#64748b" stroke-width="1.6" marker-end="url(#flow-arrow)" />`
      + `<rect x="${(mx - 20).toFixed(1)}" y="${(my - 11).toFixed(1)}" width="40" height="18" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />`
      + `<text x="${mx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="#334155">${e.label}</text>`;
  }).join('');

  const nodeSVG = nodes.map(n => {
    const p = pos[n.id];
    return `<rect x="${(p.x - boxW / 2).toFixed(1)}" y="${(p.y - boxH / 2).toFixed(1)}" width="${boxW}" height="${boxH}" rx="8" `
      + `fill="#eff6ff" stroke="#3b82f6" stroke-width="1.6" />`
      + `<text x="${p.x.toFixed(1)}" y="${(p.y + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" fill="#1e3a8a">${n.label}</text>`;
  }).join('');

  return `<div style="overflow-x:auto;"><svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" `
    + `style="max-width:560px;display:block;margin:0 auto;">`
    + `<defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">`
    + `<path d="M0,0 L6,3 L0,6 Z" fill="#64748b" /></marker></defs>`
    + edgeSVG + nodeSVG + `</svg></div>`;
}

/* 複数の起点（K,L,M...）が中継地点に合流し、最終地点へ至る一般的なDAG構造を作る。
   例：K→N, L→N, M→P, N→Q, P→Q のように、中継地点に複数の起点が合流する形を再現する。 */
function buildFlowTopology(difficulty) {
  const sourceCount = difficulty === 'mid' ? 3 : 4;
  const midCount = 2;
  const labels = shuffle(FLOW_LABELS);
  let li = 0;
  const sources = Array.from({ length: sourceCount }, () => labels[li++]);
  const mids = Array.from({ length: midCount }, () => labels[li++]);
  const final = labels[li++];

  // 各中継地点に最低1つは起点が合流するように割り当てる
  let assignment;
  do {
    assignment = sources.map(() => randInt(0, midCount - 1));
  } while (new Set(assignment).size < midCount);

  return { sources, mids, final, assignment };
}

// 起点は左端、中継地点はそこに合流する起点の平均位置、最終地点は中央、という配置にする
function buildFlowNodes(topo) {
  const { sources, mids, final, assignment } = topo;
  const nodes = sources.map((s, i) => ({ id: s, label: s, col: 0, row: i }));
  mids.forEach((m, mi) => {
    const rows = sources.map((s, i) => i).filter(i => assignment[i] === mi);
    const avgRow = rows.reduce((a, b) => a + b, 0) / rows.length;
    nodes.push({ id: m, label: m, col: 1, row: avgRow });
  });
  nodes.push({ id: final, label: final, col: 2, row: (sources.length - 1) / 2 });
  return nodes;
}

function buildFlowPercentProblem(difficulty) {
  const topo = buildFlowTopology(difficulty);
  const { sources, mids, final, assignment } = topo;
  const s2mRatio = sources.map(() => pick(FLOW_PERCENT_RATIOS));
  const m2fRatio = mids.map(() => pick(FLOW_PERCENT_RATIOS));

  const edges = [];
  sources.forEach((s, i) => edges.push({ from: s, to: mids[assignment[i]], label: `${Math.round(s2mRatio[i] * 100)}%` }));
  mids.forEach((m, mi) => edges.push({ from: m, to: final, label: `${Math.round(m2fRatio[mi] * 100)}%` }));
  const diagramHTML = buildFlowDiagramSVG(buildFlowNodes(topo), edges);

  const targetIdx = randInt(0, sources.length - 1);
  const targetSource = sources[targetIdx];
  const midIdx = assignment[targetIdx];
  const pathRatio = s2mRatio[targetIdx] * m2fRatio[midIdx];
  const correctPct = Math.round(pathRatio * 100);

  const distractorPool = new Set();
  [1, 2, 3, 5, -1, -2, -3, -5].forEach(d => {
    const v = correctPct + d;
    if (v >= 0 && v <= 100) distractorPool.add(v);
  });
  // 別の中継地点の比率を使ってしまう（経路取り違え）典型ミスも誤答候補に加える
  mids.forEach((m, mi) => {
    if (mi === midIdx) return;
    const wrong = Math.round(s2mRatio[targetIdx] * m2fRatio[mi] * 100);
    if (wrong >= 0 && wrong <= 100 && wrong !== correctPct) distractorPool.add(wrong);
  });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctPct, ...distractors]).map(v => `${v}％`);
  const correctText = `${correctPct}％`;

  const prompt = `下の図は、${sources.join('、')}を訪れた人が、それぞれ比率にしたがって${final}まで移動する経路を表したものである（比率は一定とする）。${targetSource}を訪れた人を100％としたとき、そのうち${final}に到達する人の割合はおよそ何％か。必要なら小数点以下を四捨五入すること。`;

  const explanation = `${targetSource}から${final}に至る経路は「${targetSource}→${mids[midIdx]}→${final}」の1通りだけであり、他の起点・中継地点はこの計算には関係ない。${Math.round(s2mRatio[targetIdx] * 100)}％ × ${Math.round(m2fRatio[midIdx] * 100)}％ ＝ ${Math.round(pathRatio * 10000) / 100}％ となり、四捨五入すると${correctPct}％である。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation, tableHTML: diagramHTML };
}

function buildFlowCountProblem(difficulty) {
  const topo = buildFlowTopology(difficulty);
  const { sources, mids, final, assignment } = topo;
  const s2mFrac = sources.map(() => pick(FLOW_FRACTIONS));
  const m2fFrac = mids.map(() => pick(FLOW_FRACTIONS));

  const edges = [];
  sources.forEach((s, i) => edges.push({ from: s, to: mids[assignment[i]], label: `${s2mFrac[i].num}/${s2mFrac[i].den}` }));
  mids.forEach((m, mi) => edges.push({ from: m, to: final, label: `${m2fFrac[mi].num}/${m2fFrac[mi].den}` }));
  const diagramHTML = buildFlowDiagramSVG(buildFlowNodes(topo), edges);

  const targetIdx = randInt(0, sources.length - 1);
  const targetSource = sources[targetIdx];
  const midIdx = assignment[targetIdx];
  const f1 = s2mFrac[targetIdx], f2 = m2fFrac[midIdx];

  // 経路上の分母の積を基準にすれば、必ず割り切れる（四捨五入不要な）人数になる
  const denProduct = f1.den * f2.den;
  const initialCount = denProduct * randInt(1, 4);
  let correctCount = initialCount * f1.num / f1.den * f2.num / f2.den;
  correctCount = Math.round(correctCount);

  const distractorPool = new Set();
  [0.5, 1.5, 2, 0.75].forEach(k => {
    const v = Math.round(correctCount * k);
    if (v > 0 && v !== correctCount) distractorPool.add(v);
  });
  const step = Math.max(1, Math.round(correctCount * 0.1));
  [step, -step, step * 2, -step * 2].forEach(d => {
    const v = correctCount + d;
    if (v > 0 && v !== correctCount) distractorPool.add(v);
  });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctCount, ...distractors]).map(v => `${v}人`);
  const correctText = `${correctCount}人`;

  const prompt = `下の図は、${sources.join('、')}を訪れた人が、それぞれ比率にしたがって各地点へ移動する経路を表したものである。${targetSource}を訪れた人数が${initialCount}人であったとき、${final}に到達する人数は何人か。`;

  const pathText = `${f1.num}/${f1.den} × ${f2.num}/${f2.den}`;
  const explanation = `${targetSource}から${final}に至る経路は「${targetSource}→${mids[midIdx]}→${final}」の1通りだけであり、他の起点・中継地点はこの計算には関係ない。${initialCount}人 × ${pathText} ＝ ${correctCount}人となる。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation, tableHTML: diagramHTML };
}

/* ---------- 「割合を文字式で表す」問題（式の正誤判定） ---------- */
const FLOW_RATIO_LETTERS = ['s', 't', 'u', 'v', 'w', 'p', 'q', 'r', 'k', 'l', 'm', 'n'];

// terms: [[letter, letter, ...], ...] 各配列は掛け算、外側の配列は総和（展開形の多項式）を表す
function evalFlowTerms(terms, vals) {
  return terms.reduce((sum, t) => sum + t.reduce((prod, letter) => prod * vals[letter], 1), 0);
}
function flowTermsEquivalent(termsA, termsB, allLetters) {
  for (let trial = 0; trial < 4; trial++) {
    const vals = {};
    allLetters.forEach(l => { vals[l] = 1.1 + Math.random() * 8; });
    if (Math.abs(evalFlowTerms(termsA, vals) - evalFlowTerms(termsB, vals)) > 1e-6) return false;
  }
  return true;
}
// 典型的な誤りパターン（項の欠落／文字の取り違え／起点の取り違え／余計な項）を1つ作る
function corruptFlowTerms(canonicalTerms, sources, ratioLetters) {
  const terms = canonicalTerms.map(t => t.slice());
  const kinds = ['swap_letter', 'wrong_source', 'extra'];
  if (terms.length > 1) kinds.push('drop');
  const kind = pick(kinds);
  if (kind === 'drop') {
    terms.splice(randInt(0, terms.length - 1), 1);
  } else if (kind === 'swap_letter') {
    const ti = randInt(0, terms.length - 1);
    const pos = randInt(0, 1); // 比率の文字（先頭2つ）のどちらかを取り違える
    const original = terms[ti][pos];
    const alt = shuffle(ratioLetters.filter(l => l !== original))[0];
    if (alt) terms[ti][pos] = alt;
  } else if (kind === 'wrong_source') {
    const ti = randInt(0, terms.length - 1);
    const alt = shuffle(sources.filter(s => s !== terms[ti][2]))[0];
    if (alt) terms[ti][2] = alt;
  } else {
    const fake = [pick(ratioLetters), pick(ratioLetters), pick(sources)];
    terms.push(fake);
  }
  return terms;
}

function subsetChoiceSet(labels, correctFlags) {
  const subsetLabel = (flags) => {
    const included = labels.filter((_, i) => flags[i]);
    if (included.length === 0) return `正しいものはない（${labels.join('・')}のいずれも誤り）`;
    if (included.length === labels.length) return `${labels.join('と')}のすべて`;
    if (included.length === 1) return `${included[0]}だけ`;
    return `${included.join('と')}の両方`;
  };
  const n = labels.length;
  const allSubsets = [];
  for (let m = 0; m < (1 << n); m++) allSubsets.push(labels.map((_, i) => !!(m & (1 << i))));
  const choices = shuffle(allSubsets.map(subsetLabel));
  const correctText = subsetLabel(correctFlags);
  return { choices, correctText };
}

function buildFlowFormulaProblem(difficulty) {
  const topo = buildFlowTopology(difficulty);
  const { sources, mids, final, assignment } = topo;
  const letterPool = shuffle(FLOW_RATIO_LETTERS);
  let pi = 0;
  const s2mLetter = sources.map(() => letterPool[pi++]);
  const m2fLetter = mids.map(() => letterPool[pi++]);
  const ratioLetters = [...s2mLetter, ...m2fLetter];

  const edges = [];
  sources.forEach((s, i) => edges.push({ from: s, to: mids[assignment[i]], label: s2mLetter[i] }));
  mids.forEach((m, mi) => edges.push({ from: m, to: final, label: m2fLetter[mi] }));
  const diagramHTML = buildFlowDiagramSVG(buildFlowNodes(topo), edges);

  // 正しい展開形：各起点からの経路（比率の積）をすべて合計したもの
  const canonicalTerms = sources.map((s, i) => [s2mLetter[i], m2fLetter[assignment[i]], s]);
  const canonicalText = canonicalTerms.map(t => t.join('')).join(' + ');

  // 合流している中継地点があれば、そこでまとめた（因数分解した）同値な式も候補にする
  const midGroups = mids.map((m, mi) => sources.map((s, i) => i).filter(i => assignment[i] === mi));
  const groupableMidIdx = midGroups.findIndex(g => g.length >= 2);

  let candidateB;
  if (groupableMidIdx >= 0 && Math.random() < 0.5) {
    const mi = groupableMidIdx;
    const groupIdx = midGroups[mi];
    const inner = groupIdx.map(i => `${s2mLetter[i]}${sources[i]}`).join(' + ');
    const restText = sources.map((s, i) => i).filter(i => !groupIdx.includes(i))
      .map(i => `${s2mLetter[i]}${m2fLetter[assignment[i]]}${sources[i]}`).join(' + ');
    const text = `${m2fLetter[mi]}（${inner}）` + (restText ? ` + ${restText}` : '');
    candidateB = { text, terms: canonicalTerms }; // 数式としては正しい（値は同じ）
  } else {
    const terms = corruptFlowTerms(canonicalTerms, sources, ratioLetters);
    candidateB = { text: terms.map(t => t.join('')).join(' + '), terms };
  }

  const candidateCTerms = corruptFlowTerms(canonicalTerms, sources, ratioLetters);
  const candidateC = { text: candidateCTerms.map(t => t.join('')).join(' + '), terms: candidateCTerms };

  const candidates = shuffle([
    { text: canonicalText, terms: canonicalTerms },
    candidateB,
    candidateC,
  ]);

  const labels = ['ア', 'イ', 'ウ'];
  const allLetters = [...ratioLetters, ...sources];
  const flags = candidates.map(c => flowTermsEquivalent(c.terms, canonicalTerms, allLetters));
  const { choices, correctText } = subsetChoiceSet(labels, flags);

  const prompt = `下の図は、${sources.join('、')}を訪れた人が、それぞれ比率にしたがって${final}まで移動する経路を表したものである。経路上の比率は${ratioLetters.join('、')}という文字で表されている。${final}に到達する人数を正しく表す式は、次のうち必ずしも誤りとは言えないものはどれか。\n\n` +
    labels.map((lb, i) => `${lb}：${final} = ${candidates[i].text}`).join('\n');

  const detail = labels.map((lb, i) => `${lb}は、${final}に至るすべての経路をもれなく（かつ重複や取り違えなく）表して${flags[i] ? 'おり、正しい' : 'いないため、正しくない'}。`).join('\n');
  const explanation = `${final}に到達する人数は、各起点から${final}に至る経路（比率の積）をすべて合計したものと一致する（正しい内訳：${canonicalText}）。\n${detail}\nしたがって正しい選択肢は「${correctText}」。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation, tableHTML: diagramHTML };
}

function generateFlowProblem(examType, difficulty) {
  const roll = Math.random();
  if (roll < 0.35) return buildFlowPercentProblem(difficulty);
  if (roll < 0.7) return buildFlowCountProblem(difficulty);
  return buildFlowFormulaProblem(difficulty);
}

/* ============================================================
   8. 数的推理（集合・場合の数・確率・損益算・割合）
   ============================================================
   判断推理と異なり総当たり検証は不要で、四則演算・組み合わせ計算で
   直接答えを導ける分野。SPI-Uのほうが数値の規模や計算段階（2段階の
   利益計算など）が大きくなる傾向を反映し、examTypeで数値レンジを
   明確に分けている。 */
// 各パラメータは「SPI-Hの全レンジ（中級・上級とも）が、SPI-Uの全レンジより
// 必ず小さくなる」ように意図的に間隔を空けている。中級/上級の違いは同じ
// 出題区分の中でのゆるやかな段階づけとして扱い、SPI-U（易しい設定）とSPI-H
// （難しい設定）が数値的に重なって「同じような問題」に見えることがないようにする。
const NUMERIC_PARAMS = {
  sets: {
    H: { mid: { totalMin: 25, totalMax: 40, use3: false }, high: { totalMin: 45, totalMax: 65, use3: false } },
    U: { mid: { totalMin: 80, totalMax: 115, use3: false }, high: { totalMin: 125, totalMax: 180, use3: true } },
  },
  pnc: {
    H: { mid: { nMin: 4, nMax: 5 }, high: { nMin: 6, nMax: 7 } },
    U: { mid: { nMin: 8, nMax: 9 }, high: { nMin: 10, nMax: 12 } },
  },
  probability: {
    H: { mid: { poolMin: 5, poolMax: 7 }, high: { poolMin: 8, poolMax: 10 } },
    U: { mid: { poolMin: 12, poolMax: 16 }, high: { poolMin: 18, poolMax: 24 } },
  },
  profit: {
    H: { mid: { kMin: 2, kMax: 4, twoStage: false }, high: { kMin: 3, kMax: 6, twoStage: false } },
    U: { mid: { kMin: 8, kMax: 14, twoStage: false }, high: { kMin: 12, kMax: 25, twoStage: true } },
  },
  ratio: {
    H: { mid: { scaleMin: 2, scaleMax: 8 }, high: { scaleMin: 8, scaleMax: 15 } },
    U: { mid: { scaleMin: 18, scaleMax: 35 }, high: { scaleMin: 35, scaleMax: 80 } },
  },
};

const SETS_TOPIC_PAIRS = [
  ['野球', 'サッカー'], ['映画鑑賞', '読書'], ['旅行', 'コーヒー'],
  ['バスケットボール', '音楽鑑賞'], ['ゲーム', '料理'], ['写真', '紅茶'],
];
const SETS_TOPIC_TRIOS = [
  ['野球', 'サッカー', 'バスケットボール'], ['映画鑑賞', '読書', '音楽鑑賞'], ['旅行', '料理', '写真'],
];

function buildSets2Problem(p) {
  const total = randInt(p.totalMin, p.totalMax);
  // 全体をランダムな比率で「両方」「Aのみ」「Bのみ」「どちらでもない」に配分する
  // （どの区分もtotalに対して割合ベースで決めるため、totalが必ず指定レンジ内に収まる）
  const neither = Math.max(1, Math.round(total * (0.08 + Math.random() * 0.14))); // 8%〜22%
  const unionCount = total - neither;
  const x = Math.max(1, Math.round(unionCount * (0.15 + Math.random() * 0.20))); // unionの15%〜35%
  const remain = unionCount - x;
  const onlyA = Math.max(1, Math.round(remain * (0.3 + Math.random() * 0.4)));
  const onlyB = Math.max(1, remain - onlyA);
  const a = x + onlyA;
  const b = x + onlyB;
  const [labelA, labelB] = pick(SETS_TOPIC_PAIRS);

  const kind = pick(['onlyA', 'onlyB', 'neither', 'union']);
  const values = { onlyA, onlyB, neither, union: unionCount };
  const questionTexts = {
    onlyA: `${labelA}は好きだが${labelB}は好きではない人は何人か。`,
    onlyB: `${labelB}は好きだが${labelA}は好きではない人は何人か。`,
    neither: `${labelA}も${labelB}もどちらも好きではない人は何人か。`,
    union: `${labelA}または${labelB}の少なくとも一方が好きな人は何人か。`,
  };
  const correctValue = values[kind];

  const prompt = `あるグループ${total}人にアンケートを取ったところ、${labelA}が好きな人は${a}人、${labelB}が好きな人は${b}人、両方とも好きな人は${x}人だった。${questionTexts[kind]}`;
  const distractorPool = new Set();
  [values.onlyA, values.onlyB, values.neither, values.union, a, b, total].forEach(v => { if (v !== correctValue && v > 0) distractorPool.add(v); });
  [1, 2, 3, -1, -2, -3].forEach(d => { const v = correctValue + d; if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctValue, ...distractors]).map(v => `${v}人`);
  const correctText = `${correctValue}人`;

  const explanation = `${labelA}好き＝${a}人、${labelB}好き＝${b}人、両方好き＝${x}人なので、${labelA}だけ＝${a}－${x}＝${onlyA}人、${labelB}だけ＝${b}－${x}＝${onlyB}人、少なくとも一方＝${onlyA}＋${onlyB}＋${x}＝${unionCount}人、どちらも好きではない＝全体${total}人－${unionCount}人＝${neither}人となる。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

function buildSets3Problem(p) {
  const base = Math.max(4, Math.round(p.totalMax * 0.06));
  const onlyA = randInt(base, base * 2);
  const onlyB = randInt(base, base * 2);
  const onlyC = randInt(base, base * 2);
  const ab = randInt(3, base);
  const bc = randInt(3, base);
  const ac = randInt(3, base);
  const abc = randInt(2, Math.max(3, Math.round(base * 0.5)));
  const none = randInt(5, Math.max(6, Math.round(p.totalMax * 0.12)));

  const A = onlyA + ab + ac + abc;
  const B = onlyB + ab + bc + abc;
  const C = onlyC + ac + bc + abc;
  const AB = ab + abc, BC = bc + abc, AC = ac + abc;
  const atLeastOne = onlyA + onlyB + onlyC + ab + bc + ac + abc;
  const exactlyTwo = ab + bc + ac;
  const exactlyOne = onlyA + onlyB + onlyC;
  const total = atLeastOne + none;

  const [labelA, labelB, labelC] = pick(SETS_TOPIC_TRIOS);
  const kind = pick(['exactlyTwo', 'none', 'atLeastOne', 'exactlyOne']);
  const values = { exactlyTwo, none, atLeastOne, exactlyOne };
  const questionTexts = {
    exactlyTwo: 'ちょうど2つの項目が好きな人は何人か。',
    none: '3つのうちどれも好きではない人は何人か。',
    atLeastOne: '少なくとも1つが好きな人は何人か。',
    exactlyOne: 'ちょうど1つだけ好きな人は何人か。',
  };
  const correctValue = values[kind];

  const prompt = `あるグループ${total}人にアンケートを取ったところ、${labelA}が好きな人は${A}人、${labelB}が好きな人は${B}人、${labelC}が好きな人は${C}人、${labelA}と${labelB}の両方が好きな人は${AB}人、${labelB}と${labelC}の両方が好きな人は${BC}人、${labelA}と${labelC}の両方が好きな人は${AC}人、3つとも好きな人は${abc}人だった。${questionTexts[kind]}`;

  const distractorPool = new Set();
  Object.values(values).forEach(v => { if (v !== correctValue && v > 0) distractorPool.add(v); });
  [1, 2, 3, -1, -2, -3].forEach(d => { const v = correctValue + d; if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctValue, ...distractors]).map(v => `${v}人`);
  const correctText = `${correctValue}人`;

  const explanation = `ちょうど2つ＝(${labelA}∩${labelB})＋(${labelB}∩${labelC})＋(${labelA}∩${labelC})－3×(3つとも)＝${AB}＋${BC}＋${AC}－3×${abc}＝${exactlyTwo}人。少なくとも1つ＝${A}＋${B}＋${C}－${AB}－${BC}－${AC}＋${abc}＝${atLeastOne}人。ちょうど1つ＝少なくとも1つ－ちょうど2つ－3つとも＝${atLeastOne}－${exactlyTwo}－${abc}＝${exactlyOne}人。どれも好きではない＝全体${total}人－少なくとも1つ${atLeastOne}人＝${none}人。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

function generateSetsProblem(examType, difficulty) {
  const p = NUMERIC_PARAMS.sets[examType][difficulty];
  if (p.use3 && Math.random() < 0.6) return buildSets3Problem(p);
  return buildSets2Problem(p);
}

/* ---------- 場合の数 ---------- */
function generatePncProblem(examType, difficulty) {
  const p = NUMERIC_PARAMS.pnc[examType][difficulty];
  const n = randInt(p.nMin, p.nMax);
  const variantPool = difficulty === 'mid' ? ['perm', 'comb'] : ['perm', 'comb', 'adjacent', 'circular', 'twoStage'];
  const variant = pick(variantPool);

  let prompt, correctValue, explanation;

  if (variant === 'perm') {
    const r = randInt(2, Math.min(n - 1, 4));
    correctValue = nPr(n, r);
    const terms = Array.from({ length: r }, (_, i) => n - i);
    prompt = `${n}人の中から${r}人を選んで一列に並べる方法は何通りあるか。`;
    explanation = `${n}人から${r}人を選んで並べる順列なので、${n}P${r}＝${terms.join('×')}＝${correctValue}通り。`;
  } else if (variant === 'comb') {
    const r = randInt(2, Math.min(n - 1, 5));
    correctValue = nCr(n, r);
    prompt = `${n}人の中から${r}人を選ぶ方法は何通りあるか。`;
    explanation = `${n}人から${r}人を選ぶ組み合わせなので、${n}C${r}＝${n}P${r}÷${r}!＝${correctValue}通り。`;
  } else if (variant === 'adjacent') {
    correctValue = factorial(n - 1) * 2;
    prompt = `${n}人が一列に並ぶとき、特定の2人が隣り合う並び方は何通りあるか。`;
    explanation = `隣り合う2人を1つのブロックとみなすと、残り${n - 2}人とブロックの計${n - 1}個を並べる方法は${n - 1}!通り。ブロック内の2人の並び方が2通りあるので、${n - 1}!×2＝${correctValue}通り。`;
  } else if (variant === 'circular') {
    correctValue = factorial(n - 1);
    prompt = `${n}人が円卓に並ぶ方法は何通りあるか（回転して同じ並びになるものは1通りとみなす）。`;
    explanation = `円順列は(人数－1)!で求められるので、(${n} － 1)!＝${correctValue}通り。`;
  } else {
    const m = randInt(4, 6);
    const f = randInt(3, 5);
    const a = randInt(1, Math.min(2, m));
    const b = randInt(1, Math.min(2, f));
    correctValue = nCr(m, a) * nCr(f, b) * factorial(a + b);
    prompt = `男性${m}人、女性${f}人の中から、男性${a}人・女性${b}人の合計${a + b}人を選んで一列に並べる方法は何通りあるか。`;
    explanation = `男性の選び方は${m}C${a}＝${nCr(m, a)}通り、女性の選び方は${f}C${b}＝${nCr(f, b)}通り。選んだ${a + b}人の並べ方は${a + b}!＝${factorial(a + b)}通りなので、${nCr(m, a)}×${nCr(f, b)}×${factorial(a + b)}＝${correctValue}通り。`;
  }

  const distractorPool = new Set();
  [0.25, 0.5, 2, 4].forEach(k => { const v = Math.round(correctValue * k); if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const step = Math.max(1, Math.round(correctValue * 0.1));
  [step, -step, step * 2, -step * 2].forEach(d => { const v = correctValue + d; if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctValue, ...distractors]).map(v => `${v}通り`);
  const correctText = `${correctValue}通り`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

/* ---------- 確率 ---------- */
function generateProbabilityProblem(examType, difficulty) {
  const p = NUMERIC_PARAMS.probability[examType][difficulty];
  const tier = `${examType}-${difficulty}`;
  const variant = pick(['balls', 'dice', 'lottery']);
  let prompt, fracNum, fracDen, explanation;

  if (variant === 'balls') {
    const rMin = Math.max(2, Math.round(p.poolMin * 0.3));
    const red = randInt(rMin, Math.round(p.poolMax * 0.5));
    const white = randInt(rMin, Math.round(p.poolMax * 0.5));
    const totalBalls = red + white;
    const draw = 2;
    const kind = pick(['bothRed', 'oneEach']);
    const denom = nCr(totalBalls, draw);
    if (kind === 'bothRed') {
      fracNum = nCr(red, 2);
      fracDen = denom;
      prompt = `赤玉${red}個、白玉${white}個が入った袋から玉を同時に2個取り出すとき、2個とも赤玉である確率を求めよ。`;
      explanation = `全体から2個選ぶ方法は${totalBalls}C2＝${denom}通り。赤玉2個を選ぶ方法は${red}C2＝${nCr(red, 2)}通りなので、確率は${nCr(red, 2)}/${denom}。`;
    } else {
      fracNum = red * white;
      fracDen = denom;
      prompt = `赤玉${red}個、白玉${white}個が入った袋から玉を同時に2個取り出すとき、赤玉と白玉が1個ずつである確率を求めよ。`;
      explanation = `全体から2個選ぶ方法は${totalBalls}C2＝${denom}通り。赤玉1個・白玉1個を選ぶ方法は${red}×${white}＝${red * white}通りなので、確率は${red * white}/${denom}。`;
    }
  } else if (variant === 'dice') {
    if (tier === 'H-mid') {
      // 中級（SPI-H）：サイコロ1つの単純な事象
      const kind = pick(['exact', 'atLeast', 'atMost']);
      const target = randInt(1, 6);
      let count, condText;
      if (kind === 'exact') { count = 1; condText = `${target}である`; }
      else if (kind === 'atLeast') { count = 6 - target + 1; condText = `${target}以上である`; }
      else { count = target; condText = `${target}以下である`; }
      fracNum = count;
      fracDen = 6;
      prompt = `1つのサイコロを1回投げるとき、出た目が${condText}確率を求めよ。`;
      explanation = `目の出方は全部で6通り。条件に合う目は${count}通りなので、確率は${count}/6。`;
    } else if (tier === 'H-high' || tier === 'U-mid') {
      // 上級（SPI-H）／中級（SPI-U）：サイコロ2つの和がちょうど◯になる確率
      const targetPool = tier === 'H-high' ? [5, 6, 7, 8, 9] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const target = pick(targetPool);
      let count = 0;
      for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) if (i + j === target) count++;
      fracNum = count;
      fracDen = 36;
      prompt = `大小2つのサイコロを同時に振るとき、出た目の和が${target}になる確率を求めよ。`;
      explanation = `目の出方は全部で6×6＝36通り。和が${target}になる組み合わせは${count}通りなので、確率は${count}/36。`;
    } else {
      // 上級（SPI-U）：範囲条件（複数の和をまとめて数える、最も手間がかかるパターン）
      const kind = pick(['atLeast', 'atMost']);
      const target = kind === 'atLeast' ? randInt(8, 10) : randInt(5, 7);
      let count = 0;
      for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) {
        if (kind === 'atLeast' ? i + j >= target : i + j <= target) count++;
      }
      fracNum = count;
      fracDen = 36;
      const condText = kind === 'atLeast' ? `${target}以上になる` : `${target}以下になる`;
      prompt = `大小2つのサイコロを同時に振るとき、出た目の和が${condText}確率を求めよ。`;
      explanation = `目の出方は全部で6×6＝36通り。条件に合う組み合わせを和ごとに数え上げると${count}通りなので、確率は${count}/36。`;
    }
  } else {
    const total = randInt(p.poolMin, p.poolMax);
    const winMin = Math.max(2, Math.round(p.poolMin * 0.15));
    const win = randInt(winMin, Math.max(winMin + 1, Math.round(total * 0.4)));
    const denom = total;
    const kind = pick(['firstWin', 'twoWins']);
    if (kind === 'firstWin') {
      fracNum = win;
      fracDen = denom;
      prompt = `${total}本のくじの中に当たりくじが${win}本入っている。この中から1本引くとき、当たる確率を求めよ。`;
      explanation = `当たりくじは${win}本、くじは全部で${total}本なので、確率は${win}/${total}。`;
    } else {
      fracNum = nCr(win, 2);
      fracDen = nCr(total, 2);
      prompt = `${total}本のくじの中に当たりくじが${win}本入っている。この中から同時に2本引くとき、2本とも当たる確率を求めよ。`;
      explanation = `2本の引き方は全部で${total}C2＝${nCr(total, 2)}通り。当たり2本を引く方法は${win}C2＝${nCr(win, 2)}通りなので、確率は${nCr(win, 2)}/${nCr(total, 2)}。`;
    }
  }

  const correct = reduceFraction(fracNum, fracDen);
  const correctText = `${correct.num}/${correct.den}`;
  const distractorPool = new Set();
  [[correct.num + 1, correct.den], [correct.num - 1, correct.den], [correct.num, correct.den + 1], [correct.num, correct.den - 1], [correct.num + 1, correct.den + 1]].forEach(([n, d]) => {
    if (n > 0 && d > 0 && n <= d) { const r = reduceFraction(n, d); const t = `${r.num}/${r.den}`; if (t !== correctText) distractorPool.add(t); }
  });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctText, ...distractors]);

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

/* ---------- 損益算 ---------- */
function generateProfitProblem(examType, difficulty) {
  const p = NUMERIC_PARAMS.profit[examType][difficulty];
  const k = randInt(p.kMin, p.kMax);
  const cost = 400 * k;
  const m5 = randInt(2, 10); // 利益率 10%〜50%（5%刻み）
  const markupPct = m5 * 5;
  const listPrice = cost * (20 + m5) / 20;

  let prompt, correctValue, unit, explanation;

  if (p.twoStage) {
    // 割引率が利益率を打ち消して損失（マイナスの利益）になってしまうと、
    // 「利益はいくらか」という設問として破綻する（選択肢も作れない）ため、
    // 必ず正の利益が残る範囲に割引率の上限を絞る。
    const maxD5 = Math.min(6, Math.floor(20 - 400 / (20 + m5) - 1e-9));
    const d5 = randInt(1, Math.max(1, maxD5)); // 割引率 5%〜30%（5%刻み、利益が残る範囲）
    const discountPct = d5 * 5;
    const sellPrice = listPrice * (20 - d5) / 20;
    const profit = sellPrice - cost;
    const kind = pick(['sellPrice', 'profit']);
    if (kind === 'sellPrice') {
      correctValue = sellPrice; unit = '円';
      prompt = `原価${cost}円の商品に${markupPct}％の利益を見込んで定価をつけたが、売れなかったため定価の${discountPct}％引きで販売した。売った価格はいくらか。`;
      explanation = `定価＝${cost}×(1＋${markupPct}/100)＝${listPrice}円。売価＝定価×(1－${discountPct}/100)＝${listPrice}×(1－${discountPct}/100)＝${sellPrice}円。`;
    } else {
      correctValue = profit; unit = '円';
      prompt = `原価${cost}円の商品に${markupPct}％の利益を見込んで定価をつけたが、売れなかったため定価の${discountPct}％引きで販売した。この販売による利益（原価との差額）はいくらか。`;
      explanation = `定価＝${cost}×(1＋${markupPct}/100)＝${listPrice}円。売価＝${listPrice}×(1－${discountPct}/100)＝${sellPrice}円。利益＝売価－原価＝${sellPrice}－${cost}＝${profit}円。`;
    }
  } else {
    const kind = pick(['listPrice', 'cost']);
    if (kind === 'listPrice') {
      correctValue = listPrice; unit = '円';
      prompt = `原価${cost}円の商品に、原価の${markupPct}％の利益を見込んで定価をつけた。定価はいくらか。`;
      explanation = `定価＝原価×(1＋利益率)＝${cost}×(1＋${markupPct}/100)＝${listPrice}円。`;
    } else {
      correctValue = cost; unit = '円';
      prompt = `ある商品に原価の${markupPct}％の利益を見込んで定価${listPrice}円をつけた。この商品の原価はいくらか。`;
      explanation = `定価＝原価×(1＋利益率)なので、原価＝定価÷(1＋利益率)＝${listPrice}÷(1＋${markupPct}/100)＝${cost}円。`;
    }
  }

  const distractorPool = new Set();
  [0.8, 0.9, 1.1, 1.2].forEach(r => { const v = Math.round(correctValue * r); if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const step = Math.max(10, Math.round(correctValue * 0.05 / 10) * 10);
  [step, -step, step * 2, -step * 2].forEach(d => { const v = correctValue + d; if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctValue, ...distractors]).map(v => `${v}${unit}`);
  const correctText = `${correctValue}${unit}`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

/* ---------- 割合・増加率 ---------- */
function generateRatioProblem(examType, difficulty) {
  const p = NUMERIC_PARAMS.ratio[examType][difficulty];
  const base = 20 * randInt(p.scaleMin, p.scaleMax);
  const m = randInt(1, 19); // 5%刻みの割合（5%〜95%）
  const pct = m * 5;
  const part = (base / 20) * m;

  const variant = pick(['forward', 'backward', 'increase']);
  let prompt, correctValue, unit, explanation;

  if (variant === 'forward') {
    correctValue = part; unit = '人';
    prompt = `定員${base}人のイベントに、定員の${pct}％が出席した。出席者は何人か。`;
    explanation = `出席者＝定員×割合＝${base}×${pct}/100＝${part}人。`;
  } else if (variant === 'backward') {
    correctValue = base; unit = '人';
    prompt = `あるイベントの出席者数は${part}人で、これは定員の${pct}％にあたる。定員は何人か。`;
    explanation = `定員＝出席者数÷割合＝${part}÷(${pct}/100)＝${base}人。`;
  } else {
    const r = randInt(1, 19);
    const ratePct = r * 5;
    const newValue = base + (base / 20) * r;
    const kind = pick(['toNew', 'toOld']);
    if (kind === 'toNew') {
      correctValue = newValue; unit = '円';
      prompt = `ある商品の価格は去年${base}円で、今年は去年より${ratePct}％値上がりした。今年の価格はいくらか。`;
      explanation = `今年の価格＝去年の価格×(1＋増加率)＝${base}×(1＋${ratePct}/100)＝${newValue}円。`;
    } else {
      correctValue = base; unit = '円';
      prompt = `ある商品の価格は今年${newValue}円で、これは去年より${ratePct}％値上がりした結果である。去年の価格はいくらか。`;
      explanation = `今年の価格＝去年の価格×(1＋増加率)なので、去年の価格＝今年の価格÷(1＋増加率)＝${newValue}÷(1＋${ratePct}/100)＝${base}円。`;
    }
  }

  const distractorPool = new Set();
  [0.8, 0.9, 1.1, 1.2].forEach(r => { const v = Math.round(correctValue * r); if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const step = Math.max(1, Math.round(correctValue * 0.08));
  [step, -step, step * 2, -step * 2].forEach(d => { const v = correctValue + d; if (v > 0 && v !== correctValue) distractorPool.add(v); });
  const distractors = shuffle([...distractorPool]).slice(0, 3);
  const choices = shuffle([correctValue, ...distractors]).map(v => `${v}${unit}`);
  const correctText = `${correctValue}${unit}`;

  return { prompt, choices, correctIndex: choices.indexOf(correctText), explanation };
}

/* ============================================================
   9. 資料解釈
   ============================================================ */
const DATA_THEMES = [
  { metric: '売上高', unit: '万円', rowLabel: '店舗', pool: ['渋谷店', '新宿店', '池袋店', '横浜店', '大宮店', '千葉店', '川崎店'], min: 200, max: 600 },
  { metric: '人口', unit: '万人', rowLabel: '都市', pool: ['A市', 'B市', 'C市', 'D市', 'E市', 'F市', 'G市'], min: 20, max: 150 },
  { metric: '売上高', unit: '億円', rowLabel: '部門', pool: ['営業部門', '開発部門', '製造部門', '物流部門', '企画部門', '広報部門', '管理部門'], min: 10, max: 80 },
  { metric: '輸出額', unit: '億円', rowLabel: '国', pool: ['A国', 'B国', 'C国', 'D国', 'E国', 'F国', 'G国'], min: 50, max: 400 },
  { metric: '販売数', unit: '個', rowLabel: '商品', pool: ['商品A', '商品B', '商品C', '商品D', '商品E', '商品F', '商品G'], min: 1000, max: 8000 },
  { metric: '来店者数', unit: '人', rowLabel: '支店', pool: ['東支店', '西支店', '南支店', '北支店', '中央支店', '新設支店', '海外支店'], min: 300, max: 2000 },
];

function generateDataProblem(examType, difficulty) {
  const { dataRows } = paramsFor(examType, difficulty, 'data');
  const theme = pick(DATA_THEMES);
  const stores = shuffle(theme.pool).slice(0, dataRows);
  const years = ['2022年', '2023年', '2024年'];
  const table = stores.map(() => [randInt(theme.min, theme.max), 0, 0]);
  table.forEach(row => {
    row[1] = Math.max(Math.round(theme.min * 0.3), Math.round(row[0] * (0.8 + Math.random() * 0.6)));
    row[2] = Math.max(Math.round(theme.min * 0.3), Math.round(row[1] * (0.8 + Math.random() * 0.6)));
  });
  const tableHTML = buildTableHTML(years, stores, table, theme.rowLabel);
  const type = Math.random() < 0.5 ? 'growth' : 'share';
  let prompt, choices, correctIndex, explanation;

  if (type === 'growth') {
    const growth = table.map(row => (row[2] - row[1]) / row[1] * 100);
    let bestIdx = 0;
    for (let i = 1; i < growth.length; i++) if (growth[i] > growth[bestIdx]) bestIdx = i;
    const correctAnswer = stores[bestIdx];
    const distractors = shuffle(stores.filter(s => s !== correctAnswer)).slice(0, Math.min(3, dataRows - 1));
    choices = shuffle([correctAnswer, ...distractors]);
    correctIndex = choices.indexOf(correctAnswer);
    prompt = `次の表は各${theme.rowLabel}の${theme.metric}（単位：${theme.unit}）の推移を示している。${years[1]}から${years[2]}にかけて、対前年増加率が最も高いのはどの${theme.rowLabel}か。`;
    explanation = `各${theme.rowLabel}の増加率は ${stores.map((s, i) => `${s}：${growth[i].toFixed(1)}%`).join('、')} であり、最も高いのは${correctAnswer}（${growth[bestIdx].toFixed(1)}%）。`;
  } else {
    const targetIdx = randInt(0, dataRows - 1);
    const total = table.reduce((sum, row) => sum + row[2], 0);
    const exact = table[targetIdx][2] / total * 100;
    const correctText = `${exact.toFixed(1)}%`;
    const usedVals = new Set([exact.toFixed(1)]);
    const distractorTexts = [];
    while (distractorTexts.length < 3) {
      const offset = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 8);
      const val = Math.max(0.5, exact + offset);
      const text = val.toFixed(1);
      if (usedVals.has(text)) continue;
      usedVals.add(text);
      distractorTexts.push(`${text}%`);
    }
    choices = shuffle([correctText, ...distractorTexts]);
    correctIndex = choices.indexOf(correctText);
    prompt = `次の表は各${theme.rowLabel}の${theme.metric}（単位：${theme.unit}）を示している。${stores[targetIdx]}の${years[2]}の${theme.metric}は、${years[2]}における全${theme.rowLabel}合計に占める割合として、最も近いものはどれか。`;
    explanation = `${years[2]}の全${theme.rowLabel}合計は${total}${theme.unit}、${stores[targetIdx]}は${table[targetIdx][2]}${theme.unit}であるため、割合は${table[targetIdx][2]}÷${total}×100 ≒ ${exact.toFixed(1)}%となる。`;
  }

  return { prompt, choices, correctIndex, explanation, tableHTML };
}

/* ------------------------- ディスパッチャ ------------------------- */
function generateProblem(category, examType, difficulty) {
  let base;
  switch (category) {
    case 'order': base = generateOrderProblem(examType, difficulty); break;
    case 'matching': base = generateMatchingProblem(examType, difficulty); break;
    case 'position': base = generatePositionProblem(examType, difficulty); break;
    case 'truth': base = generateTruthProblem(examType, difficulty); break;
    case 'logic': base = generateLogicProblem(examType, difficulty); break;
    case 'match': base = generateMatchProblem(examType, difficulty); break;
    case 'flow': base = generateFlowProblem(examType, difficulty); break;
    case 'sets': base = generateSetsProblem(examType, difficulty); break;
    case 'pnc': base = generatePncProblem(examType, difficulty); break;
    case 'probability': base = generateProbabilityProblem(examType, difficulty); break;
    case 'profit': base = generateProfitProblem(examType, difficulty); break;
    case 'ratio': base = generateRatioProblem(examType, difficulty); break;
    case 'data': base = generateDataProblem(examType, difficulty); break;
  }
  // 判断推理はU/Hで難易度を揃えたため時間ボーナスも付けない。資料解釈と数的推理（集合・
  // 場合の数・確率・損益算・割合）は、SPI-Uのほうが数値の規模や計算段階が多くなる設計に
  // したため、SPI-Hに少し時間の余裕を持たせている。
  const H_BONUS_CATEGORIES = new Set(['data', 'sets', 'pnc', 'probability', 'profit', 'ratio']);
  const timeLimit = TIME_BASE[category][difficulty] + (examType === 'H' && H_BONUS_CATEGORIES.has(category) ? 10 : 0) + (base.extraTime || 0);
  return { category, categoryLabel: CATEGORY_LABEL[category], examType, difficulty, timeLimit, ...base };
}

function buildCategoryPlan(selected, count) {
  const repeated = [];
  while (repeated.length < count) repeated.push(...shuffle(selected));
  return shuffle(repeated.slice(0, count));
}

function buildSession(selectedCategories, count, examType, difficulty) {
  const plan = buildCategoryPlan(selectedCategories, count);
  const used = new Set();
  const session = [];
  for (const cat of plan) {
    let problem, tries = 0;
    do {
      problem = generateProblem(cat, examType, difficulty);
      tries++;
    } while (used.has(problem.prompt) && tries < 10);
    used.add(problem.prompt);
    session.push(problem);
  }
  return session;
}

/* =============================================================
   アプリ本体（状態管理・描画・タイマー）
   ============================================================= */
(function () {
  const DIAL_CIRCUMFERENCE = 2 * Math.PI * 26;

  const el = (id) => document.getElementById(id);
  const screenSettings = el('screen-settings');
  const screenQuiz = el('screen-quiz');
  const screenResult = el('screen-result');

  let session = [];
  let currentIdx = 0;
  let records = [];
  let timerHandle = null;
  let remaining = 0;
  let total = 0;

  /* ---------- 中断コントロール ---------- */
  // 動的に生成するボタンでも確実に視認できるよう、専用のスタイルを1回だけ差し込む
  if (!document.getElementById('abort-btn-style')) {
    const style = document.createElement('style');
    style.id = 'abort-btn-style';
    style.textContent = `
      .abort-btn-wrap { display: flex; justify-content: flex-end; margin: 0 0 16px; }
      .abort-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 16px; font-size: 0.9rem; font-weight: 600; line-height: 1;
        color: #b91c1c; background: #fef2f2; border: 1.5px solid #f87171;
        border-radius: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.06);
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .abort-btn:hover { background: #fee2e2; border-color: #ef4444; }
      .abort-btn:active { background: #fecaca; }
    `;
    document.head.appendChild(style);
  }

  // HTML側に #abort-btn が用意されていればそれを使い、なければ動的に生成して挿入する
  let abortBtn = el('abort-btn');
  if (!abortBtn) {
    abortBtn = document.createElement('button');
    abortBtn.id = 'abort-btn';
    abortBtn.type = 'button';
    abortBtn.className = 'abort-btn';
    abortBtn.textContent = '■ 中断する';
    const wrap = document.createElement('div');
    wrap.className = 'abort-btn-wrap';
    wrap.appendChild(abortBtn);
    screenQuiz.insertBefore(wrap, screenQuiz.firstChild);
  }
  abortBtn.addEventListener('click', () => {
    if (records.length === 0) {
      if (!confirm('まだ1問も回答していません。中断して設定画面に戻りますか？')) return;
      clearInterval(timerHandle);
      screenQuiz.hidden = true;
      screenResult.hidden = true;
      screenSettings.hidden = false;
      return;
    }
    if (!confirm(`ここまで${records.length}問（全${session.length}問中）回答しています。中断してここまでの結果を見ますか？`)) return;
    clearInterval(timerHandle);
    showResults();
  });

  /* ---------- 設定画面の描画 ---------- */
  function renderCategoryGrid() {
    const grid = el('category-grid');
    grid.innerHTML = '';
    CATEGORY_GROUPS.forEach(group => {
      const cats = CATEGORIES.filter(c => c.group === group.id && c.enabled !== false);
      if (cats.length === 0) return; // 学校側でグループ内を全て非公開にした場合は見出しごと非表示

      const section = document.createElement('div');
      section.className = 'category-group';

      const header = document.createElement('div');
      header.className = 'category-group-header';
      const title = document.createElement('span');
      title.className = 'category-group-title';
      title.innerHTML = `${group.label}<small>（${cats.length}分野）</small>`;
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'category-group-toggle';
      toggleBtn.textContent = '全て解除';
      header.appendChild(title);
      header.appendChild(toggleBtn);
      section.appendChild(header);

      const cardsWrap = document.createElement('div');
      cardsWrap.className = 'category-grid-inner';
      cats.forEach(cat => {
        const label = document.createElement('label');
        label.className = 'category-card';
        label.innerHTML = `
          <input type="checkbox" name="category" value="${cat.id}" checked>
          <span><strong>${cat.label}</strong><p>${cat.desc}</p></span>
        `;
        cardsWrap.appendChild(label);
      });
      section.appendChild(cardsWrap);
      grid.appendChild(section);

      toggleBtn.addEventListener('click', () => {
        const boxes = Array.from(cardsWrap.querySelectorAll('input[type="checkbox"]'));
        const allChecked = boxes.every(cb => cb.checked);
        boxes.forEach(cb => { cb.checked = !allChecked; });
        toggleBtn.textContent = allChecked ? '全て選択' : '全て解除';
      });
    });
  }
  renderCategoryGrid();

  const countSlider = el('question-count');
  const countValue = el('question-count-value');
  countSlider.addEventListener('input', () => { countValue.textContent = countSlider.value; });

  el('start-btn').addEventListener('click', () => {
    const examType = document.querySelector('input[name="examType"]:checked').value;
    const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    const selectedCategories = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(i => i.value);
    const count = parseInt(countSlider.value, 10);

    if (selectedCategories.length === 0) {
      el('settings-error').hidden = false;
      return;
    }
    el('settings-error').hidden = true;

    session = buildSession(selectedCategories, count, examType, difficulty);
    records = [];
    currentIdx = 0;

    renderStampTrack(session.length);
    screenSettings.hidden = true;
    screenResult.hidden = true;
    screenQuiz.hidden = false;
    loadQuestion(0);
  });

  /* ---------- スタンプトラック ---------- */
  function renderStampTrack(count) {
    const track = el('stamp-track');
    track.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = 'stamp-dot' + (i === 0 ? ' current' : '');
      dot.id = `stamp-${i}`;
      track.appendChild(dot);
    }
  }
  function markStamp(idx, correct) {
    const dot = el(`stamp-${idx}`);
    if (!dot) return;
    dot.classList.remove('current');
    dot.classList.add(correct ? 'done-correct' : 'done-wrong');
    const next = el(`stamp-${idx + 1}`);
    if (next) next.classList.add('current');
  }

  /* ---------- 出題 ---------- */
  function loadQuestion(idx) {
    const problem = session[idx];
    el('q-current').textContent = idx + 1;
    el('q-total').textContent = session.length;
    el('q-category-tag').textContent = problem.categoryLabel;
    el('q-exam-tag').textContent = `SPI-${problem.examType} ／ ${problem.difficulty === 'mid' ? '中級' : '上級'}`;
    el('q-prompt').textContent = problem.prompt;

    const tableWrap = el('q-table-wrap');
    if (problem.tableHTML) {
      tableWrap.innerHTML = problem.tableHTML;
      tableWrap.hidden = false;
    } else {
      tableWrap.innerHTML = '';
      tableWrap.hidden = true;
    }

    const list = el('bubble-list');
    list.innerHTML = '';
    problem.choices.forEach((choiceText, i) => {
      const btn = document.createElement('button');
      btn.className = 'bubble-item';
      btn.innerHTML = `<span class="bubble-mark">${String.fromCharCode(65 + i)}</span><span>${choiceText}</span>`;
      btn.addEventListener('click', () => handleAnswer(i));
      list.appendChild(btn);
    });

    el('explanation-panel').hidden = true;
    startTimer(problem.timeLimit);
  }

  /* ---------- タイマー ---------- */
  function startTimer(seconds) {
    clearInterval(timerHandle);
    total = seconds;
    remaining = seconds;
    updateDial();
    timerHandle = setInterval(() => {
      remaining -= 1;
      updateDial();
      if (remaining <= 0) {
        clearInterval(timerHandle);
        handleTimeout();
      }
    }, 1000);
  }
  function updateDial() {
    el('timer-readout').textContent = Math.max(0, remaining);
    const fraction = Math.max(0, remaining) / total;
    const dial = el('dial-progress');
    dial.style.strokeDashoffset = DIAL_CIRCUMFERENCE * (1 - fraction);
    dial.classList.toggle('warn', fraction <= 0.2);
  }

  /* ---------- 解答処理 ---------- */
  function finalizeQuestion(selectedIdx, timedOut) {
    clearInterval(timerHandle);
    const problem = session[currentIdx];
    const buttons = Array.from(document.querySelectorAll('#bubble-list .bubble-item'));
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === problem.correctIndex) btn.classList.add('correct-answer');
      if (i === selectedIdx && i !== problem.correctIndex) btn.classList.add('wrong-answer');
      if (i === selectedIdx) btn.classList.add('selected');
    });

    const isCorrect = selectedIdx === problem.correctIndex;
    records.push({ problem, chosenIdx: timedOut ? null : selectedIdx, correct: isCorrect, timeUsed: total - Math.max(0, remaining) });
    markStamp(currentIdx, isCorrect);

    const panel = el('explanation-panel');
    const verdict = el('explanation-verdict');
    verdict.textContent = timedOut ? '時間切れ（不正解扱い）' : (isCorrect ? '正解！' : '不正解');
    verdict.className = 'explanation-verdict ' + (isCorrect ? 'is-correct' : 'is-wrong');
    el('explanation-body').textContent = problem.explanation;
    panel.hidden = false;

    const nextBtn = el('next-btn');
    nextBtn.textContent = currentIdx + 1 < session.length ? '次の問題へ' : '結果を見る';
  }
  function handleAnswer(selectedIdx) { finalizeQuestion(selectedIdx, false); }
  function handleTimeout() { finalizeQuestion(-1, true); }

  el('next-btn').addEventListener('click', () => {
    currentIdx += 1;
    if (currentIdx < session.length) {
      loadQuestion(currentIdx);
    } else {
      showResults();
    }
  });

  /* ---------- 結果画面 ---------- */
  function showResults() {
    screenQuiz.hidden = true;
    screenResult.hidden = false;

    const correctCount = records.filter(r => r.correct).length;
    el('score-correct').textContent = correctCount;
    el('score-total').textContent = records.length;

    const ratio = correctCount / records.length;
    let caption = 'お疲れさまでした。';
    if (ratio === 1) caption = '全問正解！本試験でも自信を持って臨めます。';
    else if (ratio >= 0.8) caption = '好調です。取りこぼした分野だけ復習しましょう。';
    else if (ratio >= 0.5) caption = 'あと一歩。苦手分野を重点的に復習しましょう。';
    else caption = '基礎の解き方から見直すのがおすすめです。';
    if (records.length < session.length) {
      caption += `（全${session.length}問中${records.length}問で中断）`;
    }
    el('score-caption').textContent = caption;

    const byCategory = {};
    records.forEach(r => {
      const c = r.problem.categoryLabel;
      if (!byCategory[c]) byCategory[c] = { correct: 0, total: 0 };
      byCategory[c].total += 1;
      if (r.correct) byCategory[c].correct += 1;
    });
    const breakdown = el('category-breakdown');
    breakdown.innerHTML = '';
    Object.entries(byCategory).forEach(([label, stat]) => {
      const div = document.createElement('div');
      div.className = 'breakdown-item';
      div.innerHTML = `<strong>${label}</strong><span>${stat.correct} / ${stat.total}</span>`;
      breakdown.appendChild(div);
    });

    const reviewList = el('review-list');
    reviewList.innerHTML = '';
    records.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'review-item';
      const yourAns = r.chosenIdx === null || r.chosenIdx < 0 ? '（未回答／時間切れ）' : r.problem.choices[r.chosenIdx];
      const correctAns = r.problem.choices[r.problem.correctIndex];
      div.innerHTML = `
        <div class="review-head">
          <span>問${i + 1} ／ ${r.problem.categoryLabel} ／ ${r.timeUsed}s 使用</span>
          <span class="review-verdict ${r.correct ? 'ok' : ''}">${r.correct ? '正解' : '不正解'}</span>
        </div>
        <p class="review-q">${r.problem.prompt}</p>
        <p class="review-ans">あなたの解答：${yourAns} ／ 正答：${correctAns}</p>
      `;
      reviewList.appendChild(div);
    });
  }

  el('retry-btn').addEventListener('click', () => {
    screenResult.hidden = true;
    screenSettings.hidden = false;
  });
})();
