/**
 * QuizController - 测验主控制器
 * 负责管理测验的整个生命周期
 */
class QuizController {
    constructor(quizId) {
        this.quizId = quizId;
        this.quiz = null;
        this.answers = [];
        this.foundAnswers = new Set();
        this.foundParts = new Map(); // answerId -> Set(partIndex)
        this.revealedAnswers = new Set();
        this.timer = null;
        this.isQuizActive = false;
        this.apiBase = '/api';
        this.quizType = 'TYPING'; // TYPING or FILL_BLANK
        this.fillBlankQuiz = null;
        this.filledBlanks = new Map(); // blankIndex -> userAnswer
        this.revealedBlanks = new Set();
        this.settings = this.loadSettings(); // 加载用户设置

        this.groupMode = false;
        this.groupId = null;
        this.isReviewMode = false;
        this.groupQuizzes = []; // 分组中的所有测验
        this.currentQuizIndex = 0; // 当前测验索引
        this.groupProgress = new Map(); // 存储各测验的进度 {quizId -> {foundAnswers, filledBlanks, completed}}
        this.groupScores = new Map();
        this.currentQuizStatus = null;
    }

    // 加载用户设置
    loadSettings() {
        const defaultSettings = {
            darkMode: false,
            showCommentPreview: true,
            ignorePunctuation: true,
            ignoreSpaces: true,
            ignoreCase: true
        };
        const saved = localStorage.getItem('typingquiz_settings');
        if (saved) {
            try {
                const settings = { ...defaultSettings, ...JSON.parse(saved) };
                // 应用暗黑模式
                if (settings.darkMode) {
                    document.documentElement.classList.add('dark-mode');
                } else {
                    document.documentElement.classList.remove('dark-mode');
                }
                return settings;
            } catch (e) {
                console.error('加载设置失败:', e);
            }
        }
        return defaultSettings;
    }

    // 根据设置规范化文本
    normalizeText(text) {
        let result = text;
        if (this.settings.ignorePunctuation) {
            // 移除所有标点符号（中英文标点）
            result = result.replace(/[\p{P}\p{S}]/gu, '');
        }
        if (this.settings.ignoreSpaces) {
            // 输入法可能在中英文之间加入不同 Unicode 空白；匹配时全部忽略。
            result = result.replace(/[\p{White_Space}\uFEFF]/gu, '');
        }
        if (this.settings.ignoreCase) {
            result = result.toLowerCase();
        }
        return result;
    }

    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        try {
            let token = null;
            if (typeof Auth !== 'undefined' && Auth.getToken) {
                token = Auth.getToken();
            }
            if (!token && typeof localStorage !== 'undefined') {
                token = localStorage.getItem('typingquiz_token');
            }
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        } catch (e) {
            // ignore
        }
        return headers;
    }

    ensureFillBlankMeasureEl(textEl) {
        if (!this._fillBlankMeasureEl) {
            const el = document.createElement('span');
            el.className = 'fill-blank-placeholder';
            el.style.position = 'absolute';
            el.style.visibility = 'hidden';
            el.style.left = '-99999px';
            el.style.top = '-99999px';
            el.style.pointerEvents = 'none';
            el.innerHTML = '<span class="fill-blank-main"></span><span class="fill-blank-comment"></span>';
            this._fillBlankMeasureEl = el;
            this._fillBlankMeasureMainEl = el.querySelector('.fill-blank-main');
            this._fillBlankMeasureCommentEl = el.querySelector('.fill-blank-comment');
        }

        if (textEl && this._fillBlankMeasureEl.parentElement !== textEl) {
            textEl.appendChild(this._fillBlankMeasureEl);
        }

        const style = window.getComputedStyle(this._fillBlankMeasureEl);
        this._fillBlankMeasureMarginLeft = parseFloat(style.marginLeft || '0');
        this._fillBlankMeasureMarginRight = parseFloat(style.marginRight || '0');
        const commentStyle = window.getComputedStyle(this._fillBlankMeasureCommentEl);
        this._fillBlankMeasureCommentMarginLeft = parseFloat(commentStyle.marginLeft || '0');
    }

    measureFillBlankBoxWidthPx(textEl, mainText, commentText, includeHash = false) {
        this.ensureFillBlankMeasureEl(textEl);
        const main = mainText || '';
        const comment = commentText ? (includeHash ? ('#' + commentText) : commentText) : '';
        this._fillBlankMeasureMainEl.textContent = main;
        if (comment) {
            this._fillBlankMeasureCommentEl.textContent = comment;
            this._fillBlankMeasureCommentEl.style.display = '';
        } else {
            this._fillBlankMeasureCommentEl.textContent = '';
            this._fillBlankMeasureCommentEl.style.display = 'none';
        }
        let width = this._fillBlankMeasureEl.getBoundingClientRect().width;
        if (comment) {
            width += this._fillBlankMeasureCommentMarginLeft || 0;
        }
        return Math.ceil(width + 2);
    }

    measureFillBlankBoxOuterWidthPx(textEl, mainText, commentText, includeHash = false) {
        const innerWidth = this.measureFillBlankBoxWidthPx(textEl, mainText, commentText, includeHash);
        return innerWidth + this._fillBlankMeasureMarginLeft + this._fillBlankMeasureMarginRight;
    }

    replaceFillBlankWrappers(textEl) {
        if (!textEl) return;
        const wrappers = Array.from(textEl.querySelectorAll('.fill-blank-wrapper'));
        if (wrappers.length === 0) return;

        const textRect = textEl.getBoundingClientRect();
        const style = window.getComputedStyle(textEl);
        const paddingRight = parseFloat(style.paddingRight || '0');
        const paddingLeft = parseFloat(style.paddingLeft || '0');
        const containerLeft = textRect.left + paddingLeft;
        const containerRight = textRect.right - paddingRight;
        const fullLineWidth = Math.max(0, containerRight - containerLeft);

        wrappers.forEach(wrapper => {
            const blankIndex = parseInt(wrapper.getAttribute('data-blank-index') || '0', 10);
            const isFilled = wrapper.getAttribute('data-filled') === '1';
            const mode = wrapper.getAttribute('data-mode') || 'play';
            const state = wrapper.getAttribute('data-state') || '';

            const answerText = decodeURIComponent(wrapper.getAttribute('data-answer') || '');
            const correctText = decodeURIComponent(wrapper.getAttribute('data-correct') || '');
            const comment = decodeURIComponent(wrapper.getAttribute('data-comment') || '');

            const isEmptyPlay = mode === 'play' && !isFilled;
            const baseText = (isEmptyPlay ? correctText : (isFilled ? answerText : correctText)) || '';
            const commentToShow = (mode === 'giveup' || mode === 'revealed' || isFilled) ? comment : '';

            const wrapperRect = wrapper.getBoundingClientRect();
            const availableFirst = Math.max(0, containerRight - wrapperRect.left);
            const minOuterWidth = this.measureFillBlankBoxOuterWidthPx(textEl, '一', '');

            const frag = document.createDocumentFragment();
            let mainIndex = 0;
            let commentIndex = 0;
            let isFirst = true;
            let isFirstSegment = true;

            while (mainIndex < baseText.length || commentIndex < commentToShow.length) {
                const avail = isFirst
                    ? (availableFirst >= minOuterWidth ? availableFirst : fullLineWidth)
                    : fullLineWidth;

                let mainChunk = '';
                let commentChunk = '';
                let includeHash = false;

                if (mainIndex < baseText.length) {
                    let low = 1;
                    let high = baseText.length - mainIndex;
                    let best = 1;
                    while (low <= high) {
                        const mid = Math.floor((low + high) / 2);
                        const part = baseText.slice(mainIndex, mainIndex + mid);
                        const width = this.measureFillBlankBoxOuterWidthPx(textEl, part, '', false);
                        if (width <= avail || avail === 0) {
                            best = mid;
                            low = mid + 1;
                        } else {
                            high = mid - 1;
                        }
                    }

                    mainChunk = baseText.slice(mainIndex, mainIndex + best);
                    mainIndex += best;

                    if (mainIndex >= baseText.length && commentToShow.length > 0) {
                        includeHash = commentIndex === 0;
                        let lowC = 1;
                        let highC = commentToShow.length - commentIndex;
                        let bestC = 0;
                        while (lowC <= highC) {
                            const midC = Math.floor((lowC + highC) / 2);
                            const partC = commentToShow.slice(commentIndex, commentIndex + midC);
                            const width = this.measureFillBlankBoxOuterWidthPx(textEl, mainChunk, partC, includeHash);
                            if (width <= avail || avail === 0) {
                                bestC = midC;
                                lowC = midC + 1;
                            } else {
                                highC = midC - 1;
                            }
                        }

                        if (bestC > 0) {
                            commentChunk = commentToShow.slice(commentIndex, commentIndex + bestC);
                            commentIndex += bestC;
                        }
                    }
                } else {
                    includeHash = commentIndex === 0;
                    let lowC = 1;
                    let highC = commentToShow.length - commentIndex;
                    let bestC = 1;
                    while (lowC <= highC) {
                        const midC = Math.floor((lowC + highC) / 2);
                        const partC = commentToShow.slice(commentIndex, commentIndex + midC);
                        const width = this.measureFillBlankBoxOuterWidthPx(textEl, '', partC, includeHash);
                        if (width <= avail || avail === 0) {
                            bestC = midC;
                            lowC = midC + 1;
                        } else {
                            highC = midC - 1;
                        }
                    }

                    commentChunk = commentToShow.slice(commentIndex, commentIndex + bestC);
                    commentIndex += bestC;
                }

                // 填充模式或作答后：显示实际文本
                const span = document.createElement('span');
                span.className = 'fill-blank-placeholder';
                if (isFilled) {
                    span.classList.add('filled');
                }
                // 未作答时显示为灰色占位
                if (!isFilled && mode === 'play') {
                    span.classList.add('empty');
                }
                // 结算模式下，原本未答出的显示为 missed
                if (mode === 'giveup' && !isFilled) {
                    span.classList.add('missed');
                }
                if (mode === 'revealed') span.classList.add('revealed');

                span.setAttribute('data-blank-index', String(blankIndex));
                span.onclick = () => this.focusFillBlankInput();

                const widthPx = this.measureFillBlankBoxWidthPx(textEl, mainChunk, commentChunk, includeHash);
                span.style.width = widthPx + 'px';
                // 未作答时不显示文本内容，只显示占位样式
                span.textContent = isEmptyPlay ? '' : mainChunk;

                if (isEmptyPlay && isFirstSegment) {
                    const revealButton = document.createElement('button');
                    revealButton.type = 'button';
                    revealButton.className = 'fill-blank-reveal-button';
                    revealButton.setAttribute('aria-label', `显示答案 ${blankIndex + 1}`);
                    revealButton.onclick = event => { event.stopPropagation(); this.revealBlank(blankIndex); };
                    span.appendChild(revealButton);
                }

                if (commentChunk) {
                    const c = document.createElement('span');
                    c.className = 'fill-blank-comment';
                    c.textContent = (includeHash ? '#' : '') + commentChunk;
                    span.appendChild(c);
                }

                const underline = document.createElement('span');
                underline.className = 'fill-blank-underline';
                underline.style.position = 'absolute';
                underline.style.bottom = '3px';
                underline.style.left = '4px';
                underline.style.right = '4px';
                underline.style.borderBottom = `2px solid rgba(255,255,255,${(mode === 'play' && isFilled) || mode === 'giveup' ? '0.3' : '0.5'})`;
                span.appendChild(underline);

                if (!isFirstSegment) {
                    const br = document.createElement('br');
                    br.className = 'fill-blank-segment-break';
                    frag.appendChild(br);
                }

                frag.appendChild(span);
                isFirst = false;
                isFirstSegment = false;
            }

            wrapper.replaceWith(frag);
        });
    }

    /**
     * 初始化测验
     */
    async init() {
        try {
            console.log('[QuizController.init] 开始初始化，quizId:', this.quizId);
            
            // 检查是否是分组模式
            this.checkGroupMode();
            console.log('[QuizController.init] groupMode:', this.groupMode, 'groupId:', this.groupId, 'isReviewMode:', this.isReviewMode);

            if (this.groupMode) {
                // 分组模式
                const storageKey = `groupQuizList_${this.groupId}`;
                const storedList = sessionStorage.getItem(storageKey);
                
                if (storedList) {
                    const quizIds = JSON.parse(storedList);
                    this.groupQuizTotal = quizIds.length;
                    // 确保使用数字进行比较，避免类型不匹配
                    this.currentQuizIndex = quizIds.findIndex(id => Number(id) === Number(this.quizId));
                    this.groupQuizzes = quizIds.map(id => ({ id: Number(id), title: '' }));
                    this.loadQuizTitles(quizIds);
                } else {
                    await this.loadGroupQuizzes();
                    this.groupQuizTotal = this.groupQuizzes.length;
                    this.currentQuizIndex = this.groupQuizzes.findIndex(q => Number(q.id) === Number(this.quizId));
                }

                if (this.currentQuizIndex >= 0) {
                    await this.loadQuizById(this.quizId);
                } else if (this.groupQuizzes.length > 0) {
                    this.currentQuizIndex = 0;
                    await this.loadQuizById(this.groupQuizzes[0].id);
                } else {
                    sessionStorage.removeItem(storageKey);
                    alert('该分组复习任务已全部完成！');
                    window.location.href = 'home.html';
                    return;
                }
            } else if (this.isReviewMode) {
                // 全局复习模式
                const storedList = sessionStorage.getItem('reviewQuizList');
                
                if (storedList) {
                    const quizIds = JSON.parse(storedList);
                    this.reviewQuizTotal = quizIds.length;
                    // 确保使用数字进行比较，避免类型不匹配
                    this.currentQuizIndex = quizIds.findIndex(id => Number(id) === Number(this.quizId));
                    this.groupQuizzes = quizIds.map(id => ({ id: Number(id), title: '' }));
                    this.loadQuizTitles(quizIds);
                } else {
                    await this.loadGlobalReviewQuizzes();
                    this.reviewQuizTotal = this.groupQuizzes.length;
                    this.currentQuizIndex = this.groupQuizzes.findIndex(q => Number(q.id) === Number(this.quizId));
                }

                if (this.currentQuizIndex >= 0) {
                    await this.loadQuizById(this.quizId);
                } else if (this.groupQuizzes.length > 0) {
                    this.currentQuizIndex = 0;
                    await this.loadQuizById(this.groupQuizzes[0].id);
                } else {
                    sessionStorage.removeItem('reviewQuizList');
                    alert('今日复习任务已全部完成！');
                    window.location.href = 'home.html';
                    return;
                }
            } else {
                await this.loadQuizById(this.quizId);
            }

            this.setupEventListeners();
            this.startTimer();
            this.isQuizActive = true;

            // 聚焦输入框
            const input = document.getElementById('answer-input');
            if (input) input.focus();
            console.log('[QuizController.init] 初始化完成');
        } catch (error) {
            console.error('[QuizController.init] 初始化失败:', error);
            alert('加载测验失败,请刷新页面重试');
        }
    }

    /**
     * 检查是否是分组模式
     */
    checkGroupMode() {
        const params = new URLSearchParams(window.location.search);
        this.groupId = params.get('groupId');
        this.groupMode = !!this.groupId;
        this.isReviewMode = params.get('mode') === 'review';
    }

    /**
     * 加载分组测验列表
     * 优先从 sessionStorage 读取原始列表（确保进度显示正确）
     */
    async loadGroupQuizzes() {
        // 首先尝试从 sessionStorage 获取原始列表
        const storageKey = `groupQuizList_${this.groupId}`;
        const storedList = sessionStorage.getItem(storageKey);
        
        if (storedList) {
            // 使用 sessionStorage 中的原始列表
            const quizIds = JSON.parse(storedList);
            this.groupQuizzes = quizIds.map(id => ({ id, title: '' }));
            // 异步加载测验标题（可选）
            this.loadQuizTitles(quizIds);
        } else {
            // 没有存储的列表，从 API 获取
            if (this.isReviewMode || this.groupId === 'ungrouped') {
                // 复习模式或未分组，使用 review API
                const response = await fetch(`${this.apiBase}/review/groups/${this.groupId}/quizzes`, {
                    headers: this.getAuthHeaders()
                });
                if (!response.ok) throw new Error('加载分组复习列表失败');
                const items = await response.json();
                const dueItems = items.filter(item => item.label === 'PENDING_LEARN' || item.label === 'PENDING_REVIEW');
                this.groupQuizzes = dueItems.map(item => ({ id: item.quizId, title: item.quizTitle }));
            } else {
                const response = await fetch(`${this.apiBase}/groups/${this.groupId}/quizzes`, {
                    headers: this.getAuthHeaders()
                });
                if (!response.ok) throw new Error('加载分组测验失败');
                this.groupQuizzes = await response.json();
            }
            
            // 保存到 sessionStorage
            const quizIds = this.groupQuizzes.map(q => q.id);
            sessionStorage.setItem(storageKey, JSON.stringify(quizIds));
        }
        
        if (this.groupQuizzes.length === 0) throw new Error('该分组中没有测验');
    }

    /**
     * 异步加载测验标题
     */
    async loadQuizTitles(quizIds) {
        // 如果有正在进行的请求，中止它们
        if (this.titleAbortController) {
            this.titleAbortController.abort();
        }
        this.titleAbortController = new AbortController();
        
        try {
            for (let i = 0; i < quizIds.length; i++) {
                // 检查是否已中止
                if (this.titleAbortController.signal.aborted) break;
                
                try {
                    const response = await fetch(`${this.apiBase}/quizzes/${quizIds[i]}`, {
                        headers: this.getAuthHeaders(),
                        signal: this.titleAbortController.signal
                    });
                    if (response.ok) {
                        const quiz = await response.json();
                        if (this.groupQuizzes[i]) {
                            this.groupQuizzes[i].title = quiz.title;
                        }
                    }
                } catch (e) {
                    // 静默忽略中止错误和404错误
                    if (e.name !== 'AbortError') {
                        console.debug(`加载测验 ${quizIds[i]} 标题失败:`, e.message);
                    }
                }
            }
        } finally {
            this.titleAbortController = null;
        }
    }

    /**
     * 加载全局待复习测验列表
     * 优先从 sessionStorage 读取原始列表（确保进度显示正确）
     */
    async loadGlobalReviewQuizzes() {
        // 首先尝试从 sessionStorage 获取原始列表
        const storedList = sessionStorage.getItem('reviewQuizList');
        
        if (storedList) {
            // 使用 sessionStorage 中的原始列表
            const quizIds = JSON.parse(storedList);
            this.groupQuizzes = quizIds.map(id => ({ id, title: '' }));
            // 异步加载测验标题
            this.loadQuizTitles(quizIds);
            // 验证列表有效性（异步清理已完成的测验）
            this.validateAndCleanStoredList();
        } else {
            // 没有存储的列表，从 API 获取
            const response = await fetch(`${this.apiBase}/review/quizzes`, {
                headers: this.getAuthHeaders()
            });
            if (!response.ok) throw new Error('加载今日复习列表失败');
            const items = await response.json();
            const dueItems = items.filter(item => item.label === 'PENDING_LEARN' || item.label === 'PENDING_REVIEW');
            this.groupQuizzes = dueItems.map(item => ({ id: item.quizId, title: item.quizTitle }));
            
            // 保存到 sessionStorage
            const quizIds = this.groupQuizzes.map(q => q.id);
            sessionStorage.setItem('reviewQuizList', JSON.stringify(quizIds));
        }
        
        if (this.groupQuizzes.length === 0) throw new Error('今日没有待复习测验');
    }
    
    /**
     * 验证并清理已存储的列表，移除已完成的测验
     */
    async validateAndCleanStoredList() {
        try {
            const response = await fetch(`${this.apiBase}/review/quizzes`, {
                headers: this.getAuthHeaders()
            });
            if (!response.ok) return;
            const items = await response.json();
            const dueItems = items.filter(item => item.label === 'PENDING_LEARN' || item.label === 'PENDING_REVIEW');
            const dueQuizIds = dueItems.map(item => item.quizId);
            
            // 获取当前存储的列表
            const storedList = sessionStorage.getItem('reviewQuizList');
            if (!storedList) return;
            
            const storedIds = JSON.parse(storedList);
            // 只保留仍然有效的测验ID
            const validIds = storedIds.filter(id => dueQuizIds.includes(id));
            
            // 如果有变化，更新存储
            if (validIds.length !== storedIds.length) {
                console.log(`[复习进度] 清理已完成测验: ${storedIds.length} -> ${validIds.length}`);
                sessionStorage.setItem('reviewQuizList', JSON.stringify(validIds));
                // 更新当前列表
                this.groupQuizzes = validIds.map(id => ({ id, title: '' }));
                // 重新渲染进度
                this.renderGroupReviewProgress();
            }
        } catch (e) {
            console.error('验证存储列表失败:', e);
        }
    }

    /**
     * 重置测验UI状态
     */
    resetQuizUI() {
        this.foundAnswers.clear();
        this.foundParts.clear();
        this.revealedAnswers.clear();
        this.filledBlanks.clear();
        this.revealedBlanks.clear();
        
        // 重置输入框
        const input = document.getElementById('answer-input');
        if (input) {
            input.value = '';
            input.disabled = false;
        }
        
        // 重置放弃按钮
        const giveUpBtn = document.getElementById('give-up-btn');
        if (giveUpBtn) giveUpBtn.disabled = false;
        
        // 隐藏结果面板
        const resultsPanel = document.getElementById('results-panel');
        if (resultsPanel) resultsPanel.style.display = 'none';
        
        // 隐藏评级面板（复习模式）
        const ratingPanel = document.getElementById('rating-panel');
        if (ratingPanel) ratingPanel.style.display = 'none';
        
        // 重置反馈消息
        UIRenderer.showFeedback('', '');
    }

    /**
     * 加载填空题数据
     */
    async loadFillBlankQuiz() {
        try {
            const response = await fetch(`${this.apiBase}/fill-blank/quiz/${this.quizId}`, {
                headers: this.getAuthHeaders()
            });
            if (response.ok) {
                this.fillBlankQuiz = await response.json();
                return;
            }
            // API 返回 404，尝试使用测验数据中的填空题信息
            console.warn('填空题详情 API 返回 404，尝试使用测验数据中的信息:', this.quizId);
        } catch (error) {
            console.error('填空题 API 请求失败:', error);
        }
        
        // 尝试使用测验数据中的填空题信息
        if (this.quiz && this.quiz.fillBlankQuiz) {
            this.fillBlankQuiz = this.quiz.fillBlankQuiz;
            console.log('使用测验数据中的填空题信息:', this.fillBlankQuiz);
            return;
        }
        
        // 如果都没有，创建一个基本的填空题数据结构避免崩溃
        console.error('无法加载填空题数据，创建空数据结构');
        this.fillBlankQuiz = {
            quizId: this.quizId,
            fullText: this.quiz?.description || '暂无内容',
            displayText: '___',
            blanksCount: 0,
            blanks: []
        };
    }

    /**
     * 根据ID加载测验
     */
    async loadQuizById(quizId) {
        if (this.timer) this.timer.stop();
        this.quizId = quizId;
        this.foundAnswers.clear();
        this.foundParts.clear();
        this.revealedAnswers.clear();
        this.filledBlanks.clear();
        this.revealedBlanks.clear();

        const quizResponse = await fetch(`${this.apiBase}/quizzes/${this.quizId}`, {
            headers: this.getAuthHeaders()
        });
        if (!quizResponse.ok) throw new Error('测验不存在');
        this.quiz = await quizResponse.json();
        this.quizType = this.quiz.quizType || 'TYPING';

        if (this.quizType === 'FILL_BLANK') {
            await this.loadFillBlankQuiz();
        } else {
            const answersResponse = await fetch(`${this.apiBase}/quizzes/${this.quizId}/answers`, {
                headers: this.getAuthHeaders()
            });
            if (!answersResponse.ok) throw new Error('加载答案失败');
            this.answers = await answersResponse.json();
        }

        this.resetQuizUI();
        this.renderQuizTypeUI();
        this.renderQuizInfo();
        if (this.groupMode || this.isReviewMode) {
            this.renderGroupProgress();
            this.renderGroupReviewProgress(); // 渲染分组复习进度
        }
        this.startTimer();
        this.isQuizActive = true;
        
        // 自动聚焦输入框
        setTimeout(() => {
            const input = document.getElementById('answer-input');
            if (input && !input.disabled) {
                input.focus();
            }
        }, 100);
    }

    renderQuizTypeUI() {
        const answersGrid = document.getElementById('answers-grid');
        const fillBlankSection = document.getElementById('fill-blank-section');
        if (this.quizType === 'FILL_BLANK') {
            if (answersGrid) answersGrid.style.display = 'none';
            if (fillBlankSection) fillBlankSection.style.display = 'block';
            this.renderFillBlankQuiz();
        } else {
            if (answersGrid) {
                answersGrid.style.display = 'grid';
                UIRenderer.renderAnswersGrid(this.answers, this.foundAnswers, this.settings.showCommentPreview, this.foundParts, this.revealedAnswers);
            }
            if (fillBlankSection) fillBlankSection.style.display = 'none';
            UIRenderer.updateScore(this.foundAnswers.size, this.answers.length);
        }
    }

    renderQuizInfo() {
        const titleEl = document.getElementById('quiz-title');
        const descEl = document.getElementById('quiz-description');
        if (titleEl) titleEl.textContent = this.quiz.title;
        if (descEl) descEl.textContent = this.quiz.description || '';
    }

    /**
     * 渲染分组复习进度（如：今日复习: 1/24）
     */
    renderGroupReviewProgress() {
        const progressContainer = document.getElementById('group-review-progress');
        if (!progressContainer) return;
        
        // 只有在分组模式或复习模式下才显示
        if (!this.groupMode && !this.isReviewMode) {
            progressContainer.style.display = 'none';
            return;
        }
        
        // 显示进度容器
        progressContainer.style.display = 'block';
        
        // 计算当前索引和总数
        const total = this.groupQuizzes ? this.groupQuizzes.length : 0;
        let current = 0;
        
        if (this.groupQuizzes && this.quizId) {
            // 找到当前测验在分组中的索引
            const index = this.groupQuizzes.findIndex(q => q.id === parseInt(this.quizId));
            current = index >= 0 ? index + 1 : 0;
        }
        
        // 更新显示
        const currentEl = document.getElementById('group-current-index');
        const totalEl = document.getElementById('group-total-count');
        const textEl = document.getElementById('group-progress-text');
        
        if (currentEl) currentEl.textContent = current;
        if (totalEl) totalEl.textContent = total;
        
        // 添加进度描述文字
        if (textEl) {
            if (this.isReviewMode) {
                textEl.textContent = '今日复习';
            } else if (this.groupMode) {
                textEl.textContent = '分组进度';
            }
        }
    }

    renderGroupProgress() {
        const total = this.quizType === 'FILL_BLANK' 
            ? (this.fillBlankQuiz ? this.fillBlankQuiz.blanksCount : 0)
            : (this.answers ? this.answers.length : 0);
        const found = this.quizType === 'FILL_BLANK' ? this.filledBlanks.size : this.foundAnswers.size;
        const progress = total > 0 ? found / total : 0;
        
        // 更新进度条
        const fillEl = document.getElementById('progress-fill');
        if (fillEl) fillEl.style.width = (progress * 100) + '%';
        
        // 更新分数文本显示
        UIRenderer.updateScore(found, total);
    }

    renderFillBlankQuiz() {
        const textEl = document.getElementById('fill-blank-text');
        if (!this.fillBlankQuiz || !textEl) return;
        const blanks = this.fillBlankQuiz.blanks || [];
        const fullText = this.fillBlankQuiz.fullText || '';

        // 辅助函数：转义 HTML 字符
        const escapeHTML = (str) => {
            return str.replace(/[&<>"']/g, (m) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[m]));
        };

        // 按 startIndex 从小到大排序，确保替换顺序
        const sortedBlanks = [...blanks].sort((a, b) => a.startIndex - b.startIndex);
        
        let result = '';
        let lastIndex = 0;
        
        sortedBlanks.forEach((item, i) => {
            // 拼接并转义填空前的文本片段
            result += escapeHTML(fullText.substring(lastIndex, item.startIndex));
            
            const isFilled = this.filledBlanks.has(i);
            const isRevealed = this.revealedBlanks.has(i);
            const userAnswer = isFilled ? this.filledBlanks.get(i) : '';
            const isCurrent = i === this.currentBlankIndex;
            
            // 构造填空包装器的 HTML (这是我们主动插入的标签，不应被转义)
            const wrapperHTML = this.createFillBlankWrapper(i, item, userAnswer, isFilled, isCurrent, isRevealed);
            result += wrapperHTML;
            
            lastIndex = item.endIndex;
        });
        
        // 拼接并转义剩余的文本片段
        result += escapeHTML(fullText.substring(lastIndex));
        
        // 渲染到页面，并处理换行
        textEl.innerHTML = result.replace(/\n/g, '<div class="manual-break"></div>');
        this.replaceFillBlankWrappers(textEl);
    }

    renderFillBlankQuizForGiveUp(originallyFilledIndices) {
        const textEl = document.getElementById('fill-blank-text');
        if (!this.fillBlankQuiz || !textEl) return;
        const blanks = this.fillBlankQuiz.blanks || [];
        const fullText = this.fillBlankQuiz.fullText || '';

        // 辅助函数：转义 HTML 字符
        const escapeHTML = (str) => {
            return str.replace(/[&<>"']/g, (m) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[m]));
        };

        const sortedBlanks = [...blanks].sort((a, b) => a.startIndex - b.startIndex);
        
        let result = '';
        let lastIndex = 0;
        
        sortedBlanks.forEach((item, i) => {
            result += escapeHTML(fullText.substring(lastIndex, item.startIndex));
            
            const isOriginallyFilled = originallyFilledIndices.has(i);
            const wrapperHTML = this.createFillBlankWrapperForGiveUp(i, item, isOriginallyFilled);
            result += wrapperHTML;
            
            lastIndex = item.endIndex;
        });
        
        result += escapeHTML(fullText.substring(lastIndex));
        
        textEl.innerHTML = result.replace(/\n/g, '<div class="manual-break"></div>');
        this.replaceFillBlankWrappers(textEl);
    }

    /**
     * 创建填空题包装器 HTML（游戏模式）
     */
    createFillBlankWrapper(index, item, userAnswer, isFilled, isCurrent, isRevealed = false) {
        const mode = isRevealed ? 'revealed' : 'play';
        const filled = isFilled ? '1' : '0';
        const state = isCurrent ? 'current' : '';
        const answer = encodeURIComponent(userAnswer || '');
        const correct = encodeURIComponent(item.correctAnswer || '');
        const comment = encodeURIComponent(item.comment || '');
        
        return `<span class="fill-blank-wrapper" data-mode="${mode}" data-filled="${filled}" data-state="${state}" data-blank-index="${index}" data-answer="${answer}" data-correct="${correct}" data-comment="${comment}"></span>`;
    }

    /**
     * 创建填空题包装器 HTML（放弃模式）
     */
    createFillBlankWrapperForGiveUp(index, item, isOriginallyFilled) {
        const mode = 'giveup';
        const filled = isOriginallyFilled ? '1' : '0';
        const wasEmpty = !isOriginallyFilled ? '1' : '0';
        const correct = encodeURIComponent(item.correctAnswer || '');
        const comment = encodeURIComponent(item.comment || '');
        
        return `<span class="fill-blank-wrapper" data-mode="${mode}" data-filled="${filled}" data-was-empty="${wasEmpty}" data-blank-index="${index}" data-answer="${correct}" data-correct="${correct}" data-comment="${comment}"></span>`;
    }

    handleInput(input) {
        if (!input || input.trim() === '') return;
        if (this.quizType === 'FILL_BLANK') {
            this.handleFillBlankInput(input.trim());
        } else {
            this.checkAnswer(input);
        }
    }

    handleFillBlankInput(userAnswer) {
        const blanks = this.fillBlankQuiz.blanks || [];
        const normalizedUserAnswer = this.normalizeText(userAnswer);
        
        for (let i = 0; i < blanks.length; i++) {
            if (this.filledBlanks.has(i) || this.revealedBlanks.has(i)) continue;
            
            const normalizedCorrectAnswer = this.normalizeText(blanks[i].correctAnswer);
            
            if (normalizedUserAnswer === normalizedCorrectAnswer) {
                this.filledBlanks.set(i, userAnswer);
                UIRenderer.showFeedback('正确!', 'success');
                this.clearInput();
                this.renderFillBlankQuiz();
                this.updateFillBlankScore();
                if (this.filledBlanks.size + this.revealedBlanks.size === blanks.length) this.endQuiz();
                return;
            }
        }
    }

    updateFillBlankScore() {
        const found = this.filledBlanks.size;
        const total = this.fillBlankQuiz ? this.fillBlankQuiz.blanksCount : 0;
        UIRenderer.updateScore(found, total);
        this.renderGroupProgress();
    }

    revealAnswer(answerId) {
        if (!this.isQuizActive || this.quizType !== 'TYPING') return false;
        const answer = this.answers.find(item => item.id === answerId);
        if (!answer || this.foundAnswers.has(answerId) || this.revealedAnswers.has(answerId)) return false;
        this.revealedAnswers.add(answerId);
        UIRenderer.highlightAnswer(answer, this.foundAnswers, this.foundParts, this.settings.showCommentPreview, this.revealedAnswers);
        UIRenderer.showFeedback('已显示答案，不计分', 'hint');
        this.renderGroupProgress();
        if (this.foundAnswers.size + this.revealedAnswers.size === this.answers.length) this.endQuiz();
        return true;
    }

    revealBlank(index) {
        if (!this.isQuizActive || this.quizType !== 'FILL_BLANK') return false;
        const blank = this.fillBlankQuiz?.blanks?.[index];
        if (!blank || this.filledBlanks.has(index) || this.revealedBlanks.has(index)) return false;
        this.revealedBlanks.add(index);
        this.renderFillBlankQuiz();
        this.updateFillBlankScore();
        UIRenderer.showFeedback(`已显示答案：${blank.correctAnswer}（不计分）`, 'hint');
        if (this.filledBlanks.size + this.revealedBlanks.size === this.fillBlankQuiz.blanks.length) this.endQuiz();
        return true;
    }

    async endQuiz(isGiveUp = false) {
        if (!this.isQuizActive) return;
        this.isQuizActive = false;
        if (this.timer) this.timer.stop();

        const input = document.getElementById('answer-input');
        if (input) { input.disabled = true; input.blur(); }

        const timeElapsed = this.timer ? this.timer.getTimeElapsed() : 0;
        const total = this.quizType === 'FILL_BLANK' ? (this.fillBlankQuiz ? this.fillBlankQuiz.blanksCount : 0) : (this.answers ? this.answers.length : 0);
        const found = this.quizType === 'FILL_BLANK' ? (this.filledBlanks ? this.filledBlanks.size : 0) : (this.foundAnswers ? this.foundAnswers.size : 0);
        const accuracy = total > 0 ? Math.round((found / total) * 100) : 0;

        const stats = { quizId: this.quizId, found, total, accuracy, timeElapsed, isGiveUp, quizType: this.quizType };
        let missedAnswers = [];
        if (this.quizType === 'FILL_BLANK') {
            missedAnswers = this.fillBlankQuiz.blanks.filter((_, i) => !this.filledBlanks.has(i)).map(b => ({ content: b.correctAnswer, comment: b.comment }));
        } else {
            missedAnswers = this.answers.filter(a => !this.foundAnswers.has(a.id));
        }

        if (isGiveUp) {
            if (this.quizType === 'FILL_BLANK') this.renderFillBlankQuizForGiveUp(new Set(this.filledBlanks.keys()));
            else UIRenderer.showAllAnswers(this.answers, this.foundAnswers, this.foundParts, this.settings.showCommentPreview);
        }

        UIRenderer.showResults(stats, missedAnswers, this.answers, this.foundAnswers, this.foundParts, this.settings.showCommentPreview);
        if (this.isReviewMode && typeof showRatingPanel === 'function') {
            showRatingPanel();
        }
        this.saveToLocalHistory(stats);
    }

    async saveRecordToServer(stats) {
        try {
            await fetch(`${this.apiBase}/quizzes/${this.quizId}/record`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ score: stats.found, totalScore: stats.total, timeElapsed: stats.timeElapsed, accuracy: stats.accuracy, isGiveUp: stats.isGiveUp })
            });
        } catch (e) { console.error('保存记录失败'); }
    }

    saveToLocalHistory(stats) {
        const history = JSON.parse(localStorage.getItem('quiz_history') || '[]');
        history.unshift({ quizId: stats.quizId, title: this.quiz ? this.quiz.title : '未知', accuracy: stats.accuracy, time: UIRenderer.formatTime(stats.timeElapsed), timestamp: Date.now() });
        localStorage.setItem('quiz_history', JSON.stringify(history.slice(0, 20)));
    }

    async loadQuizStatus() {
        try {
            const res = await fetch(`${this.apiBase}/review/quizzes/${this.quizId}/status`, { headers: this.getAuthHeaders() });
            if (res.ok) {
                this.currentQuizStatus = await res.json();
                this.updateRatingIntervals(this.currentQuizStatus);
            }
        } catch (e) { console.error('加载状态失败'); }
    }

    updateRatingIntervals(status) {
        const intervals = this.calculateIntervals(status);
        const selectors = { 1: '.rating-again .interval', 2: '.rating-hard .interval', 3: '.rating-good .interval', 4: '.rating-easy .interval' };
        for (let r in selectors) {
            const el = document.querySelector(selectors[r]);
            if (el) el.textContent = intervals[r];
        }
    }

    calculateIntervals(status) {
        const status_type = status.status;
        const ease = status.easeFactor || 2500;
        const currentInterval = status.intervalDays || 0;
        const learningStep = status.learningStep || 0;
        const MAX_INTERVAL = 365;
        let intervals = {};
        if (status_type === 'NEW' || status_type === 'LEARNING' || status_type === 'RELEARNING') {
            if (learningStep === 0) intervals = { 1: '<10m', 2: '<10m', 3: '10m', 4: '1d' };
            else if (learningStep === 1) intervals = { 1: '<10m', 2: '10m', 3: '1h', 4: '1d' };
            else intervals = { 1: '<10m', 2: '1h', 3: '1d', 4: '4d' };
        } else {
            const format = (d) => d >= 1 ? Math.round(d) + 'd' : Math.round(d * 24) + 'h';
            intervals[1] = '<10m';
            intervals[2] = format(Math.min(MAX_INTERVAL, Math.max(1, currentInterval * 1.2)));
            intervals[3] = format(Math.min(MAX_INTERVAL, Math.max(1, currentInterval * ease / 1000)));
            intervals[4] = format(Math.min(MAX_INTERVAL, Math.max(1, currentInterval * ease / 1000 * 1.3)));
        }
        return intervals;
    }

    setupEventListeners() {
        const input = document.getElementById('answer-input');
        if (input) input.addEventListener('input', (e) => { if (this.isQuizActive) this.handleInput(e.target.value); });
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) restartBtn.addEventListener('click', () => location.reload());
        
        // 添加键盘快捷键：Delete键放弃测验
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.isQuizActive) {
                e.preventDefault();
                this.giveUp();
            }
        });
        
        if (this.groupMode || this.isReviewMode) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); this.navigatePrevQuiz(); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); this.navigateNextQuiz(); }
            });
        }
    }

    navigatePrevQuiz() {
        if (this.currentQuizIndex > 0) {
            this.currentQuizIndex--;
            this.loadQuizById(this.groupQuizzes[this.currentQuizIndex].id);
        }
    }

    navigateNextQuiz() {
        if (this.currentQuizIndex < this.groupQuizzes.length - 1) {
            this.currentQuizIndex++;
            this.loadQuizById(this.groupQuizzes[this.currentQuizIndex].id);
        }
    }

    clearInput() {
        const input = document.getElementById('answer-input');
        if (input) {
            // 检查是否在输入法组合中，如果是则等待组合结束
            if (input.isComposing) {
                input.addEventListener('compositionend', () => {
                    this._doClearInput(input);
                }, { once: true });
            } else {
                this._doClearInput(input);
            }
        }
        setTimeout(() => UIRenderer.showFeedback('', ''), 1000);
    }

    _doClearInput(input) {
        // 使用 requestAnimationFrame 确保在渲染帧开始时清空
        requestAnimationFrame(() => {
            input.value = '';
            // 显式触发 input 事件，确保监听器感知变化
            input.dispatchEvent(new Event('input', { bubbles: true }));
            // 再次使用 setTimeout 确保在所有事件处理完成后二次清空
            setTimeout(() => {
                if (input.value !== '') {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                input.focus();
            }, 0);
        });
    }

    startTimer() {
        const timeLimit = this.quiz.timeLimit;
        this.timer = new TimerModule(timeLimit, () => this.endQuiz());
        this.timer.start();
    }

    giveUp() {
        this.endQuiz(true);
    }

    async checkAnswer(input) {
        // 先在前端进行本地验证，应用用户设置
        const normalizedInput = this.normalizeText(input);
        if (!normalizedInput) {
            UIRenderer.showFeedback('当前设置会忽略全部输入，请关闭忽略标点', 'error');
            this.clearInput();
            return;
        }
        const localMatches = [];
        for (const answer of this.answers) {
            const partCount = this.getAnswerPartCount(answer);
            let partIndices = [];
            if (normalizedInput === this.normalizeText(answer.content)) {
                partIndices = Array.from({ length: partCount }, (_, index) => index);
            } else if (answer.formatVersion === 2 && Array.isArray(answer.parts)) {
                const requiredContent = answer.parts
                    .flatMap(part => (part.segments || [])
                        .filter(segment => segment.kind === 'required')
                        .map(segment => segment.text))
                    .join('');
                const matchedWholeRequired = requiredContent
                    && normalizedInput === this.normalizeText(requiredContent);
                if (matchedWholeRequired) {
                    partIndices = Array.from({ length: partCount }, (_, index) => index);
                }
                if (!matchedWholeRequired) {
                    answer.parts.forEach((part, index) => {
                        const required = (part.segments || [])
                            .filter(segment => segment.kind === 'required')
                            .map(segment => segment.text).join('');
                        if (required && normalizedInput === this.normalizeText(required)) partIndices.push(index);
                    });
                }
            }
            if (partIndices.length > 0) localMatches.push({ answerId: answer.id, partIndices });
        }
        if (localMatches.length > 0) {
            this.applyAnswerMatches(localMatches);
            return;
        }
        
        // 如果前端验证未通过，尝试后端验证（保持原有逻辑）
        try {
            const response = await fetch(`${this.apiBase}/answers/validate`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    quizId: this.quizId,
                    input: input,
                    ignorePunctuation: this.settings.ignorePunctuation,
                    ignoreSpaces: this.settings.ignoreSpaces,
                    ignoreCase: this.settings.ignoreCase
                })
            });
            const result = await response.json();
            if (result.valid) {
                const matches = Array.isArray(result.matches) && result.matches.length > 0
                    ? result.matches
                    : [{ answerId: result.answerId, partIndices: [0] }];
                this.applyAnswerMatches(matches);
            }
        } catch (error) {
            console.error('验证答案失败:', error);
        }
    }

    getAnswerPartCount(answer) {
        return answer.formatVersion === 2 && Array.isArray(answer.parts) && answer.parts.length > 0
            ? answer.parts.length : 1;
    }

    applyAnswerMatches(matches) {
        let newlyMatched = 0;
        let newlyCompleted = 0;
        const affectedAnswers = new Set();
        for (const match of matches) {
            const answer = this.answers.find(item => item.id === match.answerId);
            if (!answer) continue;
            if (this.revealedAnswers.has(answer.id)) continue;
            const partIndices = Array.isArray(match.partIndices) ? match.partIndices : [0];
            const found = this.foundParts.get(answer.id) || new Set();
            for (const partIndex of partIndices) {
                if (!found.has(partIndex)) {
                    found.add(partIndex);
                    newlyMatched++;
                }
            }
            this.foundParts.set(answer.id, found);
            if (found.size >= this.getAnswerPartCount(answer) && !this.foundAnswers.has(answer.id)) {
                this.foundAnswers.add(answer.id);
                newlyCompleted++;
            }
            affectedAnswers.add(answer.id);
        }
        for (const answerId of affectedAnswers) {
            const answer = this.answers.find(item => item.id === answerId);
            if (answer) UIRenderer.highlightAnswer(answer, this.foundAnswers, this.foundParts, this.settings.showCommentPreview, this.revealedAnswers);
        }
        UIRenderer.updateScore(this.foundAnswers.size, this.answers.length);
        if (newlyMatched === 0) UIRenderer.showFeedback(matches.some(match => this.revealedAnswers.has(match.answerId)) ? '答案已显示，不计分' : '已回答', 'duplicate');
        else UIRenderer.showFeedback(newlyCompleted > 0 ? '正确!' : '答对一个要点', 'success');
        this.clearInput();
        this.renderGroupProgress();
        if (this.foundAnswers.size + this.revealedAnswers.size === this.answers.length) {
            this.endQuiz();
        }
    }
}
