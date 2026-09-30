const { test, expect } = require('@playwright/test');

test('typing hint reveals one answer without credit, then settles remaining misses', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/index.html');

  await page.evaluate(() => {
    const controller = new QuizController(null);
    controller.isQuizActive = true;
    controller.quizType = 'TYPING';
    controller.answers = [{ id: 1, content: 'llms.txt', comment: '模型可读文档索引' }, { id: 2, content: '工具', comment: '' }];
    controller.foundAnswers = new Set();
    controller.foundParts = new Map();
    UIRenderer.renderAnswersGrid(controller.answers, controller.foundAnswers, true, controller.foundParts);
    window.quizController = controller;
  });
  await page.locator('#hint-btn').click();

  const result = await page.evaluate(() => {
    const controller = window.quizController;

    return {
      found: Array.from(controller.foundAnswers),
      revealed: Array.from(controller.revealedAnswers),
      score: document.querySelector('#score-display').textContent,
      rendered: document.querySelector('#answer-1').textContent,
    };
  });

  expect(pageErrors).toEqual([]);
  expect(result.found).toEqual([]);
  expect(result.revealed).toEqual([1]);
  expect(result.score).toBe('0/2');
  expect(result.rendered).toContain('llms.txt');
  await page.locator('#hint-btn').click();
  expect(await page.locator('#score-display').textContent()).toBe('0/2');
  expect(await page.locator('#answer-2').textContent()).toContain('工具');
});

test('a v2 hint reveals remaining parts without marking them answered', async ({ page }) => {
  await page.goto('/index.html');

  await page.evaluate(() => {
    const controller = new QuizController(null);
    controller.isQuizActive = true;
    controller.quizType = 'TYPING';
    controller.answers = [{
      id: 7,
      content: '降低成本、提高效率',
      formatVersion: 2,
      parts: [
        { segments: [{ kind: 'required', text: '降低成本' }, { kind: 'context', text: '、' }] },
        { segments: [{ kind: 'required', text: '提高效率' }] },
      ],
    }];
    controller.foundAnswers = new Set();
    controller.foundParts = new Map([[7, new Set([0])]]);
    UIRenderer.renderAnswersGrid(controller.answers, controller.foundAnswers, true, controller.foundParts);
    window.quizController = controller;
  });
  await page.locator('#hint-btn').click();

  const result = await page.evaluate(() => {
    const controller = window.quizController;

    return {
      found: Array.from(controller.foundAnswers),
      revealed: Array.from(controller.revealedAnswers),
      parts: Array.from(controller.foundParts.get(7) || []),
      rendered: document.querySelector('#answer-7').textContent,
    };
  });

  expect(result.found).toEqual([]);
  expect(result.revealed).toEqual([7]);
  expect(result.parts).toEqual([0]);
  expect(result.rendered).toContain('降低成本、提高效率');
});

test('clicking one answer card reveals only that answer without credit', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => {
    const controller = new QuizController(null);
    controller.isQuizActive = true;
    controller.quizType = 'TYPING';
    controller.answers = [{id:1,content:'工具'},{id:2,content:'提示词'}];
    UIRenderer.renderAnswersGrid(controller.answers,controller.foundAnswers,true,controller.foundParts);
    window.quizController = controller;
  });
  await page.locator('#answer-2').hover();
  await page.getByRole('button',{name:'显示答案 2'}).click();
  expect(await page.locator('#answer-1').textContent()).not.toContain('工具');
  expect(await page.locator('#answer-2').textContent()).toContain('提示词');
  expect(await page.locator('#score-display').textContent()).toBe('0/2');
  const state=await page.evaluate(()=>({found:[...window.quizController.foundAnswers],revealed:[...window.quizController.revealedAnswers]}));
  expect(state).toEqual({found:[],revealed:[2]});
});

test('fill blank hint reveals but does not fill or score a blank', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => {
    const controller=new QuizController(null);
    controller.isQuizActive=true;
    controller.quizType='FILL_BLANK';
    controller.fillBlankQuiz={blanksCount:2,blanks:[{correctAnswer:'工具'},{correctAnswer:'提示词'}]};
    controller.renderFillBlankQuiz=()=>{};
    window.quizController=controller;
  });
  await page.locator('#hint-btn').click();
  const state=await page.evaluate(()=>({filled:[...window.quizController.filledBlanks.keys()],revealed:[...window.quizController.revealedBlanks],score:document.querySelector('#score-display').textContent}));
  expect(state).toEqual({filled:[],revealed:[0],score:'0/2'});
});

test('revealed typing answers cannot later become credited matches', async ({ page }) => {
  await page.goto('/index.html');
  const state=await page.evaluate(() => {
    const controller=new QuizController(null);
    controller.isQuizActive=true;
    controller.answers=[{id:1,content:'工具'},{id:2,content:'提示词'}];
    controller.endQuiz=()=>{controller.isQuizActive=false;};
    UIRenderer.renderAnswersGrid(controller.answers,controller.foundAnswers,true,controller.foundParts);
    controller.revealAnswer(1);
    controller.applyAnswerMatches([{answerId:1,partIndices:[0]},{answerId:2,partIndices:[0]}]);
    return {found:[...controller.foundAnswers],revealed:[...controller.revealedAnswers],score:document.querySelector('#score-display').textContent};
  });
  expect(state).toEqual({found:[2],revealed:[1],score:'1/2'});
});

test('typing the last unrevealed answer after a hint completes the quiz without crediting the hint', async ({ page }) => {
  await page.goto('/index.html');
  const state=await page.evaluate(() => {
    const controller=new QuizController(null);
    controller.isQuizActive=true;
    controller.quizType='TYPING';
    controller.answers=[{id:1,content:'工具'},{id:2,content:'提示词'}];
    UIRenderer.renderAnswersGrid(controller.answers,controller.foundAnswers,true,controller.foundParts);
    controller.revealAnswer(1);
    controller.applyAnswerMatches([{answerId:2,partIndices:[0]}]);
    return {active:controller.isQuizActive,found:[...controller.foundAnswers],revealed:[...controller.revealedAnswers],score:document.querySelector('#score-display').textContent,
      resultVisible:document.querySelector('#results-panel').style.display,finalScore:document.querySelector('#final-score').textContent,
      missed:document.querySelector('#missed-answers').textContent};
  });
  expect(state).toEqual({active:false,found:[2],revealed:[1],score:'1/2',resultVisible:'block',finalScore:'1/2',missed:'工具'});
});

test('typing every answer without a hint still completes the quiz', async ({ page }) => {
  await page.goto('/index.html');
  const state=await page.evaluate(() => {
    const controller=new QuizController(null);
    controller.isQuizActive=true;
    controller.quizType='TYPING';
    controller.answers=[{id:1,content:'工具'},{id:2,content:'提示词'}];
    let completions=0;
    controller.endQuiz=()=>{completions++;controller.isQuizActive=false;};
    UIRenderer.renderAnswersGrid(controller.answers,controller.foundAnswers,true,controller.foundParts);
    controller.applyAnswerMatches([{answerId:1,partIndices:[0]}]);
    controller.applyAnswerMatches([{answerId:2,partIndices:[0]}]);
    return {completions,found:[...controller.foundAnswers],revealed:[...controller.revealedAnswers],score:document.querySelector('#score-display').textContent};
  });
  expect(state).toEqual({completions:1,found:[1,2],revealed:[],score:'2/2'});
});

test('clicking a specific empty blank reveals only that blank without credit', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => {
    const controller=new QuizController(null);
    controller.isQuizActive=true;
    controller.quizType='FILL_BLANK';
    controller.fillBlankQuiz={fullText:'甲乙',blanksCount:2,blanks:[
      {startIndex:0,endIndex:1,correctAnswer:'甲'},
      {startIndex:1,endIndex:2,correctAnswer:'乙'},
    ]};
    document.querySelector('#fill-blank-section').style.display='block';
    controller.renderFillBlankQuiz();
    window.quizController=controller;
  });
  await page.locator('.fill-blank-placeholder.empty[data-blank-index="1"]').hover();
  await page.getByRole('button',{name:'显示答案 2'}).click();
  const state=await page.evaluate(()=>({filled:[...window.quizController.filledBlanks.keys()],revealed:[...window.quizController.revealedBlanks],score:document.querySelector('#score-display').textContent}));
  expect(state).toEqual({filled:[],revealed:[1],score:'0/2'});
  expect(await page.locator('.fill-blank-placeholder.revealed[data-blank-index="1"]').textContent()).toContain('乙');
});
