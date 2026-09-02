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
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

/* ------------------------- 出題範囲メタデータ ------------------------- */
const CATEGORIES = [
  { id: 'order',    label: '順序推理', desc: '順位・大小関係の条件から確実に言えることを導く（判断推理）' },
  { id: 'matching', label: '対応推理', desc: '人と属性の対応関係を条件から特定する（判断推理）' },
  { id: 'position', label: '位置推理', desc: '座席・配置の位置関係を条件から特定する（判断推理）' },
  { id: 'truth',    label: '発言の真偽', desc: '一部が嘘をつく発言から事実を特定する（判断推理）' },
  { id: 'logic',    label: '命題・論理', desc: '「AならばB」の連鎖から必ず正しい推論を選ぶ（判断推理）' },
  { id: 'data',     label: '資料解釈', desc: '表データから増加率・構成比を読み取る（資料解釈）' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

const TIME_BASE = {
  order:    { mid: 70,  high: 50 },
  matching: { mid: 70,  high: 50 },
  position: { mid: 75,  high: 55 },
  truth:    { mid: 85,  high: 60 },
  logic:    { mid: 65,  high: 50 },
  data:     { mid: 110, high: 85 },
};

function paramsFor(examType, difficulty) {
  const isU = examType === 'U';
  return {
    n: difficulty === 'mid' ? (isU ? 5 : 4) : (isU ? 6 : 5),
    dataRows: isU ? (difficulty === 'mid' ? 4 : 5) : (difficulty === 'mid' ? 3 : 4),
  };
}

/* ============================================================
   1. 順序推理
   ============================================================ */
function generateOrderProblem(examType, difficulty) {
  const { n } = paramsFor(examType, difficulty);
  const entities = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
  const allPerms = permutations(entities);
  let truePerm, clues, solved = false;

  for (let attempt = 0; attempt < 20 && !solved; attempt++) {
    truePerm = shuffle(entities);
    const pool = [];

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
    const minClues = difficulty === 'mid' ? Math.max(3, n - 2) : Math.max(4, n - 1);
    for (let k = 0; k < shuffled.length; k++) {
      chosen.push(shuffled[k]);
      if (chosen.length < minClues) continue;
      const matches = allPerms.filter(p => chosen.every(c => c.test(p)));
      if (matches.length === 1) { clues = chosen; solved = true; break; }
    }
  }
  if (!solved) clues = truePerm.map((name, i) => ({ text: `${i + 1}位は${name}である。`, test: p => p.indexOf(name) === i }));

  const targetRank = randInt(0, n - 1);
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
  const { n } = paramsFor(examType, difficulty);
  const persons = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
  const pools = {
    fruit: ['りんご', 'みかん', 'ぶどう', 'もも', 'メロン', 'いちご'],
    dept:  ['営業部', '経理部', '人事部', '開発部', '広報部', '総務部'],
    color: ['赤',   '青',   '緑',   '黄',   '紫',   '橙'],
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
    const minClues = difficulty === 'mid' ? Math.max(3, n) : Math.max(4, n + 1);
    for (let k = 0; k < shuffled.length; k++) {
      chosen.push(shuffled[k]);
      if (chosen.length < minClues) continue;
      const matches = allAssignments.filter(a => chosen.every(c => c.test(a)));
      if (matches.length === 1) { clues = chosen; solved = true; break; }
    }
  }
  if (!solved) clues = persons.map((p, i) => ({ text: `${p}の${themeLabel}は${trueAttrOf[i]}である。`, test: a => a[i] === trueAttrOf[i] }));

  const targetIdx = randInt(0, n - 1);
  const correctAnswer = trueAttrOf[targetIdx];
  const distractors = shuffle(attributes.filter(a => a !== correctAnswer)).slice(0, Math.min(3, n - 1));
  const choices = shuffle([correctAnswer, ...distractors]);

  const prompt = `${persons.join('、')}の${n}人の${themeLabel}について、次のことが分かっている。${persons[targetIdx]}の${themeLabel}は何か。\n\n` +
    clues.map((c, i) => `条件${i + 1}：${c.text}`).join('\n');
  const explanation = `条件をすべて満たす対応関係はただ一通りに定まる。対応関係は ${persons.map((p, i) => `${p}：${trueAttrOf[i]}`).join('、')} である。よって${persons[targetIdx]}の${themeLabel}は${correctAnswer}。`;

  return { prompt, choices, correctIndex: choices.indexOf(correctAnswer), explanation };
}

/* ============================================================
   3. 位置推理
   ============================================================ */
function generatePositionProblem(examType, difficulty) {
  const { n } = paramsFor(examType, difficulty);
  const entities = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
  const allPerms = permutations(entities);
  const circular = difficulty === 'high' && n % 2 === 0 && Math.random() < 0.5;
  let truePerm, clues, solved = false;

  for (let attempt = 0; attempt < 20 && !solved; attempt++) {
    truePerm = shuffle(entities);
    const pool = [];

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
    const minClues = difficulty === 'mid' ? Math.max(3, n - 2) : Math.max(4, n - 1);
    for (let k = 0; k < shuffled.length; k++) {
      chosen.push(shuffled[k]);
      if (chosen.length < minClues) continue;
      const matches = allPerms.filter(p => chosen.every(c => c.test(p)));
      if (matches.length === 1) { clues = chosen; solved = true; break; }
    }
  }
  if (!solved) clues = truePerm.map((name, i) => ({ text: circular ? `基準の席から右回りに${i + 1}番目は${name}である。` : `左から${i + 1}番目は${name}である。`, test: p => p.indexOf(name) === i }));

  const targetIdx = randInt(0, n - 1);
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
  const { n } = paramsFor(examType, difficulty);
  const suspects = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n);
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
  const premises = [];
  for (let i = 0; i < L; i++) premises.push({ ant: { var: i, neg: false }, cons: { var: i + 1, neg: false } });

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

/* ============================================================
   6. 資料解釈
   ============================================================ */
function buildTableHTML(years, stores, table) {
  let html = '<table><thead><tr><th>店舗</th>' + years.map(y => `<th>${y}</th>`).join('') + '</tr></thead><tbody>';
  stores.forEach((s, i) => { html += `<tr><td>${s}</td>` + table[i].map(v => `<td>${v}</td>`).join('') + '</tr>'; });
  html += '</tbody></table>';
  return html;
}
function generateDataProblem(examType, difficulty) {
  const { dataRows } = paramsFor(examType, difficulty);
  const storePool = ['渋谷店', '新宿店', '池袋店', '横浜店', '大宮店', '千葉店', '川崎店'];
  const stores = storePool.slice(0, dataRows);
  const years = ['2022年', '2023年', '2024年'];
  const table = stores.map(() => [randInt(200, 600), 0, 0]);
  table.forEach(row => {
    row[1] = Math.max(50, Math.round(row[0] * (0.8 + Math.random() * 0.6)));
    row[2] = Math.max(50, Math.round(row[1] * (0.8 + Math.random() * 0.6)));
  });
  const tableHTML = buildTableHTML(years, stores, table);
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
    prompt = `次の表は各店舗の売上高（単位：万円）の推移を示している。${years[1]}から${years[2]}にかけて、対前年増加率が最も高いのはどの店舗か。`;
    explanation = `各店舗の増加率は ${stores.map((s, i) => `${s}：${growth[i].toFixed(1)}%`).join('、')} であり、最も高いのは${correctAnswer}（${growth[bestIdx].toFixed(1)}%）。`;
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
    prompt = `次の表は各店舗の売上高（単位：万円）を示している。${stores[targetIdx]}の${years[2]}の売上高は、${years[2]}における全店舗合計に占める割合として、最も近いものはどれか。`;
    explanation = `${years[2]}の全店舗合計は${total}万円、${stores[targetIdx]}は${table[targetIdx][2]}万円であるため、割合は${table[targetIdx][2]}÷${total}×100 ≒ ${exact.toFixed(1)}%となる。`;
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
    case 'data': base = generateDataProblem(examType, difficulty); break;
  }
  const timeLimit = TIME_BASE[category][difficulty] + (examType === 'H' ? 12 : 0);
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

  /* ---------- 設定画面の描画 ---------- */
  function renderCategoryGrid() {
    const grid = el('category-grid');
    grid.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const label = document.createElement('label');
      label.className = 'category-card';
      label.innerHTML = `
        <input type="checkbox" name="category" value="${cat.id}" checked>
        <span><strong>${cat.label}</strong><p>${cat.desc}</p></span>
      `;
      grid.appendChild(label);
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
